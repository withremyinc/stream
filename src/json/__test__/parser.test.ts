import { test, describe, expect } from "vitest";

import { arrayStream, collect, takeLast } from "../..";
import { jsonToJSObject, parseJSON } from "../json";

async function collectEvents(chunks: string[]) {
  return await collect(arrayStream(chunks).pipeThrough(parseJSON()));
}

async function assertValidParse(input: string, expected: unknown) {
  await assertValidParseChunks([...input], expected);
}

async function assertValidParseChunks(chunks: string[], expected: unknown) {
  const events = await collectEvents(chunks);
  const errors = events.filter((e) => e.type === "onError");
  expect(errors).toHaveLength(0);
  const [value] = await collect(
    arrayStream(events)
      .pipeThrough(jsonToJSObject())
      .pipeThrough(takeLast(1)),
  );
  expect(value).toStrictEqual(expected);
}

async function assertInvalidParse(input: string, expectedPartial: unknown) {
  const events = await collectEvents([...input]);
  expect(events.some((e) => e.type === "onError")).toBe(true);
  const [partial] = await collect(
    arrayStream(events)
      .pipeThrough(jsonToJSObject())
      .pipeThrough(takeLast(1)),
  );
  expect(partial).toStrictEqual(expectedPartial);
}

describe("parse", () => {
  test("literals", async () => {
    await assertValidParse("true", true);
    await assertValidParse("false", false);
    await assertValidParse("null", null);
    await assertValidParse('"foo"', "foo");
    await assertValidParse(
      '"\\"-\\\\-\\/-\\b-\\f-\\n-\\r-\\t"',
      '"-\\-/-\b-\f-\n-\r-\t',
    );
    await assertValidParse('"\\u00DC"', "Ü");
    await assertValidParse("9", 9);
    await assertValidParse("-9", -9);
    await assertValidParse("0.129", 0.129);
    await assertValidParse("23e3", 23e3);
    await assertValidParse("1.2E+3", 1.2e3);
    await assertValidParse("1.2E-3", 1.2e-3);
    await assertValidParse("1.2E-3 // comment", 1.2e-3);
  });

  test("objects", async () => {
    await assertValidParse("{}", {});
    await assertValidParse('{ "foo": true }', { foo: true });
    await assertValidParse('{ "bar": 8, "xoo": "foo" }', {
      bar: 8,
      xoo: "foo",
    });
    await assertValidParse('{ "hello": [], "world": {} }', {
      hello: [],
      world: {},
    });
    await assertValidParse('{ "a": false, "b": true, "c": [ 7.4 ] }', {
      a: false,
      b: true,
      c: [7.4],
    });
    await assertValidParse(
      '{ "lineComment": "//", "blockComment": ["/*", "*/"], "brackets": [ ["{", "}"], ["[", "]"], ["(", ")"] ] }',
      {
        lineComment: "//",
        blockComment: ["/*", "*/"],
        brackets: [
          ["{", "}"],
          ["[", "]"],
          ["(", ")"],
        ],
      },
    );
    await assertValidParse('{ "hello": [], "world": {} }', {
      hello: [],
      world: {},
    });
    await assertValidParse(
      '{ "hello": { "again": { "inside": 5 }, "world": 1 }}',
      {
        hello: { again: { inside: 5 }, world: 1 },
      },
    );
    await assertValidParse('{ "foo": /*hello*/true }', { foo: true });
    await assertValidParse('{ "": true }', { "": true });
  });

  test("arrays", async () => {
    await assertValidParse("[]", []);
    await assertValidParse("[ [],  [ [] ]]", [[], [[]]]);
    await assertValidParse("[ 1, 2, 3 ]", [1, 2, 3]);
    await assertValidParse('[ { "a": null } ]', [{ a: null }]);
  });

  test("objects with errors", async () => {
    await assertInvalidParse("{,}", {});
    await assertInvalidParse('{ "bar": 8 "xoo": "foo" }', {
      bar: 8,
      xoo: "foo",
    });
    await assertInvalidParse('{ ,"bar": 8 }', { bar: 8 });
    await assertInvalidParse('{ ,"bar": 8, "foo" }', { bar: 8 });
    await assertInvalidParse('{ "bar": 8, "foo": }', { bar: 8 });
    await assertInvalidParse('{ 8, "foo": 9 }', { foo: 9 });
  });

  test("array with errors", async () => {
    await assertInvalidParse("[,]", []);
    await assertInvalidParse("[ 1 2, 3 ]", [1, 2, 3]);
    await assertInvalidParse("[ ,1, 2, 3 ]", [1, 2, 3]);
    await assertInvalidParse("[ ,1, 2, 3, ]", [1, 2, 3]);
  });

  test("errors", async () => {
    await assertInvalidParse("1,1", 1);
  });

  test("trailing comma", async () => {
    await assertValidParse('{ "hello": [], }', { hello: [] });
    await assertValidParse('{ "hello": [] }', { hello: [] });
    await assertValidParse('{ "hello": [], "world": {}, }', {
      hello: [],
      world: {},
    });
    await assertValidParse('{ "hello": [], "world": {} }', {
      hello: [],
      world: {},
    });
    await assertValidParse("[ 1, 2, ]", [1, 2]);
    await assertValidParse("[ 1, 2 ]", [1, 2]);
  });

  test("multi-character chunks spanning token boundaries", async () => {
    await assertValidParseChunks(
      [
        '{ "a": [1',
        ', 2, {"b": "x',
        '\\u00DC"}], ',
        '"c": t',
        'rue /* done */ }',
      ],
      {
        a: [1, 2, { b: "xÜ" }],
        c: true,
      },
    );
  });

  test("long chunked arrays survive buffer compaction", async () => {
    const expected = Array.from({ length: 15_000 }, (_, i) => i);
    const input = JSON.stringify(expected);
    const chunks: string[] = [];
    for (let i = 0; i < input.length; i += 5) {
      chunks.push(input.slice(i, i + 5));
    }
    await assertValidParseChunks(chunks, expected);
  });
});
