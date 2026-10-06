export * from "./streams";
export * from "./collects";
export * from "./transforms";

export * from "./json/json";
export * from "./xml/xml";

function mergeStreams<T, U>(
  streams: ReadableStream<T>[],
  map: (value: T, index: number) => U,
): ReadableStream<U> {
  const readers = streams.map((stream) => stream.getReader());
  const active = new Set(readers.map((_, index) => index));
  // At most one outstanding read per source, so a source that loses a race is
  // not read again before its pending chunk is emitted.
  const pending = new Map<
    number,
    Promise<{ index: number; result: ReadableStreamReadResult<T> }>
  >();
  let settled = false;

  const read = (index: number) => {
    let promise = pending.get(index);
    if (!promise) {
      promise = readers[index].read().then((result) => ({ index, result }));
      pending.set(index, promise);
    }
    return promise;
  };

  const cancelActive = async (reason: unknown): Promise<void> => {
    settled = true;
    const indices = [...active];
    active.clear();
    await Promise.all(
      indices.map((index) => readers[index].cancel(reason).catch(() => {})),
    );
  };

  return new ReadableStream<U>({
    start(controller) {
      if (active.size === 0) {
        settled = true;
        controller.close();
      }
    },
    async pull(controller) {
      while (!settled && active.size > 0) {
        let outcome;
        try {
          outcome = await Promise.race(Array.from(active, read));
        } catch (error) {
          if (settled) return;
          controller.error(error);
          await cancelActive(error);
          return;
        }
        if (settled) return;

        const { index, result } = outcome;
        pending.delete(index);
        active.delete(index);
        if (result.done) {
          readers[index].releaseLock();
          if (active.size === 0) {
            settled = true;
            controller.close();
          }
          continue;
        }

        // Re-add at the back so already-ready siblings are emitted first.
        active.add(index);
        controller.enqueue(map(result.value, index));
        return;
      }
    },
    cancel(reason) {
      return settled ? undefined : cancelActive(reason);
    },
  });
}

/**
 * Merges multiple ReadableStreams into a single stream of chunks as they arrive.
 * @param streams - Array of ReadableStreams to merge.
 * @returns ReadableStream emitting chunks from all sources.
 */
export function merge<T>(streams: ReadableStream<T>[]): ReadableStream<T> {
  return mergeStreams(streams, (value) => value);
}

/**
 * Merges an object of ReadableStreams into a single stream of keyed chunks.
 * @param streamsObj - Object mapping keys to ReadableStreams.
 * @returns ReadableStream emitting records `{ [key]: V }` as chunks arrive.
 */
export function mergeKeyed<V extends Record<string, unknown>>(streamsObj: {
  [Key in keyof V]: ReadableStream<V[Key]>;
}): ReadableStream<Partial<V>> {
  const entries = Object.entries(streamsObj) as [
    string,
    ReadableStream<unknown>,
  ][];
  return mergeStreams(
    entries.map(([, stream]) => stream),
    (value, index) => ({ [entries[index][0]]: value }) as Partial<V>,
  );
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

  const first = streams[0];
  let readable = first.readable;

  for (let i = 1; i < streams.length; i++) {
    readable = readable.pipeThrough(streams[i]);
  }

  return {
    writable: first.writable as WritableStream<In>,
    readable: readable as ReadableStream<Out>,
  };
}
