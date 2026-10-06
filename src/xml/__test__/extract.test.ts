import { describe, expect, test } from "vitest";

import { arrayStream, collect } from "../../index";
import { ParseErrorCode } from "../parser";
import {
  extractXML,
  parseXML,
  type XMLExtractOptions,
  type XMLExtractOutput,
} from "../xml";

async function collectExtracted(
  input: string,
  allowTags: readonly string[],
  options: Partial<XMLExtractOptions> = {},
): Promise<XMLExtractOutput[]> {
  return await collectExtractedFromChunks([...input], allowTags, options);
}

async function collectExtractedFromChunks(
  chunks: string[],
  allowTags: readonly string[],
  options: Partial<XMLExtractOptions> = {},
): Promise<XMLExtractOutput[]> {
  return await collect(
    arrayStream(chunks).pipeThrough(extractXML({ allowTags, ...options })),
  );
}

describe("extractXML", () => {
  test("extracts a single allowlisted tag from mixed prose", async () => {
    expect(await collectExtracted("this is a <test a=\"1\">hello</test>!", ["test"]))
      .toStrictEqual([
        {
          type: "onElementBegin",
          name: "test",
          attributes: [{ name: "a", value: "1" }],
        },
        { type: "onText", value: "hello" },
        { type: "onElementEnd", name: "test" },
      ]);
  });

  test("extracts multiple allowlisted tags and ignores wrappers", async () => {
    expect(
      await collectExtracted(
        "<wrapper>before<test>hello</test></wrapper>\n<instructions>use <tool>bash</tool></instructions>",
        ["test", "instructions"],
      ),
    ).toStrictEqual([
      {
        type: "onElementBegin",
        name: "test",
        attributes: [],
      },
      { type: "onText", value: "hello" },
      { type: "onElementEnd", name: "test" },
      {
        type: "onElementBegin",
        name: "instructions",
        attributes: [],
      },
      { type: "onText", value: "use <tool>bash</tool>" },
      { type: "onElementEnd", name: "instructions" },
    ]);
  });

  test("nested allowlisted tags are not extracted separately", async () => {
    expect(
      await collectExtracted(
        "<instructions><test>hello</test></instructions>",
        ["instructions", "test"],
      ),
    ).toStrictEqual([
      {
        type: "onElementBegin",
        name: "instructions",
        attributes: [],
      },
      { type: "onText", value: "<test>hello</test>" },
      { type: "onElementEnd", name: "instructions" },
    ]);
  });

  test("duplicate attributes emit onError and keep the last value", async () => {
    expect(await collectExtracted('<test x="1" x="2">ok</test>', ["test"]))
      .toStrictEqual([
        { type: "onError", error: ParseErrorCode.DuplicateAttribute },
        {
          type: "onElementBegin",
          name: "test",
          attributes: [{ name: "x", value: "2" }],
        },
        { type: "onText", value: "ok" },
        { type: "onElementEnd", name: "test" },
      ]);
  });

  test("self-closing tags emit begin/end only", async () => {
    expect(await collectExtracted('a <test foo="bar"/> b', ["test"]))
      .toStrictEqual([
        {
          type: "onElementBegin",
          name: "test",
          attributes: [{ name: "foo", value: "bar" }],
        },
        { type: "onElementEnd", name: "test" },
      ]);
  });

  test("unexpected eof auto-closes the extracted tag", async () => {
    expect(
      await collectExtracted(
        "prefix <instructions>use <tool>bash</tool>",
        ["instructions"],
      ),
    ).toStrictEqual([
      {
        type: "onElementBegin",
        name: "instructions",
        attributes: [],
      },
      { type: "onText", value: "use <tool>bash</tool>" },
      { type: "onError", error: ParseErrorCode.UnexpectedEndOfInput },
      { type: "onElementEnd", name: "instructions" },
    ]);
  });

  test("chunk boundaries are handled across extracted raw bodies", async () => {
    expect(
      await collectExtractedFromChunks(
        [
          "hello <inst",
          "ructions>use <tool>bash",
          "</tool></instr",
          "uctions> bye",
        ],
        ["instructions"],
      ),
    ).toStrictEqual([
      {
        type: "onElementBegin",
        name: "instructions",
        attributes: [],
      },
      { type: "onText", value: "use <tool>bash</tool>" },
      { type: "onElementEnd", name: "instructions" },
    ]);
  });

  test("textMode delta emits multiple text events for extracted content", async () => {
    expect(
      await collectExtractedFromChunks(
        [
          "prefix <instructions>he",
          "llo ",
          "<tool>bash</tool>",
          "</instructions> suffix",
        ],
        ["instructions"],
        { textMode: "delta" },
      ),
    ).toStrictEqual([
      {
        type: "onElementBegin",
        name: "instructions",
        attributes: [],
      },
      { type: "onText", value: "he" },
      { type: "onText", value: "llo " },
      { type: "onText", value: "<tool>bash</tool>" },
      { type: "onElementEnd", name: "instructions" },
    ]);
  });

  test("unrelated outside parse errors are ignored", async () => {
    expect(
      await collectExtracted(
        "</oops><?xml version=\"1.0\"?><test>ok</test>",
        ["test"],
      ),
    ).toStrictEqual([
      {
        type: "onElementBegin",
        name: "test",
        attributes: [],
      },
      { type: "onText", value: "ok" },
      { type: "onElementEnd", name: "test" },
    ]);
  });

  // Regression: https://github.com/withremyinc/stream/issues/10
  test.each([
    ["extractXML", () => extractXML({ allowTags: ["x"], textMode: "delta" })],
    ["parseXML", () => parseXML()],
  ])(
    "%s rejects its writer when a downstream stage fails",
    async (_name, makeStage) => {
      const stage = makeStage();
      const failing = new TransformStream({
        transform() {
          throw new Error("stage exploded");
        },
      });
      void stage.readable
        .pipeThrough(failing)
        .pipeTo(new WritableStream())
        .catch(() => {});

      const writer = stage.writable.getWriter();
      const writes = (async () => {
        for (const char of `<x>${"a".repeat(200)}</x>`) {
          await writer.write(char);
        }
        await writer.close();
      })();

      await expect(writes).rejects.toThrow("stage exploded");
    },
  );
});
