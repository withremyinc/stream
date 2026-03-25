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

## Development

Remaining ideas and roadmap:

### Still needed

- tee
- filterMap
- drip feed by tokens
- extractDelimiter
- extractXML
- parseMarkdown
- parseXML

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

