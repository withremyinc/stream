#!/bin/bash
set -euo pipefail

pnpm run typecheck >/dev/null
pnpm exec vitest run src/xml/__test__/scanner.test.ts src/xml/__test__/parser.test.ts src/xml/__test__/extract.test.ts >/dev/null
