# Streaming puzzles: operating on incomplete information

Every streaming bug that is not a plumbing bug is this bug: **you assumed a chunk boundary lines up
with a meaning boundary.** It does not. Ever.

Ten characters of input can arrive as one chunk of 10, two of 5, ten of 1, or `[3, 1, 6]`. A
delimiter can be split down the middle. A UTF-8 grapheme can be split down the middle. Your
transform must produce identical output for all of those splits, and it must do so without ever
seeing the whole input.

## The two questions

For every byte that arrives, a transform answers two questions:

1. **Do I now know something downstream can act on?** If yes, emit it _now_. Latency is the entire
   reason you are writing a stream.
2. **Could more input change what I already think I know?** If yes, retain — do not emit.

Everything below is machinery for answering those two questions cheaply.

## The residue pattern

The workhorse for delimiter-oriented work. Hold a buffer, consume every _complete_ unit out of it,
keep the incomplete tail, and handle end-of-input as its own case.

```ts
/** Splits a text stream into complete lines, newline stripped. */
export function lineTransform(): TransformStream<string, string> {
  let residue = '';
  return new TransformStream({
    transform(chunk, controller) {
      residue += chunk;
      let newline = residue.indexOf('\n');
      while (newline >= 0) {
        controller.enqueue(residue.slice(0, newline));
        residue = residue.slice(newline + 1);
        newline = residue.indexOf('\n');
      }
      // Whatever is left is a prefix of a line we have not seen the end of.
    },
    flush(controller) {
      // End of input is a line boundary. Forgetting this drops the last line
      // whenever the producer does not end with a trailing newline — and LLMs
      // frequently do not.
      if (residue.length > 0) controller.enqueue(residue);
    },
  });
}
```

Three things generalize from this:

- **Loop, don't `if`.** One chunk can complete several units. A single `indexOf` per chunk silently
  serializes a burst.
- **`flush()` is a real state, not cleanup.** "End of input" is a token in your grammar. Decide
  explicitly whether a trailing partial is valid output or an error, and test it.
- **Retain the minimum.** With a multi-character delimiter you must keep at most
  `delimiter.length - 1` characters of tail, not the whole buffer. `extractFrontmatter` recognizes
  `---` only as a complete line and still holds only the current line.

## Normalization is not boundary-safe

"Retain the minimum" is about matching delimiters. There is a second, subtler case: **a character
whose meaning depends on the character after it.** Normalizing it eagerly, per chunk, invents
structure that was not in the input.

The canonical instance is CRLF. A `\r` at the end of a chunk is either a lone CR or the first half of
a `\r\n` — and you cannot tell until the next chunk arrives:

```ts
// WRONG — per-chunk normalization. Given `"...\r"` then `"\n\r\n"`, the lone-CR rule rewrites the
// trailing `\r` to `\n`, the next chunk starts with `\n`, and you have invented a `\n\n` separator.
residue += chunk.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

// RIGHT — hold the ambiguous character back until the next chunk disambiguates it.
let incoming = pendingCR ? `\r${chunk}` : chunk;
pendingCR = false;
if (!final && incoming.endsWith('\r')) {
  incoming = incoming.slice(0, -1);
  pendingCR = true;
}
residue += incoming.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
```

At end of input the ambiguity resolves the other way: nothing follows, so a held `\r` is a lone CR.

This is a real bug that shipped into a first draft of this repo's SSE decoder and produced phantom
event boundaries only when a frame separator straddled a chunk. The generalization: **if a rewrite
depends on lookahead, it must be driven by the residue, not applied to the incoming chunk.** Other
instances are surrogate pairs, combining marks, and any escape sequence whose terminator can be
split. Multi-byte UTF-8 is the same problem one layer down — which is why you decode bytes with
`TextDecoderStream` and never `new TextDecoder().decode(value)` per chunk.

The one-character-at-a-time split test below catches every one of these. That is what it is for.

## Bound every buffer

A retained buffer is an unbounded memory hole if the terminator never arrives — and against an LLM,
sometimes it never arrives. Cap it and fail loudly.

`extractFrontmatter` does exactly this with `maxHeaderChars` (65536 by default): it charges every
consumed header character against the cap and throws once exceeded, rather than buffering a runaway
response until the process dies.

If your transform can retain without a hard bound, you have written a leak.

## The suspendable-generator pattern

The residue pattern gets ugly fast once the grammar has nesting or state. Then you want to write the
parser as if it had the whole input, and let the _driver_ handle the boundaries.

That is how `parseJSON` and `parseXML` are built. The parser is a plain recursive-descent generator.
When it needs a character it does not have, it `yield`s a "need more tokens" signal. The driver
returns from `transform()`, the next chunk arrives, and the generator resumes on the exact line it
suspended on — with its call stack, its loop counters, and its position in the grammar intact.

```ts
function* parseValue(io) {
  while (io.inputExhausted()) {
    io.retainFrom(io.pos());
    yield io.waitForMoreTokens(); // suspend here; resume here
  }
  const ch = io.peek();
  // ...ordinary, boundary-free parsing code from here on
}
```

The driver keeps an append-only token buffer, a cursor, and a `retainedFrom` watermark, then
periodically compacts everything before the watermark out of memory. Yielded values that are not
signals are enqueued as output chunks.

Why this matters: **the combinatorial explosion of chunk splits collapses into one linear code
path.** There is no "what if the chunk ended here" case analysis, because there is no code that can
observe where a chunk ended. Every split produces the same sequence of generator steps.

Reach for this when your grammar has nesting, recursion, or more than about two states. Reach for
the residue pattern when it is genuinely just delimiters.

## Emit early, and emit partials

The instinct to wait for a complete value is usually wrong on an LLM stream. A tool call with a 2 KB
`text` argument is a 2 KB pause if you wait for the closing quote.

```ts
parseJSON({ emitPartialStrings: true }); // onPartialLiteralValue as the string grows
parseXML({ textMode: 'delta' }); // onText per chunk instead of per text run
```

The corresponding downstream rule: a partial value is a **snapshot, not an append**. `jsonToJSObject`
re-emits the same live accumulator on every change, so downstream code overwrites — it does not
concatenate. Copy anything you retain past the current tick.

## Testing chunk boundaries

A test that feeds one chunk tests nothing about streaming. Pathological splits are where the bugs
are, and they are cheap to write:

```ts
/** Same input, every split, same output. */
function splits(input: string): string[][] {
  return [
    [input], // one chunk
    input.split(''), // one character at a time
    [input.slice(0, 1), input.slice(1)], // split immediately after the first char
    [input.slice(0, -1), input.slice(-1)], // split just before the last char
  ];
}

for (const chunks of splits(SAMPLE)) {
  expect(await collect(arrayStream(chunks).pipeThrough(subjectTransform()))).toEqual(EXPECTED);
}
```

Then add targeted splits **inside** each delimiter and each token your grammar cares about — that is
where real failures live. Splitting mid-word inside a frontmatter header (`'---\nbehav'`,
`'ior: reply\n---\n...'`) catches bugs that no whole-chunk test will.

Always include: input ending exactly at a delimiter, input ending one character short of one, and
empty input.
