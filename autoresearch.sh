#!/bin/bash
set -euo pipefail

CACHE_DIR=".cache/autoresearch"
XML_FILE="$CACHE_DIR/chicago-bus-ridership.xml"
XML_URL="${XML_BENCH_URL:-https://data.cityofchicago.org/api/views/bynn-gwxy/rows.xml?accessType=DOWNLOAD}"
TEXT_MODE="${XML_TEXT_MODE:-delta}"

mkdir -p "$CACHE_DIR"

if [ ! -f "$XML_FILE" ]; then
  curl -L --fail --silent --show-error "$XML_URL" -o "$XML_FILE"
fi

pnpm run build >/dev/null

XML_FILE="$XML_FILE" XML_URL="$XML_URL" XML_TEXT_MODE="$TEXT_MODE" node --input-type=module <<'NODE'
import fs from "node:fs";
import { performance } from "node:perf_hooks";

import { parseXML } from "./dist/index.js";
import { dripFeedChunkCount, dripFeedReadableStream } from "./scripts/drip-feed-chunks.mjs";

const xmlFile = process.env.XML_FILE;
const xmlUrl = process.env.XML_URL;
const textMode = process.env.XML_TEXT_MODE ?? "delta";

const text = fs.readFileSync(xmlFile, "utf8");
const chars = text.length;
const mib = chars / (1024 * 1024);
const chunks = dripFeedChunkCount(text);

const reader = dripFeedReadableStream(text)
  .pipeThrough(parseXML({ textMode }))
  .getReader();

let events = 0;
let errors = 0;
let textEvents = 0;
let elementBegin = 0;
let elementEnd = 0;

const t0 = performance.now();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  events++;
  switch (value?.type) {
    case "onError":
      errors++;
      break;
    case "onText":
      textEvents++;
      break;
    case "onElementBegin":
      elementBegin++;
      break;
    case "onElementEnd":
      elementEnd++;
      break;
  }
}
const t1 = performance.now();
const parseMs = t1 - t0;
const throughput = mib / (parseMs / 1000);

console.log(`# source=${xmlUrl}`);
console.log(`# file=${xmlFile}`);
console.log(`# text_mode=${textMode}`);
console.log(`# chunks=${chunks}`);
console.log(`METRIC parse_ms=${parseMs.toFixed(3)}`);
console.log(`METRIC events=${events}`);
console.log(`METRIC errors=${errors}`);
console.log(`METRIC text_events=${textEvents}`);
console.log(`METRIC element_begin=${elementBegin}`);
console.log(`METRIC element_end=${elementEnd}`);
console.log(`METRIC bytes=${chars}`);
console.log(`METRIC throughput_mib_s=${throughput.toFixed(6)}`);
NODE
