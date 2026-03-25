/**
 * Create a ReadableStream from an array of items.
 * @param array - The array of items to stream.
 * @returns A ReadableStream that emits the items from the array.
 */
export function arrayStream<T>(array: T[]): ReadableStream<T> {
  return new ReadableStream({
    start(controller) {
      for (const item of array) {
        controller.enqueue(item);
      }
      controller.close();
    },
  });
}
