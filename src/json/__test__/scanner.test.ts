import { describe, test, expect } from "vitest";

import { collect, arrayStream } from "../../index";
import { ScanError, scanJSON, SyntaxKind, type ScanOutput } from "../scanner";

async function getTokens(text: string): Promise<ScanOutput[]> {
  return await collect(arrayStream([...text]).pipeThrough(scanJSON()));
}

describe("JSON", () => {
  test("tokens", async () => {
    expect(await getTokens("{")).toEqual([
      { token: SyntaxKind.OpenBraceToken },
    ]);

    expect(await getTokens("}")).toEqual([
      { token: SyntaxKind.CloseBraceToken },
    ]);

    expect(await getTokens("[")).toEqual([
      { token: SyntaxKind.OpenBracketToken },
    ]);

    expect(await getTokens("]")).toEqual([
      { token: SyntaxKind.CloseBracketToken },
    ]);

    expect(await getTokens(":")).toEqual([{ token: SyntaxKind.ColonToken }]);
    expect(await getTokens(",")).toEqual([{ token: SyntaxKind.CommaToken }]);
  });

  test("comments", async () => {
    expect(await getTokens("// this is a comment")).toEqual([]);
    expect(await getTokens("// this is a comment\n")).toEqual([]);
    expect(await getTokens("/* this is a comment*/")).toEqual([]);
    expect(await getTokens("/* this is a \r\ncomment*/")).toEqual([]);
    expect(await getTokens("/* this is a \ncomment*/")).toEqual([]);

    // unexpected end
    expect(await getTokens("/* this is a")).toStrictEqual([
      { error: ScanError.UnexpectedEndOfComment },
    ]);
    expect(await getTokens("/* this is a \ncomment")).toStrictEqual([
      { error: ScanError.UnexpectedEndOfComment },
    ]);

    // broken comment
    expect(await getTokens("/ ttt")).toEqual([
      { token: SyntaxKind.Unknown, value: "/" },
      { token: SyntaxKind.Unknown, value: "ttt" },
    ]);
  });

  test("strings", async () => {
    expect(await getTokens('"test"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "test" },
    ]);
    expect(await getTokens('"\\""')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: '"' },
    ]);
    expect(await getTokens('"\\/"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "/" },
    ]);
    expect(await getTokens('"\\b"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "\b" },
    ]);
    expect(await getTokens('"\\f"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "\f" },
    ]);
    expect(await getTokens('"\\n"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "\n" },
    ]);
    expect(await getTokens('"\\r"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "\r" },
    ]);
    expect(await getTokens('"\\t"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "\t" },
    ]);
    expect(await getTokens('"\u88ff"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "\u88ff" },
    ]);
    expect(await getTokens('"​\u2028"')).toStrictEqual([
      { token: SyntaxKind.StringLiteral, value: "​\u2028" },
    ]);

    expect(await getTokens('"\\v"')).toStrictEqual([
      { error: ScanError.InvalidEscapeCharacter },
      { token: SyntaxKind.StringLiteral, value: "" },
    ]);

    // unexpected end
    expect(await getTokens('"test')).toEqual([
      { error: ScanError.UnexpectedEndOfString },
      { token: SyntaxKind.StringLiteral, value: "test" },
    ]);
    expect(await getTokens('"test\n"')).toEqual([
      { error: ScanError.UnexpectedEndOfString },
      { token: SyntaxKind.StringLiteral, value: "test" },
      { error: ScanError.UnexpectedEndOfString },
      { token: SyntaxKind.StringLiteral, value: "" },
    ]);

    // invalid characters
    expect(await getTokens('"\t"')).toEqual([
      { error: ScanError.InvalidCharacter },
      { token: SyntaxKind.StringLiteral, value: "\t" },
    ]);
    expect(await getTokens('"\t "')).toEqual([
      { error: ScanError.InvalidCharacter },
      { token: SyntaxKind.StringLiteral, value: "\t " },
    ]);
    expect(await getTokens('"\x01 "')).toEqual([
      { error: ScanError.InvalidCharacter },
      { token: SyntaxKind.StringLiteral, value: "\x01 " },
    ]);
  });

  test("numbers", async () => {
    expect(await getTokens("0")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "0" },
    ]);
    expect(await getTokens("0.1")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "0.1" },
    ]);
    expect(await getTokens("-0.1")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "-0.1" },
    ]);
    expect(await getTokens("-1")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "-1" },
    ]);
    expect(await getTokens("1")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "1" },
    ]);
    expect(await getTokens("123456789")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "123456789" },
    ]);
    expect(await getTokens("10")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "10" },
    ]);
    expect(await getTokens("90")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "90" },
    ]);
    expect(await getTokens("90E+123")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "90E+123" },
    ]);
    expect(await getTokens("90e+123")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "90e+123" },
    ]);
    expect(await getTokens("90e-123")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "90e-123" },
    ]);
    expect(await getTokens("90E-123")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "90E-123" },
    ]);
    expect(await getTokens("90E123")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "90E123" },
    ]);
    expect(await getTokens("90e123")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "90e123" },
    ]);

    // zero handling
    expect(await getTokens("01")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "0" },
      { token: SyntaxKind.NumericLiteral, value: "1" },
    ]);
    expect(await getTokens("-01")).toEqual([
      { token: SyntaxKind.NumericLiteral, value: "-0" },
      { token: SyntaxKind.NumericLiteral, value: "1" },
    ]);

    // unexpected end / invalid format
    expect(await getTokens("-")).toEqual([
      { token: SyntaxKind.Unknown, value: "-" },
    ]);
    expect(await getTokens(".0")).toEqual([
      { token: SyntaxKind.Unknown, value: ".0" },
    ]);
  });

  test("keywords: true, false, null", async () => {
    expect(await getTokens("true")).toEqual([
      { token: SyntaxKind.TrueKeyword, value: "true" },
    ]);
    expect(await getTokens("false")).toEqual([
      { token: SyntaxKind.FalseKeyword, value: "false" },
    ]);
    expect(await getTokens("null")).toEqual([
      { token: SyntaxKind.NullKeyword, value: "null" },
    ]);

    expect(await getTokens("true false null")).toEqual([
      { token: SyntaxKind.TrueKeyword, value: "true" },
      { token: SyntaxKind.FalseKeyword, value: "false" },
      { token: SyntaxKind.NullKeyword, value: "null" },
    ]);

    // invalid words
    expect(await getTokens("nulllll")).toEqual([
      { token: SyntaxKind.Unknown, value: "nulllll" },
    ]);
    expect(await getTokens("True")).toEqual([
      { token: SyntaxKind.Unknown, value: "True" },
    ]); // Case-sensitive
    expect(await getTokens("foo-bar")).toEqual([
      { token: SyntaxKind.Unknown, value: "foo-bar" },
    ]);
    expect(await getTokens("foo bar")).toEqual([
      { token: SyntaxKind.Unknown, value: "foo" },
      { token: SyntaxKind.Unknown, value: "bar" },
    ]);

    // Comments are ignored (become Trivia or skipped entirely depending on scanner options, let's assume skipped here)
    expect(await getTokens("false//hello")).toEqual([
      { token: SyntaxKind.FalseKeyword, value: "false" },
    ]);
  });
});
