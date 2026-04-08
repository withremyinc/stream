#!/usr/bin/env node
/**
 * XML benchmark using a real City of Chicago XML export.
 *
 * Dataset:
 *   https://data.cityofchicago.org/api/views/bynn-gwxy/rows.xml?accessType=DOWNLOAD
 *
 * Reports download time plus parseXML() event-walk timings while drip-feeding
 * alternating 4- and 5-character chunks.
 *
 * Optional:
 *   XML_BENCH_URL=...          Override the source URL
 *   XML_TEXT_MODE=coalesced    Benchmark parseXML({ textMode: "coalesced" })
 */

import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { parseXML } from "../dist/index.js";
import {
  dripFeedChunkCount,
  dripFeedReadableStream,
} from "./drip-feed-chunks.mjs";

const execFileAsync = promisify(execFile);

const CHICAGO_XML_URL =
  process.env.XML_BENCH_URL ??
  "https://data.cityofchicago.org/api/views/bynn-gwxy/rows.xml?accessType=DOWNLOAD";

const XML_TEXT_MODE = process.env.XML_TEXT_MODE === "coalesced" ? "coalesced" : "delta";

async function downloadTextViaFetch(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch HTTP ${response.status}`);
  }
  return await response.text();
}

async function downloadTextViaCurl(url) {
  const { stdout } = await execFileAsync(
    "curl",
    ["-L", "--fail", "--silent", "--show-error", url],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return stdout;
}

async function downloadText(url) {
  try {
    return await downloadTextViaFetch(url);
  } catch (fetchError) {
    console.warn(`fetch failed (${fetchError?.message ?? fetchError}); retrying with curl ...`);
    return await downloadTextViaCurl(url);
  }
}

async function countParseEvents(text, parseOptions) {
  const reader = dripFeedReadableStream(text)
    .pipeThrough(parseXML(parseOptions))
    .getReader();

  let events = 0;
  let errors = 0;
  const counts = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    events++;
    const type = value?.type;
    if (typeof type === "string") {
      counts.set(type, (counts.get(type) ?? 0) + 1);
      if (type === "onError") {
        errors++;
      }
    }
  }

  return { events, errors, counts };
}

function formatEventCounts(counts) {
  const order = [
    "onDocumentBegin",
    "onXmlDeclaration",
    "onElementBegin",
    "onText",
    "onComment",
    "onCData",
    "onProcessingInstruction",
    "onError",
    "onElementEnd",
    "onDocumentEnd",
  ];

  return order
    .filter((type) => counts.has(type))
    .map((type) => `${type}: ${counts.get(type).toLocaleString()}`)
    .join(", ");
}

async function benchLabel(label, text, parseOptions) {
  const chars = text.length;
  const mib = chars / (1024 * 1024);
  const chunks = dripFeedChunkCount(text);

  const t0 = performance.now();
  const { events, errors, counts } = await countParseEvents(text, parseOptions);
  const t1 = performance.now();
  const ms = t1 - t0;

  console.log(`\n── ${label} (${chars.toLocaleString()} chars, ${mib.toFixed(2)} MiB) ──`);
  console.log(`source: ${CHICAGO_XML_URL}`);
  console.log(`chunks: ${chunks.toLocaleString()} (drip-feed 4|5 chars)`);
  console.log(
    `parseXML (${parseOptions.textMode} text): ${ms.toFixed(0)} ms, ${events.toLocaleString()} events, ${errors} onError (${(mib / (ms / 1000)).toFixed(2)} MiB/s)`,
  );
  console.log(`  breakdown: ${formatEventCounts(counts)}`);
}

async function main() {
  console.log("XML parser benchmark (requires network)\n");

  console.log("Fetching City of Chicago XML export …");
  const tDl0 = performance.now();
  const text = await downloadText(CHICAGO_XML_URL);
  const tDl1 = performance.now();

  console.log(`Download: ${((tDl1 - tDl0) / 1000).toFixed(2)} s`);

  await benchLabel(
    "City of Chicago XML export (bynn-gwxy)",
    text,
    { textMode: XML_TEXT_MODE },
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
