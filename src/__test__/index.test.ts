import { describe, it, expect } from "vitest";

import { collect } from "../collects";
import { merge, mergeKeyed, concat, pipeThrough } from "../index";
import { arrayStream } from "../streams"; // Helper

// Helper to create a stream that yields items with a delay
function delayedStream<T>(items: T[], delayMs = 5): ReadableStream<T> {
  let i = 0;
  return new ReadableStream<T>({
    async pull(controller) {
      if (i < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        controller.enqueue(items[i++]);
      } else {
        controller.close();
      }
    },
  });
}

describe("index exports", () => {
  describe("merge", () => {
    it("should merge items from multiple streams as they arrive", async () => {
      const stream1 = delayedStream([1, 3, 5], 10); // Slower
      const stream2 = delayedStream([2, 4], 5); // Faster

      const mergedStream = merge([stream1, stream2]);
      const result = await collect(mergedStream);

      // Order depends on timing, but all items must be present
      expect(result).toHaveLength(5);
      expect(result).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
      // Example possible interleaved order: [2, 1, 4, 3, 5]
    });

    it("should handle empty streams", async () => {
      const stream1 = arrayStream([1, 2]);
      const stream2 = arrayStream([]);
      const stream3 = arrayStream([3]);

      const mergedStream = merge([stream1, stream2, stream3]);
      const result = await collect(mergedStream);
      expect(result).toEqual(expect.arrayContaining([1, 2, 3]));
      expect(result).toHaveLength(3);
    });

    it("should handle only empty streams", async () => {
      const stream1 = arrayStream([]);
      const stream2 = arrayStream([]);
      const mergedStream = merge([stream1, stream2]);
      const result = await collect(mergedStream);
      expect(result).toEqual([]);
    });

    it("should handle a single stream", async () => {
      const stream1 = arrayStream([1, 2, 3]);
      const mergedStream = merge([stream1]);
      const result = await collect(mergedStream);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe("mergeKeyed", () => {
    it("should merge items from keyed streams with keys", async () => {
      const streamsObj = {
        a: delayedStream(["a1", "a3"], 10),
        b: delayedStream(["b2"], 5),
      };
      const mergedStream = mergeKeyed(streamsObj);
      const result = await collect(mergedStream);

      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([{ b: "b2" }, { a: "a1" }, { a: "a3" }]),
      );
      // Example possible order: [{ b: 'b2' }, { a: 'a1' }, { a: 'a3' }]
    });

    it("should handle empty streams in object", async () => {
      const streamsObj = {
        a: arrayStream(["a1"]),
        b: arrayStream([]),
        c: arrayStream(["c2"]),
      };
      const mergedStream = mergeKeyed(streamsObj);
      const result = await collect(mergedStream);
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([{ a: "a1" }, { c: "c2" }]),
      );
    });

    it("should handle empty object", async () => {
      const streamsObj = {};
      const mergedStream = mergeKeyed(streamsObj);
      const result = await collect(mergedStream);
      expect(result).toEqual([]);
    });
  });

  describe("concat", () => {
    // NOTE: The implementation in index.ts looks identical to merge,
    // which is incorrect for concat. Concat should process streams sequentially.
    // These tests assume the *intended* behavior of concat.
    // If the implementation remains like merge, these tests might fail or show unexpected order.
    it("should concatenate streams sequentially", async () => {
      const stream1 = delayedStream([1, 2], 5);
      const stream2 = delayedStream([3, 4], 5);

      const concatenatedStream = concat([stream1, stream2]);
      const result = await collect(concatenatedStream);

      // Concat guarantees order: stream1 fully processed, then stream2
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it("should handle empty streams", async () => {
      const stream1 = arrayStream([1, 2]);
      const stream2 = arrayStream([]);
      const stream3 = arrayStream([3]);

      const concatenatedStream = concat([stream1, stream2, stream3]);
      const result = await collect(concatenatedStream);
      expect(result).toEqual([1, 2, 3]); // Empty stream is skipped
    });

    it("should handle only empty streams", async () => {
      const stream1 = arrayStream([]);
      const stream2 = arrayStream([]);
      const concatenatedStream = concat([stream1, stream2]);
      const result = await collect(concatenatedStream);
      expect(result).toEqual([]);
    });

    it("should handle a single stream", async () => {
      const stream1 = arrayStream([1, 2, 3]);
      const concatenatedStream = concat([stream1]);
      const result = await collect(concatenatedStream);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe("pipeThrough", () => {
    // Helper TransformStream: Convert to uppercase
    const toUpperCaseTransform = <T extends { toString(): string }>() =>
      new TransformStream<T, string>({
        transform(chunk, controller) {
          controller.enqueue(chunk.toString().toUpperCase());
        },
      });

    // Helper TransformStream: Add brackets
    const addBracketsTransform = <T>() =>
      new TransformStream<T, string>({
        transform(chunk, controller) {
          controller.enqueue(`[${chunk}]`);
        },
      });

    // Helper TransformStream: Filter out odd numbers
    const filterOddTransform = () =>
      new TransformStream<number, number>({
        transform(chunk, controller) {
          if (typeof chunk === "number" && chunk % 2 === 0) {
            controller.enqueue(chunk);
          }
        },
      });

    it("should pipe through a single transform stream", async () => {
      const source = arrayStream(["a", "b", "c"]);
      const transform = toUpperCaseTransform<string>();
      const piped = source.pipeThrough(pipeThrough(transform));
      const result = await collect(piped);
      expect(result).toEqual(["A", "B", "C"]);
    });

    it("should pipe through multiple transform streams sequentially", async () => {
      const source = arrayStream(["a", "b"]);
      const upper = toUpperCaseTransform<string>();
      const brackets = addBracketsTransform<string>();
      const piped = source.pipeThrough(pipeThrough(upper, brackets));
      const result = await collect(piped);
      expect(result).toEqual(["[A]", "[B]"]);
    });

    it("should pipe through multiple transforms with different types", async () => {
      const source = arrayStream([1, 2, 3, 4, 5, 6]);
      const filter = filterOddTransform();
      const brackets = addBracketsTransform<number>();
      const piped = source.pipeThrough(pipeThrough(filter, brackets));
      const result = await collect(piped);
      expect(result).toEqual(["[2]", "[4]", "[6]"]);
    });

    it("should handle an empty input stream", async () => {
      const source = arrayStream<string>([]);
      const upper = toUpperCaseTransform<string>();
      const brackets = addBracketsTransform<string>();
      const piped = source.pipeThrough(pipeThrough(upper, brackets));
      const result = await collect(piped);
      expect(result).toEqual([]);
    });

    it("should throw an error if no transform streams are provided", () => {
      // Need to wrap the call in a function for expect().toThrow()
      expect(() => pipeThrough()).toThrow(
        "pipeThrough needs at least one TransformStream",
      );
    });

    it("should handle a single transform when input stream is directly piped", async () => {
      const source = arrayStream(["x", "y"]);
      const transform = addBracketsTransform<string>();
      // pipeThrough should return the single transform if only one is passed
      const piped = source.pipeThrough(pipeThrough(transform));
      const result = await collect(piped);
      expect(result).toEqual(["[x]", "[y]"]);
    });
  });
});

// Potential issue found during test writing:
// The 'concat' implementation in index.ts appears to be a copy of 'merge'.
// 'concat' should process streams one after another, not concurrently like 'merge'.
// The tests above for 'concat' assume the correct sequential behavior.
// If the tests fail with interleaved results, the 'concat' implementation needs correction.
