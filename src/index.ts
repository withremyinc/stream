export * from "./streams";
export * from "./collects";
export * from "./transforms";

export * from "./json/json";

/**
 * Merges multiple ReadableStreams into a single stream of chunks as they arrive.
 * @param streams - Array of ReadableStreams to merge.
 * @returns ReadableStream emitting chunks from all sources.
 */
export function merge<T>(streams: ReadableStream<T>[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      const readers = streams.map((s) => s.getReader());
      let active = readers.length;
      readers.forEach((reader) => {
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (e) {
            controller.error(e);
          } finally {
            active--;
            if (active === 0) controller.close();
          }
        };
        pump();
      });
    },
  });
}

/**
 * Merges an object of ReadableStreams into a single stream of keyed chunks.
 * @param streamsObj - Object mapping keys to ReadableStreams.
 * @returns ReadableStream emitting records `{ [key]: V }` as chunks arrive.
 */
export function mergeKeyed<V extends Record<string, unknown>>(streamsObj: {
  [Key in keyof V]: ReadableStream<V[Key]>;
}): ReadableStream<Partial<V>> {
  return new ReadableStream<Partial<V>>({
    start(controller) {
      const entries = Object.entries(streamsObj);
      let active = entries.length;
      if (active === 0) {
        controller.close();
        return;
      }
      entries.forEach(([key, stream]) => {
        const reader = stream.getReader();
        (async function pump() {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              // @ts-ignore
              controller.enqueue({ [key]: value });
            }
          } catch (e) {
            controller.error(e);
          } finally {
            active--;
            if (active === 0) controller.close();
          }
        })();
      });
    },
  });
}

/**
 * Concatenates multiple ReadableStreams into a single ReadableStream.
 * @param streams - Array of ReadableStreams to concatenate.
 * @returns ReadableStream emitting chunks from all input streams in order.
 */
export function concat<T>(streams: ReadableStream<T>[]): ReadableStream<T> {
  return new ReadableStream<T>({
    async start(controller) {
      const readers = streams.map((s) => s.getReader());
      let active = readers.length;
      for (const reader of readers) {
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (e) {
            controller.error(e);
          } finally {
            active--;
            if (active === 0) controller.close();
          }
        };
        await pump();
      }
    },
  });
}

/**
 * Compose N TransformStreams into a single TransformStream.
 *
 * Usage:
 *   const upper = new TransformStream({ transform(c, ctl){ ctl.enqueue(c.toUpperCase()) }});
 *   const bracket = new TransformStream({ transform(c, ctl){ ctl.enqueue(`[${c}]`) }});
 *
 *   const composed = pipeThrough(upper, bracket);
 *
 *   // write → first stream … output ← last stream
 *   const writer = composed.writable.getWriter();
 *   const reader = composed.readable.getReader();
 *
 *   await writer.write("hello");
 *   await writer.close();
 *
 *   console.log((await reader.read()).value); // “[HELLO]”
 */
export function pipeThrough<In = unknown, Out = unknown>(
  ...streams: TransformStream[]
): TransformStream<In, Out> {
  if (streams.length === 0) {
    throw new Error("pipeThrough needs at least one TransformStream");
  }

  // Wire the pipeline: s0.readable → s1 → s2 → … → sn
  for (let i = 0; i < streams.length - 1; i++) {
    streams[i].readable.pipeThrough(streams[i + 1], { preventCancel: true });
  }

  // Expose the writable of the first and the readable of the last
  const first = streams[0];
  const last = streams[streams.length - 1];

  let promise: Promise<void> | undefined;

  // A simple passthrough wrapper that delegates to the ends of the chain
  return new TransformStream<In, Out>({
    async start(controller) {
      // Forward everything coming out of `last` to our consumer
      promise = last.readable.pipeTo(
        new WritableStream({
          write(chunk) {
            controller.enqueue(chunk as Out);
          },
        }),
        { preventCancel: true },
      );
    },
    async transform(chunk) {
      // Push data into the chain
      const writer = first.writable.getWriter();
      await writer.write(chunk);
      writer.releaseLock();
    },
    async flush() {
      const writer = first.writable.getWriter();
      await writer.close(); // Signal end‑of‑input
      writer.releaseLock();
      if (!promise) {
        throw new Error("Promise is undefined");
      }
      await promise;
    },
  });
}
