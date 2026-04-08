# Autoresearch: XML parsing speed

## Objective
Optimize `parseXML()` performance on a real-world XML workload without changing parser semantics.

Primary target: the default `textMode: "delta"` parse path, because `bench:xml` now defaults to delta mode. Maintain correctness for both normal XML text nodes and `foreignTags` raw-text mode.

## Metrics
- **Primary**: `parse_ms` (milliseconds, lower is better) — time to event-walk the cached City of Chicago XML export with `parseXML({ textMode: "delta" })`
- **Secondary**:
  - `events` — total emitted events
  - `errors` — emitted parser errors (must stay at 0 on benchmark input)
  - `text_events` — emitted `onText` count
  - `element_begin` — emitted `onElementBegin` count
  - `element_end` — emitted `onElementEnd` count
  - `bytes` — input size
  - `throughput_mib_s` — derived throughput

## How to Run
`./autoresearch.sh` — downloads/caches the benchmark XML if needed, builds `dist/`, runs the benchmark, and prints `METRIC name=value` lines.

## Files in Scope
- `src/xml/scanner.ts` — hottest likely path; text scanning, raw-tag scanning, token emission
- `src/xml/parser.ts` — parser event walk and recovery logic
- `src/xml/extract.ts` — extraction logic; should stay correct if shared helpers change
- `src/xml/token-utils.ts` — shared token helpers
- `src/xml/xml.ts` — public XML API option plumbing
- `src/util/generators.ts` — generic generator harness; optimize carefully because JSON also uses it
- `scripts/bench-xml.mjs` — benchmark harness only when instrumentation or measurement needs improve
- `src/xml/__test__/*` — XML correctness tests
- `autoresearch.md` / `autoresearch.sh` / `autoresearch.checks.sh` / `autoresearch.ideas.md` / `autoresearch.jsonl` — session artifacts

## Off Limits
- No benchmark-specific parsing shortcuts keyed to this dataset
- No changes that skip correctness work or suppress emitted events to look faster
- No new runtime dependencies
- Do not modify `dist/` manually

## Constraints
- Be careful not to overfit to the benchmark and do not cheat on the benchmark.
- Preserve exact parser behavior unless intentionally documented and validated.
- `pnpm run typecheck` must pass.
- XML-focused tests must pass: `src/xml/__test__/scanner.test.ts`, `src/xml/__test__/parser.test.ts`, `src/xml/__test__/extract.test.ts`.
- Prefer improvements that should help both benchmark input and general XML workloads.
- Keep `bench:xml` pointed at the real City of Chicago XML export.

## What's Been Tried
- Baseline (`./autoresearch.sh`, delta mode, cached Chicago XML): 11.01s / 11.17s / 11.51s across the first three runs (median ~11.17s), 0 errors, 1,370,863 events.
- Replaced the per-character resume object used for XML `textMode: "delta"` with a cheaper closure-based exhaustion flag in `fromStringGenerator()`. This preserved delta semantics and produced a modest improvement in early runs (~10.72s–10.98s).
- Switched XML name scanning, text scanning, and quoted-string scanning to substring/retain windows instead of repeated character-by-character string concatenation. This stayed correct after fixing compaction handling and appears to help slightly on real XML workloads.
- Biggest win so far: removed the public wrapper `TransformStream` pump in `parseXML()` / `extractXML()` and returned the composed `{ writable, readable }` pair directly while still piping scanner→parser internally. This cut per-chunk Web Streams overhead substantially.
- Current kept state (validated with XML tests + typecheck) benchmarks at 8.43s / 8.57s / 8.91s on the primary workload (~23% faster than the initial 11.17s median). Coalesced mode also improved in a spot-check (7.95s, 0 errors).
