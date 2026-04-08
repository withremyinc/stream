import { describe, expect, test } from "vitest";

import { arrayStream, collect } from "../../index";
import {
  ScanError,
  scanXML,
  SyntaxKind,
  type ScanOutput,
  type ScanXMLOptions,
} from "../scanner";

async function getTokens(
  text: string,
  options?: ScanXMLOptions,
): Promise<ScanOutput[]> {
  return await getTokensFromChunks([...text], options);
}

async function getTokensFromChunks(
  chunks: string[],
  options?: ScanXMLOptions,
): Promise<ScanOutput[]> {
  return await collect(arrayStream(chunks).pipeThrough(scanXML(options)));
}

describe("XML scanner", () => {
  test("start tags, end tags, attributes, and self-closing tags", async () => {
    expect(await getTokens("<note a=\"1\" b='two'></note><br/>"))
      .toStrictEqual([
        { token: SyntaxKind.StartTagOpenToken },
        { token: SyntaxKind.Name, value: "note" },
        { token: SyntaxKind.Name, value: "a" },
        { token: SyntaxKind.EqualsToken },
        { token: SyntaxKind.StringLiteral, value: "1" },
        { token: SyntaxKind.Name, value: "b" },
        { token: SyntaxKind.EqualsToken },
        { token: SyntaxKind.StringLiteral, value: "two" },
        { token: SyntaxKind.TagCloseToken },
        { token: SyntaxKind.EndTagOpenToken },
        { token: SyntaxKind.Name, value: "note" },
        { token: SyntaxKind.TagCloseToken },
        { token: SyntaxKind.StartTagOpenToken },
        { token: SyntaxKind.Name, value: "br" },
        { token: SyntaxKind.EmptyElementCloseToken },
      ]);
  });

  test("text nodes decode predefined and numeric entities", async () => {
    expect(await getTokens("a&amp;b&lt;c&#x21;&#33;"))
      .toStrictEqual([{ token: SyntaxKind.Text, value: "a&b<c!!" }]);
  });

  test("attribute values decode entities", async () => {
    expect(await getTokens('<a title="Fish &amp; Chips"/>')).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "a" },
      { token: SyntaxKind.Name, value: "title" },
      { token: SyntaxKind.EqualsToken },
      { token: SyntaxKind.StringLiteral, value: "Fish & Chips" },
      { token: SyntaxKind.EmptyElementCloseToken },
    ]);
  });

  test("comments, CDATA, processing instructions, and xml declarations", async () => {
    expect(
      await getTokens(
        '<?xml version="1.0" encoding="utf-8"?><?go now?><!-- hi --><![CDATA[a<b>&c]]>',
      ),
    ).toStrictEqual([
      { token: SyntaxKind.XmlDeclarationOpenToken },
      { token: SyntaxKind.Name, value: "version" },
      { token: SyntaxKind.EqualsToken },
      { token: SyntaxKind.StringLiteral, value: "1.0" },
      { token: SyntaxKind.Name, value: "encoding" },
      { token: SyntaxKind.EqualsToken },
      { token: SyntaxKind.StringLiteral, value: "utf-8" },
      { token: SyntaxKind.TagCloseToken },
      { token: SyntaxKind.ProcessingInstruction, target: "go", data: "now" },
      { token: SyntaxKind.Comment, value: " hi " },
      { token: SyntaxKind.CData, value: "a<b>&c" },
    ]);
  });

  test("invalid entities surface an error and keep raw text", async () => {
    expect(await getTokens("<a>x &bogus; y</a>")).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "a" },
      { token: SyntaxKind.TagCloseToken },
      { error: ScanError.InvalidEntityReference },
      { token: SyntaxKind.Text, value: "x &bogus; y" },
      { token: SyntaxKind.EndTagOpenToken },
      { token: SyntaxKind.Name, value: "a" },
      { token: SyntaxKind.TagCloseToken },
    ]);
  });

  test("unterminated constructs emit scanner errors", async () => {
    expect(await getTokens("<!-- hello")).toStrictEqual([
      { error: ScanError.UnterminatedComment },
      { token: SyntaxKind.Comment, value: " hello" },
    ]);

    expect(await getTokens("<![CDATA[hello")).toStrictEqual([
      { error: ScanError.UnterminatedCData },
      { token: SyntaxKind.CData, value: "hello" },
    ]);

    expect(await getTokens('<a x="hello')).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "a" },
      { token: SyntaxKind.Name, value: "x" },
      { token: SyntaxKind.EqualsToken },
      { error: ScanError.UnterminatedString },
      { token: SyntaxKind.StringLiteral, value: "hello" },
      { error: ScanError.UnexpectedEndOfInput },
    ]);
  });

  test("supports multi-character chunks spanning markup boundaries", async () => {
    expect(
      await getTokensFromChunks([
        "<?xml ver",
        'sion="1.0"?>',
        "<ro",
        "ot a='x",
        "&amp;y'>he",
        "llo<![C",
        "DATA[<x>]]>",
        "<?pi d",
        "ata?></ro",
        "ot>",
      ]),
    ).toStrictEqual([
      { token: SyntaxKind.XmlDeclarationOpenToken },
      { token: SyntaxKind.Name, value: "version" },
      { token: SyntaxKind.EqualsToken },
      { token: SyntaxKind.StringLiteral, value: "1.0" },
      { token: SyntaxKind.TagCloseToken },
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "root" },
      { token: SyntaxKind.Name, value: "a" },
      { token: SyntaxKind.EqualsToken },
      { token: SyntaxKind.StringLiteral, value: "x&y" },
      { token: SyntaxKind.TagCloseToken },
      { token: SyntaxKind.Text, value: "hello" },
      { token: SyntaxKind.CData, value: "<x>" },
      { token: SyntaxKind.ProcessingInstruction, target: "pi", data: "data" },
      { token: SyntaxKind.EndTagOpenToken },
      { token: SyntaxKind.Name, value: "root" },
      { token: SyntaxKind.TagCloseToken },
    ]);
  });

  test("textMode delta emits text in multiple pieces across stream boundaries", async () => {
    expect(
      await getTokensFromChunks(
        ["<root>he", "llo &amp; go", "</root>"],
        { textMode: "delta" },
      ),
    ).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "root" },
      { token: SyntaxKind.TagCloseToken },
      { token: SyntaxKind.Text, value: "he" },
      { token: SyntaxKind.Text, value: "llo & go" },
      { token: SyntaxKind.EndTagOpenToken },
      { token: SyntaxKind.Name, value: "root" },
      { token: SyntaxKind.TagCloseToken },
    ]);
  });

  test("textMode delta also applies to foreign tag bodies", async () => {
    expect(
      await getTokensFromChunks(
        [
          "<instructions>hello ",
          "<tool>bash</tool> ",
          "world</instructions>",
        ],
        {
          foreignTags: ["instructions"],
          textMode: "delta",
        },
      ),
    ).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "instructions" },
      { token: SyntaxKind.TagCloseToken },
      { token: SyntaxKind.Text, value: "hello " },
      { token: SyntaxKind.Text, value: "<tool>bash</tool> " },
      { token: SyntaxKind.Text, value: "world" },
      { token: SyntaxKind.EndTagOpenToken },
      { token: SyntaxKind.Name, value: "instructions" },
      { token: SyntaxKind.TagCloseToken },
    ]);
  });

  test("foreign tags treat their bodies as raw text", async () => {
    expect(
      await getTokens(
        "<instructions>use <tool>bash</tool> & keep x < 3</instructions>",
        { foreignTags: ["instructions"] },
      ),
    ).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "instructions" },
      { token: SyntaxKind.TagCloseToken },
      {
        token: SyntaxKind.Text,
        value: "use <tool>bash</tool> & keep x < 3",
      },
      { token: SyntaxKind.EndTagOpenToken },
      { token: SyntaxKind.Name, value: "instructions" },
      { token: SyntaxKind.TagCloseToken },
    ]);
  });

  test("foreign tag closing tags can span chunks and include trailing whitespace", async () => {
    expect(
      await getTokensFromChunks(
        [
          "<instructions>use <to",
          "ol>bash</tool></instr",
          "uctions   >after",
        ],
        { foreignTags: ["instructions"] },
      ),
    ).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "instructions" },
      { token: SyntaxKind.TagCloseToken },
      { token: SyntaxKind.Text, value: "use <tool>bash</tool>" },
      { token: SyntaxKind.EndTagOpenToken },
      { token: SyntaxKind.Name, value: "instructions" },
      { token: SyntaxKind.TagCloseToken },
      { token: SyntaxKind.Text, value: "after" },
    ]);
  });

  test("self-closing foreign tags do not enter raw mode", async () => {
    expect(
      await getTokens("<instructions/>after", {
        foreignTags: ["instructions"],
      }),
    ).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "instructions" },
      { token: SyntaxKind.EmptyElementCloseToken },
      { token: SyntaxKind.Text, value: "after" },
    ]);
  });

  test("long chunked text survives buffer compaction", async () => {
    const text = "x".repeat(20_000);
    const input = `<root>${text}</root>`;
    const chunks: string[] = [];

    for (let i = 0; i < input.length; i += 7) {
      chunks.push(input.slice(i, i + 7));
    }

    expect(await getTokensFromChunks(chunks)).toStrictEqual([
      { token: SyntaxKind.StartTagOpenToken },
      { token: SyntaxKind.Name, value: "root" },
      { token: SyntaxKind.TagCloseToken },
      { token: SyntaxKind.Text, value: text },
      { token: SyntaxKind.EndTagOpenToken },
      { token: SyntaxKind.Name, value: "root" },
      { token: SyntaxKind.TagCloseToken },
    ]);
  });
});
