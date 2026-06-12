# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
