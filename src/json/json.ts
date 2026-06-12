import { reduce } from "..";

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

export function jsonToJSObject(): TransformStream<JSONParserOutput, any> {
  return reduce((acc, chunk) => {
    if (chunk.type === "onLiteralValue") {
      const { value, path } = chunk;
      if (path.length === 0) {
        // Top-level literal value
        return value;
      }

      // Set the value at the specified path
      setAtPath(acc, path, value);
    }

    if (chunk.type === "onObjectBegin") {
      const { path } = chunk;
      if (path.length === 0) {
        // Top-level object
        return acc === null ? {} : acc;
      }

      // Create nested object at specified path
      setAtPath(acc, path, {});
    }

    if (chunk.type === "onObjectEnd") {
      // Nothing special needed for object end
    }

    if (chunk.type === "onObjectProperty") {
      // Property names are already handled in onLiteralValue
    }

    if (chunk.type === "onArrayBegin") {
      const { path } = chunk;
      if (path.length === 0) {
        // Top-level array
        return acc === null ? [] : acc;
      }

      // Create nested array at specified path
      setAtPath(acc, path, []);
    }

    if (chunk.type === "onArrayEnd") {
      // Nothing special needed for array end
    }

    return acc;
  }, null as any);
}
