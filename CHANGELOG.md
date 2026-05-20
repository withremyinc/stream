# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
