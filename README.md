# @withremyinc/stream

[![CI](https://github.com/withremyinc/stream/actions/workflows/ci.yml/badge.svg)](https://github.com/withremyinc/stream/actions/workflows/ci.yml)
[![npm package](https://img.shields.io/badge/npm-%40withremyinc%2Fstream-CB3837)](https://www.npmjs.com/package/@withremyinc/stream)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE.md)

Composable helpers for the [Web Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API), plus incremental JSON and XML parsers for text and AI pipelines.

- ESM-only
- Node 18+
- Web Streams-native APIs
- Small functional helpers for `ReadableStream` / `TransformStream`
- Tolerant streaming parsers for JSONC-style JSON and XML fragments

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

## Quick start

```ts
import { arrayStream, collect, filter, map } from "@withremyinc/stream";

const output = await collect(
  arrayStream([1, 2, 3, 4])
    .pipeThrough(map((value) => value * 2))
    .pipeThrough(filter((value) => value > 4)),
);

console.log(output); // [6, 8]
```

## What is included?

### Stream helpers

**Sources / composition**

- `arrayStream()`
- `merge()`
- `mergeKeyed()`
- `concat()`
- `pipeThrough()`
- `tee()`

`pipeThrough()` composes multiple `TransformStream`s into a single transform when you want to pass around a whole pipeline.

**Collectors**

- `collect()`
- `collectFirst()`
- `collectLast()`
- `collectToString()`

**Transforms**

- `map()`
- `filter()`
- `filterMap()`
- `flatMap()`
- `scan()`
- `reduce()`
- `take()`
- `takeLast()`
- `drop()`
- `toArray()`
- `toString()`
- `forEach()`
- `some()`
- `every()`
- `find()`
- `extractDelimiter()`

### Streaming JSON

`parseJSON()` tokenizes and parses JSON incrementally and emits visit events.
`jsonToJSObject()` folds those events back into a plain JavaScript value.

It is intentionally tolerant of JSONC-style input such as comments and trailing commas.

```ts
import {
  arrayStream,
  collect,
  jsonToJSObject,
  parseJSON,
  takeLast,
} from "@withremyinc/stream";

const [value] = await collect(
  arrayStream(['{ "name": "Remy", /* comment */ }'])
    .pipeThrough(parseJSON())
    .pipeThrough(jsonToJSObject())
    .pipeThrough(takeLast(1)),
);

console.log(value); // { name: "Remy" }
```

### Streaming XML

`parseXML()` incrementally parses XML documents or fragments and emits events such as:

- `onDocumentBegin`
- `onElementBegin`
- `onText`
- `onElementEnd`
- `onError`

It is non-validating and recovery-oriented, which makes it useful for LLM output and other imperfect text streams.

```ts
import { arrayStream, collect, parseXML } from "@withremyinc/stream";

const events = await collect(
  arrayStream(["<root><item>Hello</item></root>"]).pipeThrough(parseXML()),
);

console.log(events);
```

If you only want specific top-level XML islands from mixed text, use `extractXML()`:

```ts
import { arrayStream, collect, extractXML } from "@withremyinc/stream";

const events = await collect(
  arrayStream([
    'before <answer confidence="0.9">hello</answer> after',
  ]).pipeThrough(extractXML({ allowTags: ["answer"] })),
);
```

## Delimited block extraction

`extractDelimiter()` streams the body of the first matching fenced block and drops the fence lines.
This is handy for extracting Markdown code fences before passing the contents into `parseJSON()` or `parseXML()`.

```ts
import {
  arrayStream,
  collectToString,
  extractDelimiter,
} from "@withremyinc/stream";

const body = await collectToString(
  arrayStream([
    "ignore this\n```json\n",
    '{"ok": true}\n',
    "```\ntrailing text",
  ]).pipeThrough(extractDelimiter({ allowLanguages: ["json"] })),
);

console.log(body); // {"ok": true}\n
```

## Development

Published output targets Node 18+, but local builds currently require Node 20.19+ because `tsdown` does. `.nvmrc` and `.node-version` are included for that toolchain.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Extra scripts:

- `pnpm bench:geojson`
- `pnpm bench:xml`

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Releasing

For the full checklist, see [RELEASING.md](./RELEASING.md).

Quick version:

1. Bump the package version with `pnpm version patch` (or `minor` / `major`).
2. Push the commit and matching tag with `git push --follow-tags`.
3. GitHub Actions publishes that tag to npm.

The publish workflow expects an `NPM_TOKEN` repository secret and uses npm provenance.

## Release notes / packaging

This package publishes the built `dist/` output plus:

- `README.md`
- `CHANGELOG.md`
- `LICENSE.md`
- `NOTICES.md`

## License

MIT.

Copyright © 2026 Remy, Inc.

See [LICENSE.md](./LICENSE.md) for the project license and [NOTICES.md](./NOTICES.md) for bundled third-party notices.
