#!/usr/bin/env node
/**
 * GeoJSON benchmarks using files linked from the U.S. data.gov catalog (GeoJSON harvest).
 *
 * 1) California Public Schools 2024-25 — large FeatureCollection (~17 MiB text).
 *    Catalog: https://catalog.data.gov/dataset/california-public-schools-2024-25
 *    Download: stable redirect from CA Geoportal (resolves to a time-limited Azure blob).
 *
 * 2) Lake County IL (ArcGIS Open Data) — smaller GeoJSON (~0.4 MiB), same pattern as many
 *    data.gov-listed GeoJSON resources (ArcGIS Hub /download API).
 *
 * Reports JSON.parse (native) vs streaming parseJSON() (visit every parser event; no array).
 * parseJSON input is drip-fed as alternating 4- and 5-character chunks (tokenizer sim).
 *
 * Optional: FULL_REDUCE=1 replays all events through jsonToJSObject (needs lots of RAM/time).
 */

import { performance } from "node:perf_hooks";

import { arrayStream, collect, jsonToJSObject, parseJSON, takeLast } from "../dist/index.js";
import {
  dripFeedChunkCount,
  dripFeedReadableStream,
} from "./drip-feed-chunks.mjs";

const CA_GEOJSON_URL =
  "https://gis.data.ca.gov/api/download/v1/items/586424d4a1964277a2e0b73191da51bb/geojson?layers=0";

const LAKE_COUNTY_GEOJSON_URL =
  "https://data-lakecountyil.opendata.arcgis.com/api/download/v1/items/3e0c1eb04e5c48b3be9040b0589d3ccf/geojson?layers=8";

async function countParseEvents(text) {
  const reader = dripFeedReadableStream(text)
    .pipeThrough(parseJSON())
    .getReader();
  let n = 0;
  let errors = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    n++;
    if (value?.type === "onError") errors++;
  }
  return { n, errors };
}

async function benchLabel(label, text, catalogNote, options = {}) {
  const { skipStreamingParse = false, skipStreamingReason } = options;
  const mb = text.length / (1024 * 1024);
  console.log(`\n── ${label} (${text.length.toLocaleString()} chars, ${mb.toFixed(2)} MiB) ──`);
  if (catalogNote) console.log(catalogNote);

  const t0 = performance.now();
  const native = JSON.parse(text);
  const t1 = performance.now();
  const nativeMs = t1 - t0;
  console.log(
    `JSON.parse: ${nativeMs.toFixed(2)} ms (${(mb / (nativeMs / 1000)).toFixed(1)} MiB/s)`,
  );
  if (native?.type === "FeatureCollection" && Array.isArray(native.features)) {
    console.log(`  features: ${native.features.length.toLocaleString()}`);
  }

  if (skipStreamingParse) {
    console.log(`parseJSON: skipped — ${skipStreamingReason}`);
    return;
  }

  const t2 = performance.now();
  const { n: events, errors } = await countParseEvents(text);
  const t3 = performance.now();
  const streamMs = t3 - t2;
  const chunks = dripFeedChunkCount(text);
  console.log(
    `parseJSON (drip-feed 4|5 char chunks × ${chunks.toLocaleString()}, streaming event count): ${streamMs.toFixed(0)} ms, ${events.toLocaleString()} events, ${errors} onError (${(mb / (streamMs / 1000)).toFixed(2)} MiB/s)`,
  );
  console.log(`  vs JSON.parse: ${(streamMs / nativeMs).toFixed(0)}× slower`);

  if (process.env.FULL_REDUCE === "1") {
    const ev = await collect(
      dripFeedReadableStream(text).pipeThrough(parseJSON()),
    );
    const t4 = performance.now();
    const [value] = await collect(
      arrayStream(ev).pipeThrough(jsonToJSObject()).pipeThrough(takeLast(1)),
    );
    const t5 = performance.now();
    console.log(`jsonToJSObject (after full collect): ${(t5 - t4).toFixed(0)} ms`);
    if (value && typeof value === "object" && Array.isArray(value.features)) {
      console.log(`  features: ${value.features.length}`);
    }
  }
}

async function main() {
  console.log("GeoJSON parser benchmark (requires network)\n");

  console.log("Fetching California Public Schools GeoJSON …");
  const tDl0 = performance.now();
  const caRes = await fetch(CA_GEOJSON_URL);
  if (!caRes.ok) throw new Error(`CA fetch HTTP ${caRes.status}`);
  const caText = await caRes.text();
  console.log(`Download: ${((performance.now() - tDl0) / 1000).toFixed(2)} s`);

  await benchLabel(
    "California Public Schools 2024-25",
    caText,
    "data.gov: https://catalog.data.gov/dataset/california-public-schools-2024-25",
    {
      skipStreamingParse: process.env.CA_STREAMING_PARSE !== "1",
      skipStreamingReason:
        "set CA_STREAMING_PARSE=1 to run (very slow / high memory; not representative of JSON.parse).",
    },
  );

  console.log("\nFetching Lake County IL GeoJSON …");
  const lcRes = await fetch(LAKE_COUNTY_GEOJSON_URL);
  if (!lcRes.ok) throw new Error(`Lake County fetch HTTP ${lcRes.status}`);
  const lcText = await lcRes.text();
  await benchLabel("Lake County IL (sample layer)", lcText, null);

  if (process.env.FULL_REDUCE !== "1") {
    console.log("\n(Set FULL_REDUCE=1 to also benchmark jsonToJSObject after collecting all events.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
