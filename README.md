# @withremyinc/stream

Utility-first helpers for the [Web Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API), aimed at streaming and transform pipelines (including AI-style flows).

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

XML support is intentionally scoped to a practical v1 parser:

- supports elements, attributes, text, comments, CDATA, processing instructions, XML declarations, and predefined/numeric entities
- accepts XML fragments, including multiple top-level nodes and top-level text
- supports `foreignTags` for opaque raw-text islands like `instructions`, `code`, or `prompt`
- supports `textMode: "delta"` for incrementally emitted `onText` events
- includes `extractXML()` for flat allowlisted extraction from mixed LLM output
- recovers from common structural issues by emitting `onError` and continuing when possible
- **does not** build a DOM
- **does not** do DTD parsing, entity declarations, external entity resolution, schema validation, or namespace resolution
- **does not** provide `xmlToJSObject()`

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

See [`docs/xml-v1.md`](docs/xml-v1.md) for the locked scope, recovery policy, `foreignTags`, extractor semantics, and non-goals.

## Development

Remaining ideas and roadmap:

### Still needed

- tee
- filterMap
- drip feed by tokens
- extractDelimiter
- parseMarkdown

### JSON / streaming

- Performance tuning for very large payloads (streaming `parseJSON` is far slower than `JSON.parse` today; see bench below).

**GeoJSON benchmark (data.gov–listed files, requires network):**

```bash
pnpm run bench:geojson
```

Downloads **California Public Schools 2024-25** (~17 MiB; [catalog entry](https://catalog.data.gov/dataset/california-public-schools-2024-25)) and times **`JSON.parse`**; streaming **`parseJSON`** is skipped by default on that file (`CA_STREAMING_PARSE=1` to force it — expect a long run and high memory use). A second, smaller ArcGIS GeoJSON (~0.4 MiB) is used to compare **`JSON.parse`** vs streaming event walk.

### Scripts

- `pnpm run build` — compile to `dist/`
- `pnpm run test` — Vitest
- `pnpm run typecheck` — TypeScript, no emit
- `pnpm run bench:geojson` — GeoJSON download + parser timings ([`scripts/bench-geojson.mjs`](scripts/bench-geojson.mjs))
- `pnpm run bench:xml` — City of Chicago XML download + `parseXML()` event-walk benchmark ([`scripts/bench-xml.mjs`](scripts/bench-xml.mjs))

