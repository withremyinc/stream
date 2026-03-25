/**
 * Drip-feed a string into a streaming JSON parser in tiny UTF-16 slices, simulating a
 * tokenizer. Default alternates 4- and 5-character chunks (not grapheme-cluster aware).
 */

const DEFAULT_SIZES = [4, 5];

/**
 * @param {string} text
 * @param {number[]} sizes — cycle of chunk lengths (default `[4, 5]`)
 * @returns {string[]}
 */
export function dripFeedChunks(text, sizes = DEFAULT_SIZES) {
  if (sizes.length === 0) {
    throw new Error("dripFeedChunks: sizes must be non-empty");
  }
  const chunks = [];
  let i = 0;
  let si = 0;
  while (i < text.length) {
    const len = sizes[si % sizes.length];
    const take = Math.min(len, text.length - i);
    chunks.push(text.slice(i, i + take));
    i += take;
    si++;
  }
  return chunks;
}

/**
 * Number of chunks {@link dripFeedReadableStream} would emit (cheap; no chunk strings).
 * @param {string} text
 * @param {number[]} sizes
 * @returns {number}
 */
export function dripFeedChunkCount(text, sizes = DEFAULT_SIZES) {
  if (sizes.length === 0) {
    throw new Error("dripFeedChunkCount: sizes must be non-empty");
  }
  let n = 0;
  let i = 0;
  let si = 0;
  while (i < text.length) {
    const len = sizes[si % sizes.length];
    i += Math.min(len, text.length - i);
    si++;
    n++;
  }
  return n;
}

/**
 * Lazy drip-feed: one small slice per pull (safe for multi‑MiB strings — no giant chunks[]).
 * @param {string} text
 * @param {number[]} sizes
 * @returns {ReadableStream<string>}
 */
export function dripFeedReadableStream(text, sizes = DEFAULT_SIZES) {
  if (sizes.length === 0) {
    throw new Error("dripFeedReadableStream: sizes must be non-empty");
  }
  let i = 0;
  let si = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= text.length) {
        controller.close();
        return;
      }
      const len = sizes[si % sizes.length];
      const take = Math.min(len, text.length - i);
      controller.enqueue(text.slice(i, i + take));
      i += take;
      si++;
    },
  });
}
