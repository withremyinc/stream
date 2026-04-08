/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ScanError, SyntaxKind, type ScanOutput } from "./scanner";

import {
  fromGenerator,
  GENERATOR_END,
  type GeneratorFactoryOptions,
  type GeneratorWithNext,
} from "../util/generators";

/**
 * A {@linkcode JSONPath} segment. Either a string representing an object property name
 * or a number (starting at 0) for array indices.
 */
export type Segment = string | number;
export type JSONPath = Segment[];

export const enum ParseErrorCode {
  InvalidSymbol = "InvalidSymbol",
  InvalidNumberFormat = "InvalidNumberFormat",
  PropertyNameExpected = "PropertyNameExpected",
  ValueExpected = "ValueExpected",
  ColonExpected = "ColonExpected",
  CommaExpected = "CommaExpected",
  CloseBraceExpected = "CloseBraceExpected",
  CloseBracketExpected = "CloseBracketExpected",
  EndOfFileExpected = "EndOfFileExpected",
  InvalidCommentToken = "InvalidCommentToken",
  UnexpectedEndOfComment = "UnexpectedEndOfComment",
  UnexpectedEndOfString = "UnexpectedEndOfString",
  UnexpectedEndOfNumber = "UnexpectedEndOfNumber",
  InvalidUnicode = "InvalidUnicode",
  InvalidEscapeCharacter = "InvalidEscapeCharacter",
  InvalidCharacter = "InvalidCharacter",
}

export type ParseOutput =
  | {
      /**
       * Invoked when an open brace is encountered and an object is started.
       */
      type: "onObjectBegin";
      path: JSONPath;
    }
  | {
      /**
       * Invoked when a property is encountered.

       * The `JSONPath` refers to the enclosing JSON object, it does not include the
       * property name yet.
       */
      type: "onObjectProperty";
      name: string | number;
      path: JSONPath;
    }
  | {
      /**
       * Invoked when a closing brace is encountered and an object is completed.
       */
      type: "onObjectEnd";
      path: JSONPath;
    }
  | {
      /**
       * Invoked when an open bracket is encountered and an array is started.
       */
      type: "onArrayBegin";
      path: JSONPath;
    }
  | {
      /**
       * Invoked when a closing bracket is encountered and an array is completed.
       */
      type: "onArrayEnd";
      path: JSONPath;
    }
  | {
      /**
       * Invoked when a literal value is encountered.
       */
      type: "onLiteralValue";
      value: any;
      path: JSONPath;
    }
  | {
      type: "onError";
      error: ParseErrorCode;
    };

function matchesToken(
  scanOutput: ScanOutput | symbol,
  token: SyntaxKind,
): scanOutput is { token: SyntaxKind; value?: any; string?: string } {
  if (typeof scanOutput === "symbol") return false;
  if (!("token" in scanOutput)) return false;
  return scanOutput.token === token;
}

/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
export function parseJSONFromScanner(): TransformStream<
  ScanOutput,
  ParseOutput
> {
  // Important: Only pass copies of this to visitor functions to prevent accidental modification, and
  // to not affect visitor functions which stored a reference to a previous JSONPath
  const _jsonPath: JSONPath = [];

  function cloneJSONPath(): JSONPath {
    switch (_jsonPath.length) {
      case 0:
        return [];
      case 1:
        return [_jsonPath[0]];
      case 2:
        return [_jsonPath[0], _jsonPath[1]];
      case 3:
        return [_jsonPath[0], _jsonPath[1], _jsonPath[2]];
      case 4:
        return [_jsonPath[0], _jsonPath[1], _jsonPath[2], _jsonPath[3]];
      default:
        return _jsonPath.slice();
    }
  }

  function* handleError(
    error: ParseErrorCode,
    options: GeneratorFactoryOptions<ScanOutput>,
    skipUntilAfter: SyntaxKind[] = [],
    skipUntil: SyntaxKind[] = [],
  ): GeneratorWithNext<ParseOutput> {
    const { peek, next } = options;
    yield { type: "onError", error };

    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token = peek();
      while (
        typeof token !== "symbol" &&
        "token" in token &&
        token.token !== SyntaxKind.EOF
      ) {
        if (skipUntilAfter.indexOf(token.token) !== -1) {
          yield next();
          break;
        } else if (skipUntil.indexOf(token.token) !== -1) {
          break;
        }
        yield next();
        token = peek();
      }
    }
  }

  function* parseLiteral(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): GeneratorWithNext<ParseOutput> {
    const { peek, next } = options;
    const token = peek();
    let consumedLiteral = false;

    if (matchesToken(token, SyntaxKind.StringLiteral)) {
      consumedLiteral = true;
      let value = token.value;
      yield {
        type: "onLiteralValue",
        value,
        path: cloneJSONPath(),
      };
    } else if (matchesToken(token, SyntaxKind.NumericLiteral)) {
      consumedLiteral = true;
      let value = Number(token.value);
      if (isNaN(value)) {
        yield* handleError(ParseErrorCode.InvalidNumberFormat, options);
        value = 0;
      }
      yield {
        type: "onLiteralValue",
        value,
        path: cloneJSONPath(),
      };
    } else if (matchesToken(token, SyntaxKind.TrueKeyword)) {
      consumedLiteral = true;
      let value = true;
      yield {
        type: "onLiteralValue",
        value,
        path: cloneJSONPath(),
      };
    } else if (matchesToken(token, SyntaxKind.FalseKeyword)) {
      consumedLiteral = true;
      let value = false;
      yield {
        type: "onLiteralValue",
        value,
        path: cloneJSONPath(),
      };
    } else if (matchesToken(token, SyntaxKind.NullKeyword)) {
      consumedLiteral = true;
      yield {
        type: "onLiteralValue",
        value: null,
        path: cloneJSONPath(),
      };
    }

    if (consumedLiteral) {
      yield next();
    }
  }

  function* parseProperty(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): GeneratorWithNext<ParseOutput> {
    const { peek, next, pos } = options;
    const token = peek();

    if (!matchesToken(token, SyntaxKind.StringLiteral)) {
      yield* handleError(
        ParseErrorCode.PropertyNameExpected,
        options,
        [],
        [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken],
      );
      return;
    }

    const stringValue = token.value;
    yield {
      type: "onObjectProperty",
      name: stringValue,
      path: cloneJSONPath(),
    };
    // add property name afterwards
    _jsonPath.push(stringValue);

    yield next();
    if (matchesToken(peek(), SyntaxKind.ColonToken)) {
      yield next(); // consume colon

      const start = pos();
      yield* parseValue(options);
      const end = pos();

      if (start === end) {
        yield* handleError(
          ParseErrorCode.ValueExpected,
          options,
          [],
          [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken],
        );
      }
    } else {
      yield* handleError(
        ParseErrorCode.ColonExpected,
        options,
        [],
        [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken],
      );
    }

    _jsonPath.pop(); // remove processed property name
  }

  function* parseObject(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): GeneratorWithNext<ParseOutput> {
    const { peek, next, pos } = options;

    yield {
      type: "onObjectBegin",
      path: cloneJSONPath(),
    };
    yield next(); // consume open brace

    let needsComma = false;
    while (true) {
      const currentToken = peek();
      if (
        currentToken === GENERATOR_END ||
        matchesToken(currentToken, SyntaxKind.CloseBraceToken)
      ) {
        break;
      }
      if (matchesToken(peek(), SyntaxKind.CommaToken)) {
        if (!needsComma) {
          yield* handleError(ParseErrorCode.ValueExpected, options, [], []);
        }
        yield next(); // consume comma

        // trailing comma
        if (matchesToken(peek(), SyntaxKind.CloseBraceToken)) {
          break;
        }
      } else if (needsComma) {
        yield* handleError(ParseErrorCode.CommaExpected, options, [], []);
      }

      const start = pos();
      yield* parseProperty(options);
      const end = pos();

      if (start === end) {
        yield* handleError(
          ParseErrorCode.ValueExpected,
          options,
          [],
          [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken],
        );
      }
      needsComma = true;
    }

    yield {
      type: "onObjectEnd",
      path: cloneJSONPath(),
    };

    if (!matchesToken(peek(), SyntaxKind.CloseBraceToken)) {
      yield* handleError(
        ParseErrorCode.CloseBraceExpected,
        options,
        [SyntaxKind.CloseBraceToken],
        [],
      );
    } else {
      yield next(); // consume close brace
    }
  }

  function* parseArray(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): GeneratorWithNext<ParseOutput> {
    const { peek, next, pos } = options;

    yield {
      type: "onArrayBegin",
      path: cloneJSONPath(),
    };

    yield next(); // consume open bracket
    let isFirstElement = true;

    let needsComma = false;
    while (true) {
      const currentToken = peek();
      if (
        currentToken === GENERATOR_END ||
        matchesToken(currentToken, SyntaxKind.CloseBracketToken)
      ) {
        break;
      }
      if (matchesToken(peek(), SyntaxKind.CommaToken)) {
        if (!needsComma) {
          yield* handleError(ParseErrorCode.ValueExpected, options, [], []);
        }
        yield next(); // consume comma

        // trailing comma
        if (matchesToken(peek(), SyntaxKind.CloseBracketToken)) {
          break;
        }
      } else if (needsComma) {
        yield* handleError(ParseErrorCode.CommaExpected, options, [], []);
      }
      if (isFirstElement) {
        _jsonPath.push(0);
        isFirstElement = false;
      } else {
        (_jsonPath[_jsonPath.length - 1] as number)++;
      }

      const start = pos();
      yield* parseValue(options);
      const end = pos();

      if (start === end) {
        yield* handleError(
          ParseErrorCode.ValueExpected,
          options,
          [],
          [SyntaxKind.CloseBracketToken, SyntaxKind.CommaToken],
        );
      }
      needsComma = true;
    }
    yield {
      type: "onArrayEnd",
      path: cloneJSONPath(),
    };
    if (!isFirstElement) {
      _jsonPath.pop(); // remove array index
    }
    if (!matchesToken(peek(), SyntaxKind.CloseBracketToken)) {
      yield* handleError(
        ParseErrorCode.CloseBracketExpected,
        options,
        [SyntaxKind.CloseBracketToken],
        [],
      );
    } else {
      yield next(); // consume close bracket
    }
  }

  function* parseValue(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): GeneratorWithNext<ParseOutput> {
    const { peek } = options;
    const token = peek();

    if (matchesToken(token, SyntaxKind.OpenBracketToken)) {
      yield* parseArray(options);
    } else if (matchesToken(token, SyntaxKind.OpenBraceToken)) {
      yield* parseObject(options);
    } else {
      yield* parseLiteral(options);
    }
  }

  return fromGenerator(function* (options) {
    const { peek } = options;
    while (true) {
      const token = peek();
      if (token === GENERATOR_END) {
        yield { type: "onError", error: ParseErrorCode.ValueExpected };
        return;
      }

      if ("error" in token) {
        switch (token.error) {
          case ScanError.InvalidUnicode:
            yield* handleError(ParseErrorCode.InvalidUnicode, options);
            break;
          case ScanError.InvalidEscapeCharacter:
            yield* handleError(ParseErrorCode.InvalidEscapeCharacter, options);
            break;
          case ScanError.UnexpectedEndOfNumber:
            yield* handleError(ParseErrorCode.UnexpectedEndOfNumber, options);
            break;
          case ScanError.UnexpectedEndOfComment:
            yield* handleError(ParseErrorCode.UnexpectedEndOfComment, options);
            break;
          case ScanError.UnexpectedEndOfString:
            yield* handleError(ParseErrorCode.UnexpectedEndOfString, options);
            break;
          case ScanError.InvalidCharacter:
            yield* handleError(ParseErrorCode.InvalidCharacter, options);
            break;
        }
      }

      if ("token" in token) {
        switch (token.token) {
          case SyntaxKind.Unknown:
            yield* handleError(ParseErrorCode.InvalidSymbol, options);
            return;
          case SyntaxKind.OpenBracketToken:
            yield* parseArray(options);
            break;
          case SyntaxKind.OpenBraceToken:
            yield* parseObject(options);
            break;
          case SyntaxKind.StringLiteral:
          default:
            yield* parseLiteral(options);
            break;
        }
        if (peek() !== GENERATOR_END) {
          yield* handleError(ParseErrorCode.EndOfFileExpected, options);
        }
        return;
      }
    }
  });
}
