/**
 * Consumes a ReadableStream and returns an array of all chunks.
 * @param stream - ReadableStream to collect.
 * @returns Promise resolving to an array of chunks.
 */
export async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const arr: T[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    arr.push(value);
  }
  return arr;
}

/**
 * Consumes a ReadableStream of strings and concatenates them.
 * @param stream - ReadableStream<string> to collect.
 * @returns Promise resolving to the concatenated string.
 */
export async function collectToString(
  stream: ReadableStream<string>,
): Promise<string> {
  const reader = stream.getReader();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += value;
  }
  return result;
}

/**
 * Retrieves the first chunk from a ReadableStream.
 * @param stream - ReadableStream to read.
 * @returns Promise resolving to the first chunk or undefined.
 */
export async function collectFirst<T>(
  stream: ReadableStream<T>,
): Promise<T | undefined> {
  const reader = stream.getReader();
  try {
    const { done, value } = await reader.read();
    return done ? undefined : value;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Retrieves the last chunk from a ReadableStream.
 * @param stream - ReadableStream to read.
 * @returns Promise resolving to the last chunk or undefined.
 */
export async function collectLast<T>(
  stream: ReadableStream<T>,
): Promise<T | undefined> {
  const reader = stream.getReader();
  let last: T | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    last = value;
  }
  return last;
}
