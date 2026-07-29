# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [2.0.0] - 2026-07-28

### Changed

- **Breaking:** `jsonToJSObject()` is now incremental. It emits the value reconstructed so far after every parser event that changes it — including the `onPartialLiteralValue` events from `parseJSON({ emitPartialStrings: true })` — instead of emitting once when the input closes. Incremental consumers no longer need their own `scan()` reducer. ([#4](https://github.com/withremyinc/stream/issues/4))

  To get the previous one-value behavior, append `takeLast(1)`:

  ```diff
    .pipeThrough(parseJSON())
    .pipeThrough(jsonToJSObject())
  + .pipeThrough(takeLast(1))
  ```

  Every emission is the same live accumulator rather than a copy, which is what keeps emitting on every event free: reconstructing a large document costs what it did before. Copy anything you retain and treat emitted values as read-only. Two smaller consequences: an empty event stream now emits nothing instead of a single `null`, and a string left open at end of input keeps its last partial value instead of being dropped.

### Added

- `extractFrontmatter()` splits a Markdown-style frontmatter header from the body that follows it, emitting `onFrontmatter` as soon as the closing delimiter is complete and forwarding the body as `onBody` deltas. Delimiters may be split across chunks, end of input counts as a line boundary so a closing delimiter needs no trailing newline, and header growth is bounded by `maxHeaderChars`. The header is emitted as raw text for the caller to parse at the point of consumption, so no YAML parser is bundled or implied. ([#5](https://github.com/withremyinc/stream/issues/5))

### Fixed

- Added a `default` export condition so runtime transpilers such as jiti, which resolve the package through the `require` condition, no longer fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The package remains ESM-only; no `require` condition was added because there is no CommonJS build to point it at. ([#3](https://github.com/withremyinc/stream/issues/3))

## [1.0.4] - 2026-06-12

### Fixed

- The streaming JSON/XML parsers no longer drop end-of-input events when internal buffer compaction empties the buffer exactly at end of input. Most visibly, `parseJSON({ emitPartialStrings: true })` on input truncated inside a long string (≥256 characters) silently omitted the final `UnexpectedEndOfString` error, and unterminated documents whose token count aligned with the compaction threshold lost trailing events such as `onArrayEnd`.
- `jsonToJSObject()` now creates an own `"__proto__"` property (matching `JSON.parse` semantics) instead of replacing the result object's prototype, which allowed parsed documents to inject inherited properties onto the result.
- The JSON scanner no longer treats `/*/` as a complete block comment; the opening `*` can no longer double as the start of the `*/` terminator.
- `concat` now reads from its sources on demand instead of eagerly draining every stream into memory regardless of consumer backpressure.
- `take(0)` now closes its stream immediately instead of silently consuming the entire upstream.

## [1.0.3] - 2026-05-29

### Fixed

- `merge` and `mergeKeyed` no longer throw `ERR_INVALID_STATE` ("Controller is already closed/errored") when one of the source streams errors. A `settled` guard now prevents closing a controller that was already errored (and vice versa). On error, sibling readers are cancelled so they no longer hang, and reader locks are released. ([#2](https://github.com/withremyinc/stream/issues/2))
- `merge`, `mergeKeyed`, and `concat` now implement a `cancel` handler that propagates downstream cancellation to every source stream.
- `concat` shared the same close-after-error bug as `merge`/`mergeKeyed` and is fixed by the same `settled` guard.

## [1.0.2] - 2026-05-26

### Fixed

- Wait for the complete string token before emitting `onObjectProperty` so partial property names split across chunks are no longer treated as complete keys (`emitPartialStrings: true`).
- Emit `onArrayEnd` with the parent path instead of the last child index, restoring symmetry with `onArrayBegin` and matching the `onObjectBegin`/`onObjectEnd` convention.

## [1.0.1] - 2026-05-20

### Added

- Added `parseJSON({ emitPartialStrings: true })` for streaming partial string literal values via `onPartialLiteralValue` events.

### Fixed

- Consumes scanner error tokens during JSON parsing to avoid recovery loops on malformed streamed input.

## [1.0.0] - 2026-04-09

### Added

- Initial open-source release of `@withremyinc/stream`.
- Composable Web Streams helpers for `ReadableStream` and `TransformStream`.
- Incremental JSON parsing with JSONC-style tolerance.
- Incremental XML parsing and flat allowlisted XML extraction.
- Delimited block extraction for fenced text/code blocks.
