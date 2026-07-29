import {
  parseJSONFromScanner,
  type JSONPath,
  type ParseOutput,
  type Segment,
} from "./parser";
import { scanJSON } from "./scanner";

export type JSONParserOutput = ParseOutput;

export type JSONParserOptions = {
  /** Emit onPartialLiteralValue events for unterminated string literals at chunk boundaries. */
  emitPartialStrings?: boolean;
};

export function parseJSON(
  options: JSONParserOptions = {},
): TransformStream<string, JSONParserOutput> {
  const scanner = scanJSON(options);
  const parser = parseJSONFromScanner();

  let writer: WritableStreamDefaultWriter<string>;
  let reader: ReadableStreamDefaultReader<JSONParserOutput>;
  let pumpPromise: Promise<void>;

  return new TransformStream<string, JSONParserOutput>({
    start(controller) {
      const pipePromise = scanner.readable.pipeTo(parser.writable, {
        preventCancel: true,
      });

      writer = scanner.writable.getWriter();
      reader = parser.readable.getReader();
      pumpPromise = (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            controller.enqueue(value);
          }
          await pipePromise;
        } catch (error) {
          controller.error(error);
          await writer.abort(error).catch(() => {});
        } finally {
          reader.releaseLock();
        }
      })();
    },
    async transform(chunk) {
      await writer.write(chunk);
    },
    async flush() {
      await writer.close();
      writer.releaseLock();
      await pumpPromise;
    },
  });
}

function setOwnProperty(obj: any, key: Segment, value: any): void {
  if (key === "__proto__") {
    // Plain assignment to "__proto__" replaces the prototype instead of
    // creating an own property, letting documents inject inherited properties.
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    obj[key] = value;
  }
}

function setAtPath(acc: any, path: JSONPath, value: any): void {
  let obj = acc;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (!Object.prototype.hasOwnProperty.call(obj, segment)) {
      setOwnProperty(obj, segment, typeof path[i + 1] === "number" ? [] : {});
    }
    obj = obj[segment];
  }
  setOwnProperty(obj, path[path.length - 1], value);
}

/**
 * Folds `parseJSON()` events back into a plain JavaScript value, emitting the
 * value reconstructed so far after every event that changes it — including the
 * `onPartialLiteralValue` events from `parseJSON({ emitPartialStrings: true })`,
 * so a string still arriving shows up as it grows.
 *
 * Every emission is the same live accumulator, not a copy: it costs nothing to
 * emit, but the object you receive keeps changing as the rest of the input
 * arrives. Clone anything you retain (`structuredClone`, a spread) and treat
 * emitted values as read-only. To reconstruct a whole document, take the last
 * emission with `takeLast(1)`.
 *
 * @returns TransformStream from parser events to reconstructed values.
 */
export function jsonToJSObject(): TransformStream<JSONParserOutput, any> {
  let value: any = null;

  /** @returns true when the event changed the reconstructed value. */
  function begin(path: JSONPath, empty: any): boolean {
    if (path.length === 0) {
      // Top-level container.
      if (value !== null) return false;
      value = empty;
      return true;
    }

    setAtPath(value, path, empty);
    return true;
  }

  function apply(chunk: JSONParserOutput): boolean {
    switch (chunk.type) {
      case "onLiteralValue":
      case "onPartialLiteralValue": {
        const { path } = chunk;
        if (path.length === 0) {
          // Top-level literal value.
          value = chunk.value;
          return true;
        }

        setAtPath(value, path, chunk.value);
        return true;
      }

      case "onObjectBegin":
        return begin(chunk.path, {});

      case "onArrayBegin":
        return begin(chunk.path, []);

      // onObjectProperty is already covered by the following value event, and
      // onObjectEnd/onArrayEnd/onError leave the tree as-is.
      default:
        return false;
    }
  }

  return new TransformStream<JSONParserOutput, any>({
    transform(chunk, controller) {
      if (apply(chunk)) {
        controller.enqueue(value);
      }
    },
  });
}
