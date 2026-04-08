# @withremyinc/stream

Utility-first helpers for the [Web Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API), aimed at LLM text streaming pipelines.

## Installation

```bash
npm install @withremyinc/stream
```

```bash
pnpm add @withremyinc/stream
```

```bash
yarn add @withremyinc/stream
```

## Usage

```ts
import { collect, merge, pipeThrough, arrayStream } from "@withremyinc/stream";

const stream = arrayStream(["a", "b", "c"]);
const chunks = await collect(stream);
```

### JSON (JSONC-style)

- **parseJSON()** — `TransformStream<string, …>`: tokenizes with comments/trailing commas (JSONC-style), emits visit events (`onObjectBegin`, `onLiteralValue`, `onError`, …).
- **jsonToJSObject()** — folds those events into a plain JavaScript value.

```ts
import { arrayStream, collect, parseJSON, jsonToJSObject, takeLast } from "@withremyinc/stream";

const [value] = await collect(
  arrayStream(['{ "a": 1 /* note */ }'])
    .pipeThrough(parseJSON())
    .pipeThrough(jsonToJSObject())
    .pipeThrough(takeLast(1)),
);
```

### XML (streaming, non-validating, tolerant)

- **parseXML()** — `TransformStream<string, …>`: tokenizes and parses XML incrementally, accepts documents and fragments, and emits visit events (`onDocumentBegin`, `onElementBegin`, `onText`, `onComment`, `onError`, …).
- **extractXML()** — `TransformStream<string, …>`: extracts a flat stream of allowlisted XML tags from otherwise mixed text, emitting only `onElementBegin`, `onText`, `onElementEnd`, and `onError`.

```ts
import { arrayStream, collect, parseXML } from "@withremyinc/stream";

const events = await collect(
  arrayStream([
    '<instructions>use <tool>bash</tool> & keep x < 3</instructions>',
  ]).pipeThrough(parseXML({ foreignTags: ["instructions"] })),
);
```

With `foreignTags`, the tag body is treated as opaque raw text, so the payload inside `<instructions>` arrives as `onText` instead of nested XML events.

Exact `parseXML({ foreignTags: ["instructions"] })` output example:

```ts
const events = await collect(
  arrayStream([
    '<root><instructions>use <tool>bash</tool> & keep x < 3</instructions><tail>ok</tail></root>',
  ]).pipeThrough(parseXML({ foreignTags: ["instructions"] })),
);

// events
[
  { type: "onDocumentBegin" },
  { type: "onElementBegin", name: "root", attributes: [] },
  { type: "onElementBegin", name: "instructions", attributes: [] },
  { type: "onText", value: "use <tool>bash</tool> & keep x < 3" },
  { type: "onElementEnd", name: "instructions" },
  { type: "onElementBegin", name: "tail", attributes: [] },
  { type: "onText", value: "ok" },
  { type: "onElementEnd", name: "tail" },
  { type: "onElementEnd", name: "root" },
  { type: "onDocumentEnd" },
]
```

Need incremental text chunks instead of fully coalesced text nodes? Use `textMode: "delta"`:

```ts
const events = await collect(
  arrayStream(["<root>he", "llo<b/>wo", "rld</root>"]).pipeThrough(
    parseXML({ textMode: "delta" }),
  ),
);
```

That yields multiple `onText(...)` events for the same logical text node as more input becomes available.

```ts
import { arrayStream, collect, extractXML } from "@withremyinc/stream";

const extracted = await collect(
  arrayStream([
    'this is a <test>hello</test>!\n\n<instructions>use <tool>bash</tool></instructions>',
  ]).pipeThrough(extractXML({ allowTags: ["test", "instructions"] })),
);
```

`extractXML()` is intentionally flat: it does **not** recurse. If you need nested structure, take the extracted `onText` payload and run it through `parseXML()` separately.

`extractXML()` also supports `textMode: "delta"` when you want extracted text to stream in multiple `onText` events.

Exact `extractXML()` output example:

```ts
const events = await collect(
  arrayStream(['before <test a="1">hello</test> after']).pipeThrough(
    extractXML({ allowTags: ["test"] }),
  ),
);

// events
[
  {
    type: "onElementBegin",
    name: "test",
    attributes: [{ name: "a", value: "1" }],
  },
  { type: "onText", value: "hello" },
  { type: "onElementEnd", name: "test" },
]
```

Nested allowlisted tags are still emitted flat as a single outer block:

```ts
const events = await collect(
  arrayStream(["<instructions><test>hello</test></instructions>"]).pipeThrough(
    extractXML({ allowTags: ["instructions", "test"] }),
  ),
);

// events
[
  { type: "onElementBegin", name: "instructions", attributes: [] },
  { type: "onText", value: "<test>hello</test>" },
  { type: "onElementEnd", name: "instructions" },
]
```

Recovery example:

```ts
const events = await collect(
  arrayStream(["hello<a x=\"1\" x=\"2\"/><b></a>"]).pipeThrough(parseXML()),
);
```

That stream still produces useful events:

- top-level text `"hello"`
- `onError(DuplicateAttribute)` and `<a>` with the **last** `x` value
- `onError(MismatchedTag)` with recovery by auto-closing `<b>` before `</a>`

## Development

Remaining ideas and roadmap:

### Scripts

- `pnpm run build` — compile to `dist/`
- `pnpm run test` — Vitest
- `pnpm run typecheck` — TypeScript, no emit
- `pnpm run bench:geojson` — GeoJSON download + parser timings ([`scripts/bench-geojson.mjs`](scripts/bench-geojson.mjs))
- `pnpm run bench:xml` — City of Chicago XML download + `parseXML()` event-walk benchmark ([`scripts/bench-xml.mjs`](scripts/bench-xml.mjs))

