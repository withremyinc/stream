import { describe, expect, test } from "vitest";

import { arrayStream, collect, map, takeLast } from "../..";
import { jsonToJSObject, parseJSON, type JSONParserOutput } from "../json";
import { ParseErrorCode } from "../parser";

/** The completed value: the last snapshot. */
async function buildViaReducer(events: JSONParserOutput[]) {
  const [value] = await collect(
    arrayStream(events).pipeThrough(jsonToJSObject()).pipeThrough(takeLast(1)),
  );
  return value;
}

/**
 * Every emission is the same live accumulator, so the progression is only
 * observable by copying each one as it arrives.
 */
function snapshots(events: JSONParserOutput[]) {
  return collect(
    arrayStream(events)
      .pipeThrough(jsonToJSObject())
      .pipeThrough(map((value) => structuredClone(value))),
  );
}

describe("jsonToJSObject", () => {
  test("empty event stream emits nothing", async () => {
    expect(await collect(arrayStream([]).pipeThrough(jsonToJSObject()))).toStrictEqual(
      [],
    );
    expect(await buildViaReducer([])).toBeUndefined();
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

  test("a string left open at end of input keeps its last partial value", async () => {
    const value = await buildViaReducer([
      { type: "onObjectBegin", path: [] },
      { type: "onObjectProperty", name: "text", path: [] },
      { type: "onPartialLiteralValue", value: "Hel", path: ["text"] },
    ]);
    expect(value).toStrictEqual({ text: "Hel" });
  });

  test("__proto__ becomes an own property instead of replacing the prototype", async () => {
    const events: JSONParserOutput[] = [
      { type: "onObjectBegin", path: [] },
      { type: "onObjectProperty", name: "name", path: [] },
      { type: "onLiteralValue", value: "bob", path: ["name"] },
      { type: "onObjectProperty", name: "__proto__", path: [] },
      { type: "onObjectBegin", path: ["__proto__"] },
      { type: "onObjectProperty", name: "isAdmin", path: ["__proto__"] },
      { type: "onLiteralValue", value: true, path: ["__proto__", "isAdmin"] },
      { type: "onObjectEnd", path: ["__proto__"] },
      { type: "onObjectEnd", path: [] },
    ];
    const value = await buildViaReducer(events);
    expect(value.name).toBe("bob");
    expect(value.isAdmin).toBeUndefined();
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(value, "__proto__")?.value,
    ).toStrictEqual({ isAdmin: true });
  });
});

describe("jsonToJSObject snapshots", () => {
  test("emits a rolling tree including partial strings", async () => {
    const values = await collect(
      arrayStream(['{"text":"Hel', 'lo","done":true}'])
        .pipeThrough(parseJSON({ emitPartialStrings: true }))
        .pipeThrough(jsonToJSObject())
        .pipeThrough(map((value) => structuredClone(value))),
    );

    expect(values).toStrictEqual([
      {},
      { text: "Hel" },
      { text: "Hello" },
      { text: "Hello", done: true },
    ]);
  });

  test("reconstructs nested objects and arrays incrementally", async () => {
    const values = await snapshots([
      { type: "onObjectBegin", path: [] },
      { type: "onObjectProperty", name: "items", path: [] },
      { type: "onArrayBegin", path: ["items"] },
      { type: "onObjectBegin", path: ["items", 0] },
      { type: "onObjectProperty", name: "id", path: ["items", 0] },
      { type: "onLiteralValue", value: 1, path: ["items", 0, "id"] },
      { type: "onObjectEnd", path: ["items", 0] },
      { type: "onArrayEnd", path: ["items"] },
      { type: "onObjectEnd", path: [] },
    ]);

    expect(values).toStrictEqual([
      {},
      { items: [] },
      { items: [{}] },
      { items: [{ id: 1 }] },
    ]);
  });

  test("nested partial strings are replaced by the completed literal", async () => {
    const values = await collect(
      arrayStream(['{"a":{"b":["x', 'y"]}}'])
        .pipeThrough(parseJSON({ emitPartialStrings: true }))
        .pipeThrough(jsonToJSObject())
        .pipeThrough(map((value) => structuredClone(value))),
    );

    expect(values).toStrictEqual([
      {},
      { a: {} },
      { a: { b: [] } },
      { a: { b: ["x"] } },
      { a: { b: ["xy"] } },
    ]);
  });

  test("splitting a value across single-character chunks yields the same result", async () => {
    const source = '{"text":"Hello","n":12}';
    const values = await collect(
      arrayStream(source.split(""))
        .pipeThrough(parseJSON({ emitPartialStrings: true }))
        .pipeThrough(jsonToJSObject())
        .pipeThrough(map((value) => structuredClone(value))),
    );

    expect(values[values.length - 1]).toStrictEqual({ text: "Hello", n: 12 });
    // "H", "He", … each land as their own snapshot.
    expect(values).toContainEqual({ text: "H" });
    expect(values).toContainEqual({ text: "Hell" });
  });

  test("copying each emission shows the progression", async () => {
    const values = await snapshots([
      { type: "onObjectBegin", path: [] },
      { type: "onObjectProperty", name: "a", path: [] },
      { type: "onObjectBegin", path: ["a"] },
      { type: "onObjectProperty", name: "b", path: ["a"] },
      { type: "onLiteralValue", value: 1, path: ["a", "b"] },
      { type: "onObjectEnd", path: ["a"] },
      { type: "onObjectProperty", name: "c", path: [] },
      { type: "onLiteralValue", value: 2, path: ["c"] },
      { type: "onObjectEnd", path: [] },
    ]);

    expect(values).toStrictEqual([{}, { a: {} }, { a: { b: 1 } }, { a: { b: 1 }, c: 2 }]);
  });

  test("emissions are views over one live accumulator, not copies", async () => {
    // The documented contract: retaining an emission without copying it gives
    // you a value that keeps changing, and every emission is the same object.
    const retained = await collect(
      arrayStream<JSONParserOutput>([
        { type: "onObjectBegin", path: [] },
        { type: "onObjectProperty", name: "a", path: [] },
        { type: "onLiteralValue", value: 1, path: ["a"] },
        { type: "onObjectProperty", name: "b", path: [] },
        { type: "onLiteralValue", value: 2, path: ["b"] },
      ]).pipeThrough(jsonToJSObject()),
    );

    expect(retained).toHaveLength(3);
    expect(retained[0]).toBe(retained[2]);
    // Even the first emission now reads as the completed value.
    expect(retained[0]).toStrictEqual({ a: 1, b: 2 });
  });

  test("structural and error events do not produce duplicate snapshots", async () => {
    const values = await snapshots([
      { type: "onObjectBegin", path: [] },
      { type: "onObjectProperty", name: "a", path: [] },
      { type: "onLiteralValue", value: 1, path: ["a"] },
      { type: "onObjectEnd", path: [] },
      { type: "onError", error: ParseErrorCode.CommaExpected },
    ]);

    // onObjectProperty / onObjectEnd / onError change nothing.
    expect(values).toStrictEqual([{}, { a: 1 }]);
  });

  test("onError preserves the last reconstructed partial tree", async () => {
    const values = await collect(
      arrayStream(['{"text":"Hel'])
        .pipeThrough(parseJSON({ emitPartialStrings: true }))
        .pipeThrough(jsonToJSObject()),
    );

    expect(values[values.length - 1]).toStrictEqual({ text: "Hel" });
  });

  test("top-level scalars", async () => {
    expect(await snapshots([{ type: "onLiteralValue", value: 42, path: [] }])).toStrictEqual([42]);
    expect(await snapshots([{ type: "onArrayBegin", path: [] }])).toStrictEqual([[]]);
  });

  test("takeLast(1) recovers the completed value", async () => {
    const [value] = await collect(
      arrayStream(['{"a":[1,', '2],"b":"ok"}'])
        .pipeThrough(parseJSON({ emitPartialStrings: true }))
        .pipeThrough(jsonToJSObject())
        .pipeThrough(takeLast(1)),
    );

    expect(value).toStrictEqual({ a: [1, 2], b: "ok" });
  });

  test("__proto__ stays an own property in every snapshot", async () => {
    const values = await collect(
      arrayStream<JSONParserOutput>([
        { type: "onObjectBegin", path: [] },
        { type: "onObjectProperty", name: "__proto__", path: [] },
        { type: "onObjectBegin", path: ["__proto__"] },
        { type: "onObjectProperty", name: "isAdmin", path: ["__proto__"] },
        { type: "onLiteralValue", value: true, path: ["__proto__", "isAdmin"] },
        { type: "onObjectEnd", path: ["__proto__"] },
        { type: "onObjectProperty", name: "name", path: [] },
        { type: "onLiteralValue", value: "bob", path: ["name"] },
        { type: "onObjectEnd", path: [] },
      ]).pipeThrough(jsonToJSObject()),
    );

    const last = values[values.length - 1];
    expect(last.isAdmin).toBeUndefined();
    expect(Object.getPrototypeOf(last)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(last, "__proto__")?.value,
    ).toStrictEqual({ isAdmin: true });
    expect(({} as any).isAdmin).toBeUndefined();
  });
});
