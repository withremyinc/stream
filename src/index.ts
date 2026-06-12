export * from "./streams";
export * from "./collects";
export * from "./transforms";

export * from "./json/json";
export * from "./xml/xml";

/**
 * Merges multiple ReadableStreams into a single stream of chunks as they arrive.
 * @param streams - Array of ReadableStreams to merge.
 * @returns ReadableStream emitting chunks from all sources.
 */
export function merge<T>(streams: ReadableStream<T>[]): ReadableStream<T> {
  const readers = streams.map((s) => s.getReader());
  // `settled` gates every controller.error()/controller.close() call so the
  // controller is never closed after it has been errored (and vice versa),
  // which would otherwise throw ERR_INVALID_STATE.
  let settled = false;

  return new ReadableStream<T>({
    start(controller) {
      let active = readers.length;

      if (active === 0) {
        settled = true;
        controller.close();
        return;
      }

      readers.forEach((reader) => {
        const pump = async () => {
          try {
            while (!settled) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!settled) controller.enqueue(value);
            }
          } catch (e) {
            if (!settled) {
              settled = true;
              controller.error(e);
              // Cancel the sibling readers so they don't hang.
              await Promise.all(
                readers
                  .filter((r) => r !== reader)
                  .map((r) => r.cancel(e).catch(() => {})),
              );
            }
          } finally {
            reader.releaseLock();
            active--;
            if (active === 0 && !settled) {
              settled = true;
              controller.close();
            }
          }
        };
        pump();
      });
    },
    cancel(reason) {
      settled = true;
      return Promise.all(
        readers.map((r) => r.cancel(reason).catch(() => {})),
      ).then(() => undefined);
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
  const entries = Object.entries(streamsObj).map(
    ([key, stream]) =>
      [key, (stream as ReadableStream).getReader()] as const,
  );
  // See `merge` above: `settled` prevents close-after-error / double-close.
  let settled = false;

  return new ReadableStream<Partial<V>>({
    start(controller) {
      let active = entries.length;

      if (active === 0) {
        settled = true;
        controller.close();
        return;
      }

      entries.forEach(([key, reader]) => {
        (async function pump() {
          try {
            while (!settled) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!settled) controller.enqueue({ [key]: value } as Partial<V>);
            }
          } catch (e) {
            if (!settled) {
              settled = true;
              controller.error(e);
              await Promise.all(
                entries
                  .filter(([, r]) => r !== reader)
                  .map(([, r]) => r.cancel(e).catch(() => {})),
              );
            }
          } finally {
            reader.releaseLock();
            active--;
            if (active === 0 && !settled) {
              settled = true;
              controller.close();
            }
          }
        })();
      });
    },
    cancel(reason) {
      settled = true;
      return Promise.all(
        entries.map(([, r]) => r.cancel(reason).catch(() => {})),
      ).then(() => undefined);
    },
  });
}

/**
 * Concatenates multiple ReadableStreams into a single ReadableStream.
 * @param streams - Array of ReadableStreams to concatenate.
 * @returns ReadableStream emitting chunks from all input streams in order.
 */
export function concat<T>(streams: ReadableStream<T>[]): ReadableStream<T> {
  const readers = streams.map((s) => s.getReader());
  // Reading happens in pull() so sources are only drained as fast as the
  // consumer reads, instead of buffering every chunk up front.
  let index = 0;
  let cancelled = false;

  return new ReadableStream<T>({
    async pull(controller) {
      while (index < readers.length) {
        const reader = readers[index];
        let result: ReadableStreamReadResult<T>;
        try {
          result = await reader.read();
        } catch (e) {
          // Cancel the remaining sources so they don't hang.
          index++;
          await Promise.all(
            readers.slice(index).map((r) => r.cancel(e).catch(() => {})),
          );
          throw e;
        }
        // A cancel() that raced this read already settled the stream.
        if (cancelled) return;
        if (!result.done) {
          controller.enqueue(result.value);
          return;
        }
        reader.releaseLock();
        index++;
      }
      controller.close();
    },
    cancel(reason) {
      cancelled = true;
      return Promise.all(
        readers.slice(index).map((r) => r.cancel(reason).catch(() => {})),
      ).then(() => undefined);
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
