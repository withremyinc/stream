/**
 * Applies a synchronous or asynchronous mapper to each chunk.
 * @param mapper - Function transforming each chunk with its index.
 * @returns TransformStream emitting mapped chunks of type U.
 */
export function map<T, U>(
  mapper: (chunk: T, index: number) => U | Promise<U>,
): TransformStream<T, U> {
  let counter = 0;
  return new TransformStream<T, U>({
    async transform(chunk, controller) {
      const result = await mapper(chunk, counter++);
      controller.enqueue(result);
    },
  });
}

/**
 * Filters chunks based on a synchronous or asynchronous predicate.
 * @param predicate - Function returning truthy to keep chunk.
 * @returns TransformStream emitting only chunks that satisfy predicate.
 */
export function filter<T>(
  predicate: (chunk: T, index: number) => boolean | Promise<boolean>,
): TransformStream<T, T> {
  let counter = 0;
  return new TransformStream<T, T>({
    async transform(chunk, controller) {
      if (await predicate(chunk, counter++)) {
        controller.enqueue(chunk);
      }
    },
  });
}

/**
 * Emits up to `limit` chunks then closes the stream.
 * @param limit - Maximum number of chunks to emit.
 * @throws RangeError for negative or NaN limit.
 * @returns TransformStream passing through up to `limit` chunks.
 */
export function take<T>(limit: number = 1): TransformStream<T, T> {
  if (limit < 0 || Number.isNaN(limit)) {
    throw new RangeError("limit must be a non-negative number");
  }
  let taken = 0;
  return new TransformStream<T, T>({
    transform(chunk, controller) {
      if (taken < limit) {
        controller.enqueue(chunk);
        taken++;
        if (taken >= limit) controller.terminate();
      }
    },
  });
}

/**
 * Buffers the last `count` chunks and emits them on completion.
 * @param count - Number of trailing chunks to take.
 * @throws RangeError for negative or NaN count.
 * @returns TransformStream emitting the last `count` chunks upon flush.
 */
export function takeLast<T>(count: number = 1): TransformStream<T, T> {
  if (count < 0 || Number.isNaN(count)) {
    throw new RangeError("count must be a non-negative number");
  }
  const buffer: T[] = [];
  return new TransformStream<T, T>({
    transform(chunk) {
      buffer.push(chunk);
      if (buffer.length > count) {
        buffer.shift();
      }
    },
    flush(controller) {
      for (const item of buffer) {
        controller.enqueue(item);
      }
    },
  });
}

/**
 * Skips the first `limit` chunks, then emits the rest.
 * @param limit - Number of initial chunks to drop.
 * @throws RangeError for negative or NaN limit.
 * @returns TransformStream skipping the first `limit` chunks.
 */
export function drop<T>(limit: number): TransformStream<T, T> {
  if (limit < 0 || Number.isNaN(limit)) {
    throw new RangeError("limit must be a non-negative number");
  }
  let dropped = 0;
  return new TransformStream<T, T>({
    transform(chunk, controller) {
      if (dropped < limit) {
        dropped++;
      } else {
        controller.enqueue(chunk);
      }
    },
  });
}

/**
 * Maps each chunk to an (async) iterable then flattens.
 * @param mapper - Function returning an iterable or single value.
 * @returns TransformStream flattening mapped iterables.
 */
export function flatMap<T, U>(
  mapper: (
    chunk: T,
    index: number,
  ) =>
    | Iterable<U>
    | AsyncIterable<U>
    | U
    | Promise<Iterable<U> | AsyncIterable<U> | U>,
): TransformStream<T, U> {
  let counter = 0;
  return new TransformStream<T, U>({
    async transform(chunk, controller) {
      const mapped = await mapper(chunk, counter++);
      const iter = (async function* () {
        if (mapped != null && Symbol.asyncIterator in Object(mapped)) {
          yield* mapped as AsyncIterable<U>;
        } else if (mapped != null && Symbol.iterator in Object(mapped)) {
          yield* mapped as Iterable<U>;
        } else {
          yield mapped as U;
        }
      })();
      for await (const item of iter) {
        controller.enqueue(item);
      }
    },
  });
}

/**
 * Accumulates chunks into a single result, emitting it on completion.
 * @param reducer - Function combining accumulator and chunk.
 * @param initialValue - Initial accumulator value.
 * @returns TransformStream emitting final accumulator.
 * @throws TypeError if stream is empty and no initialValue provided.
 */
export function reduce<T, U>(
  reducer: (accumulator: U, chunk: T, index: number) => U | Promise<U>,
  initialValue: U,
): TransformStream<T, U> {
  let accumulator = initialValue;
  let idx = 0;
  return new TransformStream<T, U>({
    async transform(chunk) {
      accumulator = await reducer(accumulator, chunk, idx++);
    },
    async flush(controller) {
      controller.enqueue(accumulator);
    },
  });
}

/**
 * Collects all chunks into an array and emits it on completion.
 * @returns TransformStream emitting T[] on flush.
 */
export function toArray<T>(): TransformStream<T, T[]> {
  const arr: T[] = [];
  return new TransformStream<T, T[]>({
    transform(chunk) {
      arr.push(chunk);
    },
    flush(controller) {
      controller.enqueue(arr);
    },
  });
}

/**
 * Executes a function for each chunk, re-emitting the chunk.
 * @param fn - Function to execute per chunk.
 * @returns TransformStream that emits the original chunks.
 */
export function forEach<T>(
  fn: (chunk: T, index: number) => void | Promise<void>,
): TransformStream<T, T> {
  let idx = 0;
  return new TransformStream<T, T>({
    async transform(chunk, controller) {
      await fn(chunk, idx++);
      controller.enqueue(chunk);
    },
  });
}

/**
 * Emits `true` if any chunk satisfies predicate, else `false`.
 * @param predicate - Function testing each chunk.
 * @returns TransformStream emitting a single boolean on flush.
 */
export function some<T>(
  predicate: (chunk: T, index: number) => boolean | Promise<boolean>,
): TransformStream<T, boolean> {
  let idx = 0;
  let found = false;
  return new TransformStream<T, boolean>({
    async transform(chunk, controller) {
      if (!found && (await predicate(chunk, idx++))) {
        found = true;
        controller.enqueue(true);
      }
    },
    flush(controller) {
      if (!found) controller.enqueue(false);
    },
  });
}

/**
 * Emits `false` if any chunk fails predicate, else `true`.
 * @param predicate - Function testing each chunk.
 * @returns TransformStream emitting a single boolean on flush.
 */
export function every<T>(
  predicate: (chunk: T, index: number) => boolean | Promise<boolean>,
): TransformStream<T, boolean> {
  let idx = 0;
  let all = true;
  return new TransformStream<T, boolean>({
    async transform(chunk, controller) {
      if (all && !(await predicate(chunk, idx++))) {
        all = false;
        controller.enqueue(false);
      }
    },
    flush(controller) {
      if (all) controller.enqueue(true);
    },
  });
}

/**
 * Finds the first chunk satisfying a predicate, emits it or `undefined`.
 * @param predicate - Function testing each chunk.
 * @returns TransformStream emitting the matched chunk or undefined.
 */
export function find<T>(
  predicate: (chunk: T, index: number) => boolean | Promise<boolean>,
): TransformStream<T, T | undefined> {
  let idx = 0;
  let found = false;
  return new TransformStream<T, T | undefined>({
    async transform(chunk, controller) {
      if (!found && (await predicate(chunk, idx++))) {
        found = true;
        controller.enqueue(chunk);
      }
    },
    flush(controller) {
      if (!found) controller.enqueue(undefined);
    },
  });
}

/**
 * Duplicates the stream into two branches, processes them with a callback,
 * and emits the results from the callback's output stream.
 *
 * This allows performing parallel or divergent processing paths on the same
 * sequence of input chunks. The `callback` function receives two identical
 * readable streams derived from the input. It must return a new readable
 * stream whose output will be emitted by the `tee` transform.
 *
 * @template T0 The type of the input chunks.
 * @template T1 The type of the output chunks (determined by the callback).
 * @param callback A function that takes two `ReadableStream<T0>` instances
 *   and returns a `ReadableStream<T1>`. This function defines how the
 *   two branched streams are processed to produce the final output stream.
 * @returns A `TransformStream<T0, T1>` that forwards chunks from the
 *   stream returned by the `callback`.
 */
export function tee<T0, T1>(
  callback: (
    branch1: ReadableStream<T0>,
    branch2: ReadableStream<T0>,
  ) => ReadableStream<T1>,
): TransformStream<T0, T1> {
  // Internal stream to duplicate the input
  const streams = new TransformStream<T0, T0>();
  const [branch1, branch2] = streams.readable.tee();

  // User-defined processing pipeline using the two branches
  const output = callback(branch1, branch2);

  // Writer for the internal stream
  let writer: WritableStreamDefaultWriter<T0>;
  // Promise tracking the background processing of the 'output' stream
  let outputProcessingPromise: Promise<void>;

  return new TransformStream<T0, T1>({
    start(controller) {
      writer = streams.writable.getWriter();
      // Start processing the output stream in the background
      outputProcessingPromise = (async () => {
        const reader = output.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              // Output stream finished normally. Outer stream closure is handled in flush.
              break;
            }
            // Enqueue the processed chunk to the outer stream's controller
            controller.enqueue(value);
          }
        } catch (err) {
          // Propagate error from the user's pipeline ('output' stream)
          controller.error(err);
          // Abort the internal writer to signal upstream and potentially stop branch processing
          await writer.abort(err).catch(() => {}); // Ignore abort errors
        } finally {
          // Release the reader lock regardless of success or failure
          reader.releaseLock();
        }
      })();
    },

    async transform(chunk /*, controller */) {
      // Write the original chunk to the internal stream.
      // This feeds both branch1 and branch2 via the tee mechanism.
      // Backpressure is handled by awaiting the write.
      // Errors during write likely originate downstream (in the callback/output stream)
      // and should be caught by the outputProcessingPromise loop.
      if (!writer) throw new Error("Writer not initialized in tee transform"); // Should not happen
      await writer.write(chunk);
    },

    async flush(/* controller */) {
      // Input stream is done (all chunks transformed), close the internal writer.
      // This signals EOF to streams.readable, then to branch1 and branch2.
      if (!writer) throw new Error("Writer not initialized in tee flush"); // Should not happen
      await writer.close();

      // Wait for the user's pipeline (output stream processing) to complete.
      // This ensures all chunks produced by the callback have been enqueued or an error occurred.
      if (!outputProcessingPromise)
        throw new Error("Output processing not started in tee flush"); // Should not happen
      await outputProcessingPromise;

      // If outputProcessingPromise completed without erroring the controller,
      // the outer stream can now close normally. This happens implicitly when
      // flush completes successfully. If outputProcessingPromise errored,
      // controller.error() was already called, and the stream is in an errored state.
    },
  });
}

/**
 * Concatenates string chunks into one string, emits on completion.
 * @returns TransformStream converting strings to a single string.
 */
export function toString(): TransformStream<string, string> {
  let result = "";
  return new TransformStream<string, string>({
    transform(chunk) {
      result += chunk;
    },
    flush(controller) {
      controller.enqueue(result);
    },
  });
}
