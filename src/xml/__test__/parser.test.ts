import { describe, expect, test } from "vitest";

import { arrayStream, collect } from "../../index";
import { ParseErrorCode } from "../parser";
import { parseXML, type XMLParserOutput, type XMLParserOptions } from "../xml";
import { buildXMLTestTree, type XMLTestDocument } from "./treeBuilder";

async function collectEvents(
  input: string,
  options?: XMLParserOptions,
): Promise<XMLParserOutput[]> {
  return await collectEventsFromChunks([...input], options);
}

async function collectEventsFromChunks(
  chunks: string[],
  options?: XMLParserOptions,
): Promise<XMLParserOutput[]> {
  return await collect(arrayStream(chunks).pipeThrough(parseXML(options)));
}

function getErrors(events: XMLParserOutput[]) {
  return events
    .filter(
      (event): event is Extract<XMLParserOutput, { type: "onError" }> =>
        event.type === "onError",
    )
    .map((event) => event.error);
}

async function assertParse(
  input: string,
  expectedErrors: ParseErrorCode[],
  expected: XMLTestDocument,
  options?: XMLParserOptions,
) {
  const events = await collectEvents(input, options);
  expect(getErrors(events)).toStrictEqual(expectedErrors);
  expect(events[0]?.type).toBe("onDocumentBegin");
  expect(events.at(-1)?.type).toBe("onDocumentEnd");
  expect(buildXMLTestTree(events)).toStrictEqual(expected);
}

async function assertParseChunks(
  chunks: string[],
  expectedErrors: ParseErrorCode[],
  expected: XMLTestDocument,
  options?: XMLParserOptions,
) {
  const events = await collectEventsFromChunks(chunks, options);
  expect(getErrors(events)).toStrictEqual(expectedErrors);
  expect(events[0]?.type).toBe("onDocumentBegin");
  expect(events.at(-1)?.type).toBe("onDocumentEnd");
  expect(buildXMLTestTree(events)).toStrictEqual(expected);
}

describe("XML parser", () => {
  test("xml declaration and empty root element", async () => {
    await assertParse('<?xml version="1.0"?><root/>', [], {
      declaration: [{ name: "version", value: "1.0" }],
      children: [
        {
          type: "element",
          name: "root",
          attributes: [],
          children: [],
        },
      ],
      errors: [],
    });
  });

  test("leading top-level whitespace does not block the xml declaration", async () => {
    await assertParse('\n  <?xml version="1.0"?><root/>', [], {
      declaration: [{ name: "version", value: "1.0" }],
      children: [
        {
          type: "element",
          name: "root",
          attributes: [],
          children: [],
        },
      ],
      errors: [],
    });
  });

  test("nested elements, attributes, and mixed content", async () => {
    await assertParse('<p class="lead">Hello <b>world</b>!</p>', [], {
      declaration: null,
      children: [
        {
          type: "element",
          name: "p",
          attributes: [{ name: "class", value: "lead" }],
          children: [
            { type: "text", value: "Hello " },
            {
              type: "element",
              name: "b",
              attributes: [],
              children: [{ type: "text", value: "world" }],
            },
            { type: "text", value: "!" },
          ],
        },
      ],
      errors: [],
    });
  });

  test("comments, CDATA, and processing instructions preserve order", async () => {
    await assertParse(
      '<!--before--><root a="1"><![CDATA[<x>]]><?step now?></root><!--after-->',
      [],
      {
        declaration: null,
        children: [
          { type: "comment", value: "before" },
          {
            type: "element",
            name: "root",
            attributes: [{ name: "a", value: "1" }],
            children: [
              { type: "cdata", value: "<x>" },
              { type: "processingInstruction", target: "step", data: "now" },
            ],
          },
          { type: "comment", value: "after" },
        ],
        errors: [],
      },
    );
  });

  test("foreign tags emit a single raw text payload", async () => {
    await assertParse(
      '<root><instructions>use <tool>bash</tool> & keep x < 3</instructions><tail>ok</tail></root>',
      [],
      {
        declaration: null,
        children: [
          {
            type: "element",
            name: "root",
            attributes: [],
            children: [
              {
                type: "element",
                name: "instructions",
                attributes: [],
                children: [
                  {
                    type: "text",
                    value: "use <tool>bash</tool> & keep x < 3",
                  },
                ],
              },
              {
                type: "element",
                name: "tail",
                attributes: [],
                children: [{ type: "text", value: "ok" }],
              },
            ],
          },
        ],
        errors: [],
      },
      { foreignTags: ["instructions"] },
    );
  });

  test("foreign tags still auto-close at eof", async () => {
    await assertParse(
      "<instructions>use <tool>bash</tool>",
      [ParseErrorCode.UnexpectedEndOfInput],
      {
        declaration: null,
        children: [
          {
            type: "element",
            name: "instructions",
            attributes: [],
            children: [{ type: "text", value: "use <tool>bash</tool>" }],
          },
        ],
        errors: [ParseErrorCode.UnexpectedEndOfInput],
      },
      { foreignTags: ["instructions"] },
    );
  });

  test("textMode delta splits normal text across stream boundaries", async () => {
    await assertParseChunks(
      ["<root>he", "llo<b/>wo", "rld</root>"],
      [],
      {
        declaration: null,
        children: [
          {
            type: "element",
            name: "root",
            attributes: [],
            children: [
              { type: "text", value: "he" },
              { type: "text", value: "llo" },
              {
                type: "element",
                name: "b",
                attributes: [],
                children: [],
              },
              { type: "text", value: "wo" },
              { type: "text", value: "rld" },
            ],
          },
        ],
        errors: [],
      },
      { textMode: "delta" },
    );
  });

  test("textMode delta also applies to foreign tags", async () => {
    await assertParseChunks(
      [
        "<instructions>he",
        "llo ",
        "<tool>bash</tool>",
        "</instructions>",
      ],
      [],
      {
        declaration: null,
        children: [
          {
            type: "element",
            name: "instructions",
            attributes: [],
            children: [
              { type: "text", value: "he" },
              { type: "text", value: "llo " },
              { type: "text", value: "<tool>bash</tool>" },
            ],
          },
        ],
        errors: [],
      },
      {
        foreignTags: ["instructions"],
        textMode: "delta",
      },
    );
  });

  test("supports multi-character chunks spanning parser boundaries", async () => {
    await assertParseChunks(
      [
        "<?xml ver",
        'sion="1.0"?>',
        "<ro",
        "ot a='1'>Hel",
        "lo <b>wor",
        "ld</b><?pi",
        " data?></ro",
        "ot>",
      ],
      [],
      {
        declaration: [{ name: "version", value: "1.0" }],
        children: [
          {
            type: "element",
            name: "root",
            attributes: [{ name: "a", value: "1" }],
            children: [
              { type: "text", value: "Hello " },
              {
                type: "element",
                name: "b",
                attributes: [],
                children: [{ type: "text", value: "world" }],
              },
              { type: "processingInstruction", target: "pi", data: "data" },
            ],
          },
        ],
        errors: [],
      },
    );
  });

  test("scanner-level errors can still yield a complete parsed document", async () => {
    await assertParse(
      "<root>&bogus;</root>",
      [ParseErrorCode.InvalidEntityReference],
      {
        declaration: null,
        children: [
          {
            type: "element",
            name: "root",
            attributes: [],
            children: [{ type: "text", value: "&bogus;" }],
          },
        ],
        errors: [ParseErrorCode.InvalidEntityReference],
      },
    );
  });

  test("mismatched end tags recover by auto-closing intervening elements", async () => {
    await assertParse(
      "<a><b></a></b>",
      [ParseErrorCode.MismatchedTag, ParseErrorCode.UnexpectedCloseTag],
      {
        declaration: null,
        children: [
          {
            type: "element",
            name: "a",
            attributes: [],
            children: [
              {
                type: "element",
                name: "b",
                attributes: [],
                children: [],
              },
            ],
          },
        ],
        errors: [
          ParseErrorCode.MismatchedTag,
          ParseErrorCode.UnexpectedCloseTag,
        ],
      },
    );
  });

  test("duplicate attributes emit an error and keep the last value", async () => {
    await assertParse(
      '<a x="1" x="2"/>',
      [ParseErrorCode.DuplicateAttribute],
      {
        declaration: null,
        children: [
          {
            type: "element",
            name: "a",
            attributes: [{ name: "x", value: "2" }],
            children: [],
          },
        ],
        errors: [ParseErrorCode.DuplicateAttribute],
      },
    );
  });

  test("multiple top-level nodes and text fragments are allowed", async () => {
    await assertParse("hello<a/>mid<b/>tail", [], {
      declaration: null,
      children: [
        { type: "text", value: "hello" },
        {
          type: "element",
          name: "a",
          attributes: [],
          children: [],
        },
        { type: "text", value: "mid" },
        {
          type: "element",
          name: "b",
          attributes: [],
          children: [],
        },
        { type: "text", value: "tail" },
      ],
      errors: [],
    });
  });

  test("stray closing tags are skipped", async () => {
    await assertParse("</oops><a/>", [ParseErrorCode.UnexpectedCloseTag], {
      declaration: null,
      children: [
        {
          type: "element",
          name: "a",
          attributes: [],
          children: [],
        },
      ],
      errors: [ParseErrorCode.UnexpectedCloseTag],
    });
  });

  test("unexpected eof auto-closes the remaining open elements", async () => {
    await assertParse("<a><b>hi", [ParseErrorCode.UnexpectedEndOfInput], {
      declaration: null,
      children: [
        {
          type: "element",
          name: "a",
          attributes: [],
          children: [
            {
              type: "element",
              name: "b",
              attributes: [],
              children: [{ type: "text", value: "hi" }],
            },
          ],
        },
      ],
      errors: [ParseErrorCode.UnexpectedEndOfInput],
    });
  });

  test("xml declaration is still only valid at the start", async () => {
    await assertParse(
      '<!--leading--><?xml version="1.0"?><root/>',
      [ParseErrorCode.InvalidXmlDeclaration],
      {
        declaration: null,
        children: [
          { type: "comment", value: "leading" },
          {
            type: "element",
            name: "root",
            attributes: [],
            children: [],
          },
        ],
        errors: [ParseErrorCode.InvalidXmlDeclaration],
      },
    );
  });
});
