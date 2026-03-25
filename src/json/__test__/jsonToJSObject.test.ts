import { describe, expect, test } from "vitest";

import { arrayStream, collect, takeLast } from "../..";
import { jsonToJSObject, type JSONParserOutput } from "../json";
import { ParseErrorCode } from "../parser";

async function buildViaReducer(events: JSONParserOutput[]) {
  const [value] = await collect(
    arrayStream(events).pipeThrough(jsonToJSObject()).pipeThrough(takeLast(1)),
  );
  return value;
}

describe("jsonToJSObject", () => {
  test("empty event stream yields null accumulator", async () => {
    const value = await buildViaReducer([]);
    expect(value).toBeNull();
  });

  test("top-level literal", async () => {
    const value = await buildViaReducer([
      { type: "onLiteralValue", value: 42, path: [] },
    ]);
    expect(value).toBe(42);
  });

  test("top-level string", async () => {
    const value = await buildViaReducer([
      { type: "onLiteralValue", value: "hi", path: [] },
    ]);
    expect(value).toBe("hi");
  });

  test("top-level empty object from begin/end only", async () => {
    const value = await buildViaReducer([
      { type: "onObjectBegin", path: [] },
      { type: "onObjectEnd", path: [] },
    ]);
    expect(value).toStrictEqual({});
  });

  test("top-level empty array", async () => {
    const value = await buildViaReducer([
      { type: "onArrayBegin", path: [] },
      { type: "onArrayEnd", path: [] },
    ]);
    expect(value).toStrictEqual([]);
  });

  test("nested object with numeric string key in path", async () => {
    const events: JSONParserOutput[] = [
      { type: "onObjectBegin", path: [] },
      { type: "onObjectProperty", name: "0", path: [] },
      { type: "onLiteralValue", value: "x", path: ["0"] },
      { type: "onObjectEnd", path: [] },
    ];
    const value = await buildViaReducer(events);
    expect(value).toStrictEqual({ 0: "x" });
  });

  test("array with two elements", async () => {
    const events: JSONParserOutput[] = [
      { type: "onArrayBegin", path: [] },
      { type: "onLiteralValue", value: 1, path: [0] },
      { type: "onLiteralValue", value: 2, path: [1] },
      { type: "onArrayEnd", path: [] },
    ];
    const value = await buildViaReducer(events);
    expect(value).toStrictEqual([1, 2]);
  });

  test("onError chunks are ignored by reducer (partial tree)", async () => {
    const events: JSONParserOutput[] = [
      { type: "onObjectBegin", path: [] },
      { type: "onObjectProperty", name: "a", path: [] },
      { type: "onLiteralValue", value: 1, path: ["a"] },
      { type: "onError", error: ParseErrorCode.CommaExpected },
    ];
    const value = await buildViaReducer(events);
    expect(value).toStrictEqual({ a: 1 });
  });
});
