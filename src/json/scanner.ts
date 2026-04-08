/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  fromStringGenerator,
  GENERATOR_END,
  type GeneratorWithNext,
  type StringGeneratorFactoryOptions,
} from "../util/generators";

export const enum ScanError {
  None = "None",
  UnexpectedEndOfComment = "UnexpectedEndOfComment",
  UnexpectedEndOfString = "UnexpectedEndOfString",
  UnexpectedEndOfNumber = "UnexpectedEndOfNumber",
  InvalidUnicode = "InvalidUnicode",
  InvalidEscapeCharacter = "InvalidEscapeCharacter",
  InvalidCharacter = "InvalidCharacter",
}

export const enum SyntaxKind {
  OpenBraceToken = "OpenBraceToken",
  CloseBraceToken = "CloseBraceToken",
  OpenBracketToken = "OpenBracketToken",
  CloseBracketToken = "CloseBracketToken",
  CommaToken = "CommaToken",
  ColonToken = "ColonToken",
  NullKeyword = "NullKeyword",
  TrueKeyword = "TrueKeyword",
  FalseKeyword = "FalseKeyword",
  StringLiteral = "StringLiteral",
  NumericLiteral = "NumericLiteral",
  Unknown = "Unknown",
  EOF = "EOF",
}

const EOF = 0;

export type ScanOutput =
  | {
      token: SyntaxKind;
      value?: string;
    }
  | {
      error: ScanError;
    };

/**
 * Creates a JSON scanner on the given text.
 * Whitespaces and comments are ignored.
 */
export function scanJSON() {
  function* scanString(
    peekCharCode: () => number,
    options: StringGeneratorFactoryOptions,
  ): GeneratorWithNext<ScanOutput> {
    const { next, substring, pos, retainFrom } = options;

    yield next();
    let value = "";
    let start = pos();
    retainFrom(start);

    // SCAN STRING
    {
      while (true) {
        const ch = peekCharCode();
        if (ch === EOF) {
          value += substring(start, pos());
          yield { error: ScanError.UnexpectedEndOfString };
          break;
        }
        if (ch === CharacterCodes.doubleQuote) {
          value += substring(start, pos());
          yield next();
          break;
        }
        if (ch === CharacterCodes.backslash) {
          value += substring(start, pos());
          yield next();

          const ch2 = peekCharCode();
          yield next();

          switch (ch2) {
            case CharacterCodes.doubleQuote:
              value += '"';
              break;
            case CharacterCodes.backslash:
              value += "\\";
              break;
            case CharacterCodes.slash:
              value += "/";
              break;
            case CharacterCodes.b:
              value += "\b";
              break;
            case CharacterCodes.f:
              value += "\f";
              break;
            case CharacterCodes.n:
              value += "\n";
              break;
            case CharacterCodes.r:
              value += "\r";
              break;
            case CharacterCodes.t:
              value += "\t";
              break;
            case CharacterCodes.u:
              let ch3 = 0;
              // SCAN HEX CODE
              {
                let count = 4;
                let exact = true;
                let digits = 0;
                while (digits < count || !exact) {
                  const ch = peekCharCode();
                  if (ch >= CharacterCodes._0 && ch <= CharacterCodes._9) {
                    ch3 = ch3 * 16 + ch - CharacterCodes._0;
                  } else if (ch >= CharacterCodes.A && ch <= CharacterCodes.F) {
                    ch3 = ch3 * 16 + ch - CharacterCodes.A + 10;
                  } else if (ch >= CharacterCodes.a && ch <= CharacterCodes.f) {
                    ch3 = ch3 * 16 + ch - CharacterCodes.a + 10;
                  } else {
                    break;
                  }
                  yield next();
                  digits++;
                }
                if (digits < count) {
                  ch3 = -1;
                }
              }

              if (ch3 >= 0) {
                value += String.fromCharCode(ch3);
              } else {
                yield { error: ScanError.InvalidUnicode };
              }
              break;
            default:
              yield {
                error: ScanError.InvalidEscapeCharacter,
              };
          }
          start = pos();
          retainFrom(start);
          continue;
        }
        if (ch > 0 && ch <= 0x1f) {
          if (isLineBreak(ch)) {
            value += substring(start, pos());
            yield {
              error: ScanError.UnexpectedEndOfString,
            };
            break;
          } else {
            yield { error: ScanError.InvalidCharacter };
            // mark as error but continue with string
          }
        }
        yield next();
      }
    }
    retainFrom(pos());
    yield { token: SyntaxKind.StringLiteral, value };
  }

  function* scanNumber(
    peekCharCode: () => number,
    options: StringGeneratorFactoryOptions,
  ): GeneratorWithNext<ScanOutput> {
    const { next, substring, pos, retainFrom } = options;
    const code = peekCharCode();
    let value = "";

    // SCAN MINUS
    if (code === CharacterCodes.minus) {
      value += "-";
      yield next();
      if (!isDigit(peekCharCode())) {
        yield {
          token: SyntaxKind.Unknown,
          value: String.fromCharCode(code),
        };
        return;
      }
    }

    // SCAN NUMBER
    {
      const start = pos();
      retainFrom(start);
      if (peekCharCode() === CharacterCodes._0) {
        yield next();
      } else {
        yield next();
        while (isDigit(peekCharCode())) {
          yield next();
        }
      }
      if (peekCharCode() === CharacterCodes.dot) {
        yield next();
        if (isDigit(peekCharCode())) {
          yield next();
          while (isDigit(peekCharCode())) {
            yield next();
          }
        } else {
          yield { error: ScanError.UnexpectedEndOfNumber };
        }
      }
      let end = pos();
      if (
        peekCharCode() === CharacterCodes.E ||
        peekCharCode() === CharacterCodes.e
      ) {
        yield next();
        if (
          peekCharCode() === CharacterCodes.plus ||
          peekCharCode() === CharacterCodes.minus
        ) {
          yield next();
        }
        if (isDigit(peekCharCode())) {
          yield next();
          while (isDigit(peekCharCode())) {
            yield next();
          }
          end = pos();
        } else {
          yield { error: ScanError.UnexpectedEndOfNumber };
        }
      }
      value += substring(start, end);
      retainFrom(pos());
    }

    yield {
      token: SyntaxKind.NumericLiteral,
      value,
    };
  }

  return fromStringGenerator(function* (options) {
    const { peek, next, substring, pos, retainFrom } = options;
    function peekCharCode(): number {
      const code = peek();
      if (code === GENERATOR_END) {
        return EOF;
      }
      return code.charCodeAt(0);
    }

    outerLoop: while (true) {
      // Handle whitespace as trivia.
      let code = peekCharCode();

      // trivia: whitespace
      if (isWhiteSpace(code)) {
        do {
          yield next();
          code = peekCharCode();
        } while (isWhiteSpace(code));
        continue outerLoop;
      }

      const tokenOffset = pos();

      // Handle new lines as trivia.
      if (isLineBreak(code)) {
        yield next();
        if (
          code === CharacterCodes.carriageReturn &&
          peekCharCode() === CharacterCodes.lineFeed
        ) {
          yield next();
        }
        continue outerLoop;
      }

      switch (code) {
        // tokens: []{}:,
        case CharacterCodes.openBrace: {
          yield next();
          yield { token: SyntaxKind.OpenBraceToken };
          continue outerLoop;
        }
        case CharacterCodes.closeBrace: {
          yield next();
          yield { token: SyntaxKind.CloseBraceToken };
          continue outerLoop;
        }
        case CharacterCodes.openBracket: {
          yield next();
          yield { token: SyntaxKind.OpenBracketToken };
          continue outerLoop;
        }
        case CharacterCodes.closeBracket: {
          yield next();
          yield { token: SyntaxKind.CloseBracketToken };
          continue outerLoop;
        }
        case CharacterCodes.colon: {
          yield next();
          yield { token: SyntaxKind.ColonToken };
          continue outerLoop;
        }
        case CharacterCodes.comma: {
          yield next();
          yield { token: SyntaxKind.CommaToken };
          continue outerLoop;
        }

        // strings
        case CharacterCodes.doubleQuote: {
          yield* scanString(peekCharCode, options);
          continue outerLoop;
        }

        // comments
        case CharacterCodes.slash: {
          // Slashes should always be followed by either a / or *.
          yield next();

          // Single-line comment
          if (peekCharCode() === CharacterCodes.slash) {
            do {
              yield next();
              const ch = peekCharCode();
              if (ch === EOF || isLineBreak(ch)) {
                break;
              }
            } while (true);
          }
          // Multi-line comment
          else if (peekCharCode() === CharacterCodes.asterisk) {
            const lastCodes: number[] = [peekCharCode()];
            do {
              yield next();
              lastCodes.push(peekCharCode());
              if (peekCharCode() === CharacterCodes.EOF) {
                yield { error: ScanError.UnexpectedEndOfComment };
                break;
              }
              if (
                lastCodes.length >= 2 &&
                lastCodes[lastCodes.length - 2] === CharacterCodes.asterisk &&
                lastCodes[lastCodes.length - 1] === CharacterCodes.slash
              ) {
                yield next();
                break;
              }
            } while (true);
          } else {
            // just a single slash
            yield { token: SyntaxKind.Unknown, value: "/" };
          }

          continue outerLoop;
        }

        // numbers
        case CharacterCodes.minus:
        case CharacterCodes._0:
        case CharacterCodes._1:
        case CharacterCodes._2:
        case CharacterCodes._3:
        case CharacterCodes._4:
        case CharacterCodes._5:
        case CharacterCodes._6:
        case CharacterCodes._7:
        case CharacterCodes._8:
        case CharacterCodes._9: {
          yield* scanNumber(peekCharCode, options);
          continue outerLoop;
        }
        case CharacterCodes.EOF: {
          break outerLoop;
        }
        // literals and unknown symbols
        default: {
          // is a literal? Read the full word.
          retainFrom(tokenOffset);
          while (isUnknownContentCharacter(code)) {
            yield next();
            code = peekCharCode();
          }

          if (tokenOffset !== pos()) {
            const value = substring(tokenOffset, pos()).trim();
            retainFrom(pos());
            // keywords: true, false, null
            switch (value) {
              case "true":
                yield { token: SyntaxKind.TrueKeyword, value };
                continue outerLoop;
              case "false":
                yield { token: SyntaxKind.FalseKeyword, value };
                continue outerLoop;
              case "null":
                yield { token: SyntaxKind.NullKeyword, value };
                continue outerLoop;
            }

            yield { token: SyntaxKind.Unknown, value };
            continue outerLoop;
          }

          retainFrom(pos());
          // some
          yield next();
        }
      }
    }
  });
}

function isUnknownContentCharacter(code: CharacterCodes) {
  if (isWhiteSpace(code) || isLineBreak(code)) {
    return false;
  }
  switch (code) {
    case CharacterCodes.EOF:
    case CharacterCodes.closeBrace:
    case CharacterCodes.closeBracket:
    case CharacterCodes.openBrace:
    case CharacterCodes.openBracket:
    case CharacterCodes.doubleQuote:
    case CharacterCodes.colon:
    case CharacterCodes.comma:
    case CharacterCodes.slash:
      return false;
  }
  return true;
}

function isWhiteSpace(ch: number): boolean {
  return ch === CharacterCodes.space || ch === CharacterCodes.tab;
}

function isLineBreak(ch: number): boolean {
  return ch === CharacterCodes.lineFeed || ch === CharacterCodes.carriageReturn;
}

function isDigit(ch: number): boolean {
  return ch >= CharacterCodes._0 && ch <= CharacterCodes._9;
}

const enum CharacterCodes {
  lineFeed = 0x0a, // \n
  carriageReturn = 0x0d, // \r

  space = 0x0020, // " "

  EOF = 0x0000,

  _0 = 0x30,
  _1 = 0x31,
  _2 = 0x32,
  _3 = 0x33,
  _4 = 0x34,
  _5 = 0x35,
  _6 = 0x36,
  _7 = 0x37,
  _8 = 0x38,
  _9 = 0x39,

  a = 0x61,
  b = 0x62,
  c = 0x63,
  d = 0x64,
  e = 0x65,
  f = 0x66,
  g = 0x67,
  h = 0x68,
  i = 0x69,
  j = 0x6a,
  k = 0x6b,
  l = 0x6c,
  m = 0x6d,
  n = 0x6e,
  o = 0x6f,
  p = 0x70,
  q = 0x71,
  r = 0x72,
  s = 0x73,
  t = 0x74,
  u = 0x75,
  v = 0x76,
  w = 0x77,
  x = 0x78,
  y = 0x79,
  z = 0x7a,

  A = 0x41,
  B = 0x42,
  C = 0x43,
  D = 0x44,
  E = 0x45,
  F = 0x46,
  G = 0x47,
  H = 0x48,
  I = 0x49,
  J = 0x4a,
  K = 0x4b,
  L = 0x4c,
  M = 0x4d,
  N = 0x4e,
  O = 0x4f,
  P = 0x50,
  Q = 0x51,
  R = 0x52,
  S = 0x53,
  T = 0x54,
  U = 0x55,
  V = 0x56,
  W = 0x57,
  X = 0x58,
  Y = 0x59,
  Z = 0x5a,

  asterisk = 0x2a, // *
  backslash = 0x5c, // \
  closeBrace = 0x7d, // }
  closeBracket = 0x5d, // ]
  colon = 0x3a, // :
  comma = 0x2c, // ,
  dot = 0x2e, // .
  doubleQuote = 0x22, // "
  minus = 0x2d, // -
  openBrace = 0x7b, // {
  openBracket = 0x5b, // [
  plus = 0x2b, // +
  slash = 0x2f, // /

  formFeed = 0x0c, // \f
  tab = 0x09, // \t
}
