# `@withremyinc/stream` — API index

Everything here is Web Streams-native. `TransformStream` in, `TransformStream` out; sources are
real `ReadableStream`s. Nothing wraps or hides the platform types, so you can always drop back to
`.pipeThrough()` / `.pipeTo()` on any value the library hands you.

ESM-only, Node 18+. This document describes **2.0.0**.

```ts
import { arrayStream, collect, map, parseJSON } from '@withremyinc/stream';
```

## Before you hand-roll anything, check this table

| You are about to write                                               | Use instead                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `new TransformStream({ transform(c, ctrl) { ctrl.enqueue(f(c)) } })` | `map(f)`                                                          |
| ...with a conditional `enqueue`                                      | `filter(p)` — or `filterMap(f)` when you map and drop in one step |
| ...that enqueues 0..n per chunk                                      | `flatMap(f)`                                                      |
| A running accumulator emitted per chunk                              | `scan(reducer, init)`                                             |
| An accumulator emitted once at the end                               | `reduce(reducer, init)`                                           |
| `let buf = ''` + `buf += chunk` + emit on flush                      | `toString()` (strings) or `toArray()` (anything)                  |
| A counter that stops the stream after N                              | `take(n)` / `drop(n)` / `takeLast(n)`                             |
| A tap for logging/side effects                                       | `forEach(fn)`                                                     |
| `for await (const c of stream) arr.push(c)`                          | `collect(stream)`                                                 |
| ...joining strings                                                   | `collectToString(stream)`                                         |
| ...keeping only the first/last                                       | `collectFirst(stream)` / `collectLast(stream)`                    |
| An array turned into a stream (usually in tests)                     | `arrayStream(items)`                                              |
| Chaining N transforms into one reusable unit                         | `pipeThrough(a(), b(), c())`                                      |
| Interleaving several streams                                         | `merge([...])`, or `mergeKeyed({...})` to keep the source label   |
| Running streams back to back                                         | `concat([...])`                                                   |
| `stream.tee()` + manual rejoin                                       | `tee((a, b) => merge([a, b]))` — independent branches only        |
| Feeding a sub-pipeline while forwarding downstream                   | `arrayStream([chunk]).pipeTo(w, { preventClose: true })`          |
| An incremental JSON parser                                           | `parseJSON()`                                                     |
| Rebuilding a JS value from those events                              | `jsonToJSObject()`                                                |
| An incremental XML parser                                            | `parseXML()`                                                      |
| Pulling `<tag>` islands out of prose                                 | `extractXML({ allowTags })`                                       |
| Pulling a ` ```json ` fence body out of prose                        | `extractDelimiter({ allowLanguages })`                            |
| Splitting `---` frontmatter from a body                              | `extractFrontmatter()`                                            |

## Sources

```ts
arrayStream<T>(array: T[]): ReadableStream<T>
```

## Transforms

All return `TransformStream`. Mappers/predicates may be sync or async and receive `(chunk, index)`.

```ts
map<T, U>(mapper): TransformStream<T, U>
filter<T>(predicate): TransformStream<T, T>
filterMap<T, U>(mapper): TransformStream<T, NonNullable<U>>   // drops only nullish
flatMap<T, U>(mapper): TransformStream<T, U>                   // mapper -> iterable | async iterable | value
scan<T, U>(reducer, initialValue): TransformStream<T, U>       // emits every intermediate accumulator
reduce<T, U>(reducer, initialValue): TransformStream<T, U>     // emits once, on completion
take<T>(limit = 1): TransformStream<T, T>
takeLast<T>(count = 1): TransformStream<T, T>
drop<T>(limit): TransformStream<T, T>
forEach<T>(fn): TransformStream<T, T>                          // side effect, chunk passes through
some<T>(predicate): TransformStream<T, boolean>                // emits once
every<T>(predicate): TransformStream<T, boolean>               // emits once
find<T>(predicate): TransformStream<T, T | undefined>          // emits once
toArray<T>(): TransformStream<T, T[]>                          // emits once
toString(): TransformStream<string, string>                    // emits once
```

`some` / `every` / `find` / `reduce` / `toArray` / `toString` emit a single chunk on completion —
pair them with `collectFirst`, not `collect`.

## Combinators

```ts
merge<T>(streams: ReadableStream<T>[]): ReadableStream<T>
mergeKeyed<V>(obj: { [K in keyof V]: ReadableStream<V[K]> }): ReadableStream<Partial<V>>
concat<T>(streams: ReadableStream<T>[]): ReadableStream<T>
pipeThrough<In, Out>(...streams: TransformStream[]): TransformStream<In, Out>
tee<T0, T1>(cb: (b1: ReadableStream<T0>, b2: ReadableStream<T0>) => ReadableStream<T1>): TransformStream<T0, T1>
```

`mergeKeyed` is the one to reach for when you fan several sources into one pipeline and downstream
needs to know which is which — it produces `{ letters: 'a' }` / `{ numbers: 1 }` rather than bare
values.

`merge` and `mergeKeyed` pull on downstream demand instead of draining their inputs eagerly. They
keep reads pending across active sources and emit whichever source becomes ready first, so an idle
source does not block the others. Cancellation and source errors propagate to sibling readers.

`pipeThrough` composes its stages with native stream plumbing. A thrown stage error rejects the
consumer, and downstream cancellation propagates through the composition.

Do not confuse merge backpressure with pacing between `tee` branches. Native `tee()` pulls whenever
either branch has demand, so a fast branch can still let a slow sibling fall behind. If you need a
side effect sequenced against forwarding, see rule 3 in the skill; `tee` is the wrong tool.

## Collectors

These consume the stream and return a promise. They are the **edge** of a pipeline, not a step in
one — if you find yourself collecting and then re-streaming, delete both.

```ts
collect<T>(stream): Promise<T[]>
collectToString(stream): Promise<string>
collectFirst<T>(stream): Promise<T | undefined>
collectLast<T>(stream): Promise<T | undefined>
```

`collect` and `collectToString` accumulate the entire stream; `collectFirst` and `collectLast` hold
one chunk. Pick by what you actually need.

**`collect()` is not a drain.** Awaiting `collect(stream)` and discarding the array is a common way
to say "run the pipeline to completion" — and it buffers every chunk of the run to do it. When you
want completion and nothing else, drain instead:

```ts
// WRONG — buffers the whole run into an array you then throw away.
await collect(pipeline);

// RIGHT — runs to completion, retains nothing.
await pipeline.pipeTo(new WritableStream());
```

If you want the finished value, `collectLast` already gives you that without accumulating.

**Every collector rejects on a mid-stream error, and the chunks it had are lost.** That is usually
what you want. It is not what you want when the value is needed precisely _because_ the stream
failed — say, the last snapshot that drove provisional writes you now have to retract. Keep it with a
tap instead:

```ts
let last: T | undefined;
const done = pipeline
  .pipeThrough(
    forEach<T>((v) => {
      last = v;
    }),
  )
  .pipeTo(new WritableStream()); // drain; `last` survives a rejection
```

## Text extraction

````ts
extractDelimiter(options?: {
  delimiter?: string;              // default: ```
  allowLanguages?: readonly string[];  // case-insensitive fence labels
}): TransformStream<string, string>

extractFrontmatter(options?: {
  delimiter?: string;        // default: ---
  maxHeaderChars?: number;   // default: 65536
}): TransformStream<string, FrontmatterExtractOutput>

type FrontmatterExtractOutput =
  | { type: 'onFrontmatter'; raw: string }
  | { type: 'onBody'; value: string }
````

`extractFrontmatter` emits `onFrontmatter` the moment the closing delimiter line completes, then
forwards body text as `onBody` deltas — it never buffers the body. The header arrives as **raw
text**; parse it where you consume it (no YAML dependency is implied).

Delimiters are recognized only as complete lines and may be split across any number of chunks. End
of input counts as a line boundary, so a header-only response ending in `---` with no trailing
newline is valid. It **throws** if the opening delimiter is missing (only leading whitespace may
precede it), if the header is still open at end of input, or if the header exceeds `maxHeaderChars`.

## Streaming JSON

```ts
parseJSON(options?: { emitPartialStrings?: boolean }): TransformStream<string, JSONParserOutput>

type JSONParserOutput =
  | { type: 'onObjectBegin'; path: JSONPath }
  | { type: 'onObjectProperty'; name: string | number; path: JSONPath }
  | { type: 'onObjectEnd'; path: JSONPath }
  | { type: 'onArrayBegin'; path: JSONPath }
  | { type: 'onArrayEnd'; path: JSONPath }
  | { type: 'onLiteralValue'; value: any; path: JSONPath }
  | { type: 'onPartialLiteralValue'; value: string; path: JSONPath }
  | { type: 'onError'; error: ParseErrorCode }

type JSONPath = (string | number)[];
```

Tolerant by design: JSONC comments and trailing commas parse fine, and malformed input yields an
`onError` **chunk** followed by continued parsing — the stream does not abort. That is the point.
See `references/permissive-parsing.md`.

**For LLM and tool-call streams, always pass `{ emitPartialStrings: true }`.** Without it a string
value only appears once its closing quote arrives, so a 2 KB `text` argument pops in all at once at
the end instead of growing.

```ts
jsonToJSObject(): TransformStream<JSONParserOutput, any>
```

Folds parser events back into a JS value, emitting the value reconstructed so far **every time it
changes**, including partial strings. Add `takeLast(1)` when you only want the completed document.

```ts
// Live-updating value, for rendering as it arrives.
stream.pipeThrough(parseJSON({ emitPartialStrings: true })).pipeThrough(jsonToJSObject());

// Just the finished document.
stream.pipeThrough(parseJSON()).pipeThrough(jsonToJSObject()).pipeThrough(takeLast(1));
```

> **Every emission is the same live accumulator, not a copy.** That is what makes emitting on every
> event free. Treat emitted values as read-only, and copy anything you retain past the current tick
> (`structuredClone`, a spread, or your state setter). If you `push` snapshots into an array without
> copying, every entry will read as the final value.

Two 2.0 consequences worth knowing: an empty event stream emits nothing (rather than one `null`),
and a string left open at end of input keeps its last partial value instead of being dropped.

> **Version drift.** In 1.x, `jsonToJSObject()` emitted once at completion and ignored partial
> strings, so codebases grew hand-rolled `scan`-based snapshot reducers to work around it. Those are
> obsolete as of 2.0.0 — delete them. If you find one whose comment says `jsonToJSObject` can't do
> incremental, the comment is describing 1.x; check the installed version before believing it.

## Streaming XML

```ts
parseXML(options?: {
  foreignTags?: readonly string[];   // contents treated as opaque text
  textMode?: 'coalesced' | 'delta';  // default 'coalesced'
}): TransformStream<string, XMLParserOutput>

type XMLParserOutput =
  | { type: 'onDocumentBegin' }
  | { type: 'onDocumentEnd' }
  | { type: 'onElementBegin'; name: string; attributes: XMLAttribute[] }
  | { type: 'onElementEnd'; name: string }
  | { type: 'onText'; text: string }
  | { type: 'onComment'; text: string }
  | { type: 'onProcessingInstruction'; name: string; body: string }
  | { type: 'onCDATA'; text: string }
  | { type: 'onError'; message: string }

extractXML(options: {
  allowTags: readonly string[];
  textMode?: 'coalesced' | 'delta';
}): TransformStream<string, XMLExtractOutput>   // onElementBegin | onElementEnd | onText | onError
```

`textMode: 'delta'` emits text as it streams instead of buffering each text run — use it whenever
the text is the payload you want to render live. `'coalesced'` (the default) waits for the whole run,
which is the wrong choice for a long LLM-authored body.

`parseXML` is non-validating and recovery-oriented; `extractXML` pulls allowlisted top-level islands
out of mixed prose and surfaces nested markup inside them as a single opaque `onText`.
