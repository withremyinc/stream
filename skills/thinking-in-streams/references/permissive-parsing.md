# One path: be permissive, and never parse twice

## The anti-pattern

The single most common thing agents write, and the single most wrong:

```ts
// WRONG — two parsers, two renderers, two sources of truth.
let buffer = '';
for await (const delta of llmStream) {
  buffer += delta;
  renderOptimistically(delta); // path 1: streaming display
}
const parsed = JSON.parse(buffer); // path 2: the "real" parse
commit(parsed); // ...and a second renderer, from a second shape
```

It looks responsible. It is not. It costs you:

- **A jumpscare.** The streamed render and the committed render are produced by different code, so
  they differ, and the user watches the UI snap at the end.
- **Twice the code**, forever, including twice the tests and twice the edge cases.
- **Guaranteed drift.** Two implementations of "what does this response mean" always diverge. The
  bug reports will be about the difference, and they will be miserable to reproduce.
- **A cliff.** `JSON.parse` throws on the truncated or trailing-comma output an LLM produces
  routinely, so the whole response is discarded after the user already watched it stream in.

## The principle

**The stream is the parse.** There is one parser, it runs incrementally, and the final value is
simply its last emission. Nothing is re-derived at the end.

```ts
// RIGHT — one parser. The last snapshot is the committed value.
const parsed = stream
  .pipeThrough(parseJSON({ emitPartialStrings: true }))
  .pipeThrough(jsonToJSObject());
// render every snapshot; commit the last one
```

This is why `jsonToJSObject()` emits on every change rather than once at the end. Its final emission
_is_ the completed document — so a consumer that renders every snapshot has already rendered the
committed state by the time the stream closes. There is nothing left to do.

Where a pipeline does provisional work and then a canonical write, the handoff should say so out
loud: reuse the parser snapshot that drove the provisional work rather than reparsing the completed
response with `JSON.parse`. Stash it from `flush()` and hand it to the canonical write.

## Be permissive with what you accept

LLM output is malformed constantly: truncation mid-token, trailing commas, stray prose, comments,
unbalanced brackets, a code fence you did not ask for. A parser that rejects on any of these throws
away a response the user already watched arrive.

Imagine if HTML rejected a file instead of healing it. The web works because parsers repair.

`parseJSON` is built this way, and it is the model to copy:

- **Errors are chunks, not exceptions.** It emits `{ type: 'onError', error: ParseErrorCode }` into
  the output stream and _keeps parsing_. The consumer decides whether that error is fatal; the
  parser does not decide for it.
- **Panic-mode recovery.** On a syntax error it skips to the next synchronizing token — `,`, `}`,
  `]` — and resumes at the enclosing production. One bad property does not poison the document.
- **JSONC tolerance.** Comments and trailing commas parse without complaint.
- **Truncation yields data.** An unterminated string keeps its last partial value instead of being
  discarded, because a partial value is real information.

Apply the same posture to your own transforms:

- Throw only when there is genuinely no meaningful continuation (`extractFrontmatter` throws when the
  opening delimiter is absent — there is no document to interpret). Otherwise emit an error chunk and
  carry on.
- Validate permissively mid-stream. Use a schema that accepts partial shapes and drop what does not
  parse _yet_, rather than treating incompleteness as failure:

  ```ts
  filterMap(function readPartialInput(snapshot: unknown) {
    const parsed = PartialInputSchema.safeParse(snapshot);
    return parsed.success ? toDomain(parsed.data) : null; // not-yet-valid is not invalid
  });
  ```

  Each snapshot that does not yet satisfy the schema is simply skipped, and the first one that does
  starts rendering.

## Where a second pass _is_ legitimate

Being permissive about parsing is not the same as being permissive about side effects. Gate the
**effect**, not the parse:

- Provisional/optimistic writes stream freely; the canonical write happens once at the end — but it
  is fed by the **same** final snapshot the streaming path produced, not by a fresh parse.
- Business invariants ("a reply must have a non-empty body") belong in `flush()`, checked against the
  state the stream already accumulated — not in a separate validation pass over a re-read buffer.

The test is simple: if the same bytes get interpreted twice by two different pieces of code, it is
wrong. If they are interpreted once and then _acted on_ at two different confidence levels, that is
fine.

## Deleting a trailing re-parse: move it in, don't drop it

The trailing re-parse always has to go — that part is not in question. What matters is _how_ it goes,
because "delete it" has two very different implementations:

- **Drop it**, and rely on what the stream already emitted.
- **Promote it**: make the same scan an incremental stage inside the chain.

Both leave you with one parse path. Only the second is safe when the re-parse recovers something the
streamed events do not already carry. So before dropping, answer one question: **does every code path
through this pipeline emit that information as events?**

A real example. Research results streamed citations as tagged provider events, and after the stream
finished the code re-scanned the accumulated Markdown for links. That looks like pure duplication —
and for _external_ research it was. But the internal provider always returned `citations: []`, so on
internal runs the Markdown scan was the **only** source of citations. Dropping it would have silently
removed every one of them, on a path with no test covering the difference.

Promoting it fixed both problems at once: the scan now runs on the text deltas as they arrive, so
citations stream in with the prose instead of appearing in a lump at the end, and nothing is re-read
after the stream closes.

That is the general shape. A trailing parse is usually a stage that was written in the wrong place,
not work that is genuinely redundant — so reach for promotion first and drop only when you have
checked that the events already carry it, everywhere.
