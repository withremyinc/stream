import { pipeThrough, reduce } from "..";

import { parseJSONFromScanner, type ParseOutput } from "./parser";
import { scanJSON } from "./scanner";

export type JSONParserOutput = ParseOutput;

export function parseJSON(): TransformStream<string, JSONParserOutput> {
  return pipeThrough(scanJSON(), parseJSONFromScanner());
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
      let obj = acc;
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (obj[segment] === undefined) {
          obj[segment] = typeof path[i + 1] === "number" ? [] : {};
        }
        obj = obj[segment];
      }
      obj[path[path.length - 1]] = value;
    }

    if (chunk.type === "onObjectBegin") {
      const { path } = chunk;
      if (path.length === 0) {
        // Top-level object
        return acc === null ? {} : acc;
      }

      // Create nested object at specified path
      let obj = acc;
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (obj[segment] === undefined) {
          obj[segment] = typeof path[i + 1] === "number" ? [] : {};
        }
        obj = obj[segment];
      }
      obj[path[path.length - 1]] = {};
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
      let obj = acc;
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (obj[segment] === undefined) {
          obj[segment] = typeof path[i + 1] === "number" ? [] : {};
        }
        obj = obj[segment];
      }
      obj[path[path.length - 1]] = [];
    }

    if (chunk.type === "onArrayEnd") {
      // Nothing special needed for array end
    }

    return acc;
  }, null as any);
}
