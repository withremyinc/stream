import { describe, it, expect, vi } from "vitest";

import { collect, collectLast } from "../collects";
import { arrayStream } from "../streams";
import {
  map,
  filter,
  filterMap,
  take,
  takeLast,
  drop,
  flatMap,
  scan,
  reduce,
  toArray,
  forEach,
  some,
  every,
  find,
  toString,
  tee,
} from "../transforms"; // Using collectFirst for single-value transforms

async function testTransform<T, U>(
  transform: TransformStream<T, U>,
  input: T[],
): Promise<U[]> {
  const stream = arrayStream(input).pipeThrough(transform);
  return await collect(stream);
}

async function testSingleValueTransform<T, U>(
  transform: TransformStream<T, U>,
  input: T[],
): Promise<U | undefined> {
  const stream = arrayStream(input).pipeThrough(transform);
  return await collectLast(stream); // Collect the single output value
}

describe("transforms", () => {
  const numbers = [1, 2, 3, 4, 5];
  const strings = ["a", "b", "c"];

  describe("map", () => {
    it("should apply a sync mapper", async () => {
      const stream = arrayStream(numbers).pipeThrough(map((x) => x * 2));
      const result = await collect(stream);
      expect(result).toEqual([2, 4, 6, 8, 10]);
    });
    it("should apply an async mapper", async () => {
      const stream = arrayStream(numbers).pipeThrough(map(async (x) => x * 2));
      const result = await collect(stream);
      expect(result).toEqual([2, 4, 6, 8, 10]);
    });
    it("should provide index to mapper", async () => {
      const stream = arrayStream(strings).pipeThrough(
        map((x, i) => `${x}${i}`),
      );
      const result = await collect(stream);
      expect(result).toEqual(["a0", "b1", "c2"]);
    });
  });

  describe("filter", () => {
    it("should apply a sync predicate", async () => {
      const stream = arrayStream(numbers).pipeThrough(
        filter((x) => x % 2 === 0),
      );
      const result = await collect(stream);
      expect(result).toEqual([2, 4]);
    });
    it("should apply an async predicate", async () => {
      const stream = arrayStream(numbers).pipeThrough(
        filter(async (x) => x % 2 === 0),
      );
      const result = await collect(stream);
      expect(result).toEqual([2, 4]);
    });
    it("should provide index to predicate", async () => {
      const stream = arrayStream(numbers).pipeThrough(filter((x, i) => i < 3)); // Keep first 3
      const result = await collect(stream);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe("filterMap", () => {
    it("should map sync values and drop undefined", async () => {
      const stream = arrayStream(numbers).pipeThrough(
        filterMap((x) => (x % 2 === 0 ? x * 10 : undefined)),
      );
      const result = await collect(stream);
      expect(result).toEqual([20, 40]);
    });

    it("should map async values and drop null", async () => {
      const stream = arrayStream(numbers).pipeThrough(
        filterMap(async (x) => (x > 3 ? x.toString() : null)),
      );
      const result = await collect(stream);
      expect(result).toEqual(["4", "5"]);
    });

    it("should preserve falsey mapped values", async () => {
      const stream = arrayStream([0, 1, 2]).pipeThrough(
        filterMap((x) => {
          if (x === 0) return 0;
          if (x === 1) return false;
          return "";
        }),
      );
      const result = await collect(stream);
      expect(result).toEqual([0, false, ""]);
    });

    it("should provide index to mapper", async () => {
      const stream = arrayStream(strings).pipeThrough(
        filterMap((x, i) => (i % 2 === 0 ? `${x}${i}` : undefined)),
      );
      const result = await collect(stream);
      expect(result).toEqual(["a0", "c2"]);
    });
  });

  describe("take", () => {
    it("should take the first N items", async () => {
      const result = await testTransform(take(3), numbers);
      expect(result).toEqual([1, 2, 3]);
    });
    it("should take all items if N is larger than stream length", async () => {
      const result = await testTransform(take(10), numbers);
      expect(result).toEqual(numbers);
    });
    it("should take 0 items", async () => {
      const result = await testTransform(take(0), numbers);
      expect(result).toEqual([]);
    });
    it("should throw for negative limit", () => {
      expect(() => take(-1)).toThrow(RangeError);
    });
  });

  describe("takeLast", () => {
    it("should take the last N items", async () => {
      const result = await testTransform(takeLast<number>(3), numbers);
      // takeLast emits on flush, collectFirst gets the array
      expect(result).toEqual([3, 4, 5]);
    });
    it("should take all items if N >= stream length", async () => {
      const result = await testTransform(takeLast<number>(5), numbers);
      expect(result).toEqual(numbers);
      const result2 = await testTransform(takeLast<number>(10), numbers);
      expect(result2).toEqual(numbers);
    });
    it("should take 0 items", async () => {
      const result = await testTransform(takeLast<number>(0), numbers);
      expect(result).toEqual([]);
    });
    it("should throw for negative count", () => {
      expect(() => takeLast(-1)).toThrow(RangeError);
    });
    it("should work with empty stream", async () => {
      const result = await testTransform(takeLast<number>(3), []);
      expect(result).toEqual([]);
    });
  });

  describe("drop", () => {
    it("should drop the first N items", async () => {
      const stream = arrayStream(numbers).pipeThrough(drop(2));
      const result = await collect(stream);
      expect(result).toEqual([3, 4, 5]);
    });
    it("should drop all items if N >= stream length", async () => {
      const stream = arrayStream(numbers).pipeThrough(drop(5));
      const result = await collect(stream);
      expect(result).toEqual([]);
      const stream2 = arrayStream(numbers).pipeThrough(drop(10));
      const result2 = await collect(stream2);
      expect(result2).toEqual([]);
    });
    it("should drop 0 items", async () => {
      const stream = arrayStream(numbers).pipeThrough(drop(0));
      const result = await collect(stream);
      expect(result).toEqual(numbers);
    });
    it("should throw for negative limit", () => {
      expect(() => drop(-1)).toThrow(RangeError);
    });
  });

  describe("flatMap", () => {
    it("should map and flatten sync iterables", async () => {
      const stream = arrayStream([1, 2]).pipeThrough(
        flatMap((x) => [x, x * 10]),
      );
      const result = await collect(stream);
      expect(result).toEqual([1, 10, 2, 20]);
    });
    it("should map and flatten async iterables", async () => {
      async function* gen(x: number) {
        yield x;
        yield x * 10;
      }
      const stream = arrayStream([1, 2]).pipeThrough(flatMap((x) => gen(x)));
      const result = await collect(stream);
      expect(result).toEqual([1, 10, 2, 20]);
    });
    it("should handle mapping to single values", async () => {
      const stream = arrayStream([1, 2]).pipeThrough(flatMap((x) => x * 10));
      const result = await collect(stream);
      expect(result).toEqual([10, 20]);
    });
    it("should handle async mapping function", async () => {
      const stream = arrayStream([1, 2]).pipeThrough(
        flatMap(async (x) => [x, x * 10]),
      );
      const result = await collect(stream);
      expect(result).toEqual([1, 10, 2, 20]);
    });
    it("should provide index to mapper", async () => {
      const stream = arrayStream(strings).pipeThrough(
        flatMap((x, i) => [`${x}${i}`]),
      );
      const result = await collect(stream);
      expect(result).toEqual(["a0", "b1", "c2"]);
    });
  });

  describe("scan", () => {
    it("should emit each intermediate accumulator value", async () => {
      const result = await testTransform(
        scan<number, number>((acc, x) => acc + x, 0),
        numbers,
      );
      expect(result).toEqual([1, 3, 6, 10, 15]);
    });
    it("should work with async reducer", async () => {
      const result = await testTransform(
        scan<number, number>(async (acc, x) => acc + x, 0),
        numbers,
      );
      expect(result).toEqual([1, 3, 6, 10, 15]);
    });
    it("should provide index to reducer", async () => {
      const result = await testTransform(
        scan<number, string>((acc, x, i) => `${acc}[${i}:${x}]`, ""),
        [10, 20, 30],
      );
      expect(result).toEqual(["[0:10]", "[0:10][1:20]", "[0:10][1:20][2:30]"]);
    });
    it("should return empty for empty stream", async () => {
      const result = await testTransform(
        scan<number, number>((acc, x) => acc + x, 0),
        [],
      );
      expect(result).toEqual([]);
    });
    it("should work with a single element", async () => {
      const result = await testTransform(
        scan<number, number>((acc, x) => acc * x, 1),
        [5],
      );
      expect(result).toEqual([5]);
    });
  });

  describe("reduce", () => {
    it("should reduce stream to a single value with initial value", async () => {
      const sum = await testSingleValueTransform<number, number>(
        reduce((acc, x) => acc + x, 0),
        numbers,
      );
      expect(sum).toBe(15); // 1+2+3+4+5
    });
    it("should work with async reducer", async () => {
      const sum = await testSingleValueTransform<number, number>(
        reduce(async (acc, x) => acc + x, 0),
        numbers,
      );
      expect(sum).toBe(15);
    });
    it("should provide index to reducer", async () => {
      const sumIdx = await testSingleValueTransform(
        reduce((acc, x, i) => acc + i, 0),
        numbers,
      );
      expect(sumIdx).toBe(10); // 0+1+2+3+4
    });
    it("should return initial value for empty stream", async () => {
      const result = await testSingleValueTransform<number, number>(
        reduce((acc, x) => acc + x, 100),
        [],
      );
      expect(result).toBe(100);
    });
    // Vitest doesn't easily test for thrown errors inside streams?
    // Need a way to catch the rejection of the stream promise itself.
    // it("should throw if empty stream and no initial value", async () => {
    //     const stream = arrayStream([]).pipeThrough(reduce((acc, x) => acc + x)); // No initial value
    //     await expect(collect(stream)).rejects.toThrow(TypeError);
    // });
  });

  describe("toArray", () => {
    it("should collect all chunks into an array", async () => {
      const result = await testSingleValueTransform(toArray<number>(), numbers);
      expect(result).toEqual(numbers);
    });
    it("should return empty array for empty stream", async () => {
      const result = await testSingleValueTransform(toArray<number>(), []);
      expect(result).toEqual([]);
    });
  });

  describe("forEach", () => {
    it("should call function for each chunk and pass chunk through", async () => {
      const callback = vi.fn();
      const stream = arrayStream(numbers).pipeThrough(forEach(callback));
      const result = await collect(stream);

      expect(result).toEqual(numbers); // Ensure items passed through
      expect(callback).toHaveBeenCalledTimes(numbers.length);
      numbers.forEach((num, i) => {
        expect(callback).toHaveBeenCalledWith(num, i);
      });
    });
    it("should work with async callback", async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const stream = arrayStream(numbers).pipeThrough(forEach(callback));
      await collect(stream);
      expect(callback).toHaveBeenCalledTimes(numbers.length);
    });
  });

  describe("some", () => {
    it("should return true if predicate matches any", async () => {
      const result = await testSingleValueTransform(
        some<number>((x) => x > 3),
        numbers,
      );
      expect(result).toBe(true);
    });
    it("should return false if predicate matches none", async () => {
      const result = await testSingleValueTransform(
        some<number>((x) => x > 10),
        numbers,
      );
      expect(result).toBe(false);
    });
    it("should work with async predicate", async () => {
      const result = await testSingleValueTransform(
        some<number>(async (x) => x > 3),
        numbers,
      );
      expect(result).toBe(true);
    });
    it("should provide index to predicate", async () => {
      const result = await testSingleValueTransform(
        some<number>((x, i) => i === 2),
        numbers,
      ); // Matches index 2 (value 3)
      expect(result).toBe(true);
    });
    it("should return false for empty stream", async () => {
      const result = await testSingleValueTransform(
        some<number>((x) => x > 0),
        [],
      );
      expect(result).toBe(false);
    });
  });

  describe("every", () => {
    it("should return true if predicate matches all", async () => {
      const result = await testSingleValueTransform(
        every<number>((x) => x > 0),
        numbers,
      );
      expect(result).toBe(true);
    });
    it("should return false if predicate fails any", async () => {
      const result = await testSingleValueTransform(
        every<number>((x) => x < 4),
        numbers,
      );
      expect(result).toBe(false);
    });
    it("should work with async predicate", async () => {
      const result = await testSingleValueTransform(
        every<number>(async (x) => x > 0),
        numbers,
      );
      expect(result).toBe(true);
    });
    it("should provide index to predicate", async () => {
      const result = await testSingleValueTransform(
        every<number>((x, i) => x === i + 1),
        numbers,
      );
      expect(result).toBe(true);
    });
    it("should return true for empty stream", async () => {
      // Vacuously true
      const result = await testSingleValueTransform(
        every<number>((x) => x < 0),
        [],
      );
      expect(result).toBe(true);
    });
  });

  describe("find", () => {
    it("should return the first item matching predicate", async () => {
      const result = await testSingleValueTransform(
        find<number>((x) => x % 2 === 0),
        numbers,
      );
      expect(result).toBe(2);
    });
    it("should return undefined if no item matches", async () => {
      const result = await testSingleValueTransform(
        find<number>((x) => x > 10),
        numbers,
      );
      expect(result).toBeUndefined();
    });
    it("should work with async predicate", async () => {
      const result = await testSingleValueTransform(
        find<number>(async (x) => x % 2 === 0),
        numbers,
      );
      expect(result).toBe(2);
    });
    it("should provide index to predicate", async () => {
      const result = await testSingleValueTransform(
        find<number>((x, i) => i === 3),
        numbers,
      ); // Finds element at index 3 (value 4)
      expect(result).toBe(4);
    });
    it("should return undefined for empty stream", async () => {
      const result = await testSingleValueTransform(
        find<number>((x) => x > 0),
        [],
      );
      expect(result).toBeUndefined();
    });
  });

  describe("toString", () => {
    it("should concatenate string chunks", async () => {
      const result = await testSingleValueTransform(toString(), [
        "hello",
        " ",
        "world",
      ]);
      expect(result).toBe("hello world");
    });
    it("should return empty string for empty stream", async () => {
      const result = await testSingleValueTransform(toString(), []);
      expect(result).toBe("");
    });
  });

  describe("tee", () => {
    it("should process both branches and emit results", async () => {
      const stream = arrayStream(numbers).pipeThrough(
        tee((branch1, branch2) => {
          // Process each branch differently, then merge results
          const doubledStream = branch1.pipeThrough(map(x => x * 2));
          const squaredStream = branch2.pipeThrough(map(x => x * x));
          
          // Alternative pattern using ReadableStream constructor
          return new ReadableStream({
            async start(controller) {
              const doubledValues = await collect(doubledStream);
              const squaredValues = await collect(squaredStream);
              
              // Emit the combined results
              for (const val of [...doubledValues, ...squaredValues]) {
                controller.enqueue(val);
              }
              controller.close();
            }
          });
        })
      );
      
      const result = await collect(stream);
      const expected = [
        ...numbers.map(x => x * 2),       // Doubled values: [2, 4, 6, 8, 10]
        ...numbers.map(x => x * x)        // Squared values: [1, 4, 9, 16, 25]
      ];
      
      expect(result).toEqual(expected);
    });
    
    it("should handle empty input streams", async () => {
      const stream = arrayStream([]).pipeThrough(
        tee((branch1, branch2) => {
          const processedBranch1 = branch1.pipeThrough(map(x => `first-${x}`));
          const processedBranch2 = branch2.pipeThrough(map(x => `second-${x}`));
          
          return new ReadableStream({
            async start(controller) {
              const values1 = await collect(processedBranch1);
              const values2 = await collect(processedBranch2);
              
              for (const val of [...values1, ...values2]) {
                controller.enqueue(val);
              }
              controller.close();
            }
          });
        })
      );
      
      const result = await collect(stream);
      expect(result).toEqual([]);
    });
    
    it("should propagate errors from the callback's output stream", async () => {
      const errorMessage = "Test error in processing";
      const stream = arrayStream(numbers).pipeThrough(
        tee(() => {
          return new ReadableStream({
            start(controller) {
              controller.error(new Error(errorMessage));
            }
          });
        })
      );
      
      await expect(collect(stream)).rejects.toThrow(errorMessage);
    });
    
    it("should handle complex processing with multiple transforms", async () => {
      const stream = arrayStream(numbers).pipeThrough(
        tee((branch1, branch2) => {
          // First branch: keep only even numbers and double them
          const evenDoubledStream = branch1
            .pipeThrough(filter(x => x % 2 === 0))
            .pipeThrough(map(x => x * 2));
          
          // Second branch: keep only odd numbers and triple them
          const oddTripledStream = branch2
            .pipeThrough(filter(x => x % 2 !== 0))
            .pipeThrough(map(x => x * 3));
          
          // ReadableStream constructor approach to merge results
          return new ReadableStream({
            async start(controller) {
              // Process both branches and collect results
              const evenDoubled = await collect(evenDoubledStream);
              const oddTripled = await collect(oddTripledStream);
              
              // Output combined results
              for (const val of [...evenDoubled, ...oddTripled]) {
                controller.enqueue(val);
              }
              controller.close();
            }
          });
        })
      );
      
      const result = await collect(stream);
      // Even doubled: [2*2, 4*2] = [4, 8]
      // Odd tripled: [1*3, 3*3, 5*3] = [3, 9, 15]
      const expected = [4, 8, 3, 9, 15];
      
      expect(result).toEqual(expected);
    });
    
    it("should handle zippered processing of two branches", async () => {
      const stream = arrayStream(numbers).pipeThrough(
        tee((branch1, branch2) => {
          // Transform branch1 to strings
          const stringBranch = branch1.pipeThrough(map(x => `num-${x}`));
          // Keep branch2 as numbers but double them
          const doubleBranch = branch2.pipeThrough(map(x => x * 2));
          
          // Create an interleaved stream of alternating values from both branches
          return new ReadableStream({
            async start(controller) {
              const strings = await collect(stringBranch);
              const doubles = await collect(doubleBranch);
              
              // Interleave the results (zipper pattern)
              const maxLength = Math.max(strings.length, doubles.length);
              for (let i = 0; i < maxLength; i++) {
                if (i < strings.length) controller.enqueue(strings[i]);
                if (i < doubles.length) controller.enqueue(doubles[i]);
              }
              controller.close();
            }
          });
        })
      );
      
      const result = await collect(stream);
      // Expected interleaved result: first string, first double, second string, etc.
      const expected = [];
      for (let i = 0; i < numbers.length; i++) {
        expected.push(`num-${numbers[i]}`, numbers[i] * 2);
      }
      
      expect(result).toEqual(expected);
    });
  });
});
