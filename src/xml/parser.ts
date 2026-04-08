import { type ScanOutput, ScanError, SyntaxKind } from "./scanner";
import { isErrorToken, matchesToken } from "./token-utils";

import {
  fromGenerator,
  GENERATOR_END,
  type GeneratorFactoryOptions,
} from "../util/generators";

export type XMLAttribute = {
  name: string;
  value: string;
};

export const enum ParseErrorCode {
  InvalidToken = "InvalidToken",
  RootElementExpected = "RootElementExpected",
  MultipleRootElements = "MultipleRootElements",
  NameExpected = "NameExpected",
  InvalidName = "InvalidName",
  EqualsExpected = "EqualsExpected",
  AttributeValueExpected = "AttributeValueExpected",
  TagCloseExpected = "TagCloseExpected",
  MismatchedTag = "MismatchedTag",
  UnexpectedCloseTag = "UnexpectedCloseTag",
  DuplicateAttribute = "DuplicateAttribute",
  UnexpectedTextBeforeRoot = "UnexpectedTextBeforeRoot",
  UnexpectedTextAfterRoot = "UnexpectedTextAfterRoot",
  EndOfFileExpected = "EndOfFileExpected",
  UnexpectedEndOfInput = "UnexpectedEndOfInput",
  InvalidEntityReference = "InvalidEntityReference",
  InvalidXmlDeclaration = "InvalidXmlDeclaration",
  UnterminatedComment = "UnterminatedComment",
  UnterminatedCData = "UnterminatedCData",
  UnterminatedString = "UnterminatedString",
  UnterminatedProcessingInstruction = "UnterminatedProcessingInstruction",
}

export type ParseOutput =
  | {
      type: "onDocumentBegin";
    }
  | {
      type: "onDocumentEnd";
    }
  | {
      type: "onXmlDeclaration";
      attributes: XMLAttribute[];
    }
  | {
      type: "onElementBegin";
      name: string;
      attributes: XMLAttribute[];
    }
  | {
      type: "onElementEnd";
      name: string;
    }
  | {
      type: "onText";
      value: string;
    }
  | {
      type: "onComment";
      value: string;
    }
  | {
      type: "onCData";
      value: string;
    }
  | {
      type: "onProcessingInstruction";
      target: string;
      data: string;
    }
  | {
      type: "onError";
      error: ParseErrorCode;
    };

type ParseGenerator<T = void> = Generator<ParseOutput | { next: true }, T, unknown>;
type TagTerminator = "tagClose" | "emptyElementClose" | "eof";

type ParsedStartTag = {
  name: string;
  attributes: XMLAttribute[];
  selfClosing: boolean;
};

type OpenElement = {
  name: string;
};

function mapScanError(error: ScanError): ParseErrorCode {
  switch (error) {
    case ScanError.InvalidEntityReference:
      return ParseErrorCode.InvalidEntityReference;
    case ScanError.InvalidName:
      return ParseErrorCode.InvalidName;
    case ScanError.UnterminatedComment:
      return ParseErrorCode.UnterminatedComment;
    case ScanError.UnterminatedCData:
      return ParseErrorCode.UnterminatedCData;
    case ScanError.UnterminatedString:
      return ParseErrorCode.UnterminatedString;
    case ScanError.UnterminatedProcessingInstruction:
      return ParseErrorCode.UnterminatedProcessingInstruction;
    case ScanError.UnexpectedEndOfInput:
      return ParseErrorCode.UnexpectedEndOfInput;
    case ScanError.InvalidToken:
    default:
      return ParseErrorCode.InvalidToken;
  }
}

/**
 * XML parsing is tolerant by default.
 *
 * The parser accepts XML documents and XML fragments, allows multiple top-level
 * nodes, emits `onError` for malformed structure, and then keeps going when a
 * reasonable recovery strategy exists. Examples:
 *
 * - duplicate attributes: emit `onError`, keep the last value
 * - mismatched end tags: emit `onError`, auto-close intervening elements
 * - stray end tags: emit `onError`, skip them
 * - EOF with still-open elements: emit `onError`, then auto-close the stack
 *
 * Scanner-level issues are surfaced as `onError` events as well.
 */
export function parseXMLFromScanner(): TransformStream<ScanOutput, ParseOutput> {
  function* consumeScannerErrors(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): ParseGenerator {
    const { peek, next } = options;
    while (isErrorToken(peek())) {
      const token = peek();
      if (!isErrorToken(token)) {
        return;
      }
      yield { type: "onError", error: mapScanError(token.error) };
      yield next();
    }
  }

  function* skipUntilTagBoundary(
    options: GeneratorFactoryOptions<ScanOutput>,
    allowEmptyElementClose: boolean = true,
  ): ParseGenerator<TagTerminator> {
    const { peek, next } = options;

    while (true) {
      yield* consumeScannerErrors(options);
      const token = peek();

      if (token === GENERATOR_END) {
        return "eof";
      }
      if (matchesToken(token, SyntaxKind.TagCloseToken)) {
        yield next();
        return "tagClose";
      }
      if (allowEmptyElementClose && matchesToken(token, SyntaxKind.EmptyElementCloseToken)) {
        yield next();
        return "emptyElementClose";
      }

      yield next();
    }
  }

  function* skipUnexpectedTagToken(
    options: GeneratorFactoryOptions<ScanOutput>,
    allowEmptyElementClose: boolean = true,
  ): ParseGenerator {
    const token = options.peek();

    if (token === GENERATOR_END) {
      return;
    }
    if (matchesToken(token, SyntaxKind.TagCloseToken)) {
      return;
    }
    if (allowEmptyElementClose && matchesToken(token, SyntaxKind.EmptyElementCloseToken)) {
      return;
    }
    if (matchesToken(token, SyntaxKind.Name)) {
      return;
    }

    yield options.next();
  }

  function* parseAttributes(
    options: GeneratorFactoryOptions<ScanOutput>,
    allowEmptyElementClose: boolean = true,
  ): ParseGenerator<{ attributes: XMLAttribute[]; terminator: TagTerminator }> {
    const { peek, next } = options;
    const attributes: XMLAttribute[] = [];
    const indexByName = new Map<string, number>();

    while (true) {
      yield* consumeScannerErrors(options);
      const token = peek();

      if (token === GENERATOR_END) {
        return { attributes, terminator: "eof" };
      }
      if (matchesToken(token, SyntaxKind.TagCloseToken)) {
        yield next();
        return { attributes, terminator: "tagClose" };
      }
      if (allowEmptyElementClose && matchesToken(token, SyntaxKind.EmptyElementCloseToken)) {
        yield next();
        return { attributes, terminator: "emptyElementClose" };
      }

      if (!matchesToken(token, SyntaxKind.Name)) {
        yield { type: "onError", error: ParseErrorCode.NameExpected };
        yield* skipUnexpectedTagToken(options, allowEmptyElementClose);
        continue;
      }

      const name = token.value;
      yield next();

      yield* consumeScannerErrors(options);
      const equalsToken = peek();
      if (!matchesToken(equalsToken, SyntaxKind.EqualsToken)) {
        yield { type: "onError", error: ParseErrorCode.EqualsExpected };
        if (matchesToken(equalsToken, SyntaxKind.StringLiteral)) {
          yield next();
        } else {
          yield* skipUnexpectedTagToken(options, allowEmptyElementClose);
        }
        continue;
      }

      yield next();

      yield* consumeScannerErrors(options);
      const valueToken = peek();
      if (!matchesToken(valueToken, SyntaxKind.StringLiteral)) {
        yield { type: "onError", error: ParseErrorCode.AttributeValueExpected };
        yield* skipUnexpectedTagToken(options, allowEmptyElementClose);
        continue;
      }

      yield next();

      const existingIndex = indexByName.get(name);
      if (existingIndex !== undefined) {
        yield { type: "onError", error: ParseErrorCode.DuplicateAttribute };
        attributes[existingIndex] = { name, value: valueToken.value };
        continue;
      }

      indexByName.set(name, attributes.length);
      attributes.push({ name, value: valueToken.value });
    }
  }

  function* parseStartTag(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): ParseGenerator<ParsedStartTag | null> {
    const { peek, next } = options;

    yield* consumeScannerErrors(options);
    const nameToken = peek();
    if (!matchesToken(nameToken, SyntaxKind.Name)) {
      yield { type: "onError", error: ParseErrorCode.NameExpected };
      yield* skipUntilTagBoundary(options);
      return null;
    }

    yield next();

    const { attributes, terminator } = yield* parseAttributes(options);
    return {
      name: nameToken.value,
      attributes,
      selfClosing: terminator === "emptyElementClose",
    };
  }

  function* parseEndTag(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): ParseGenerator<string | null> {
    const { peek, next } = options;

    yield* consumeScannerErrors(options);
    const nameToken = peek();
    if (!matchesToken(nameToken, SyntaxKind.Name)) {
      yield { type: "onError", error: ParseErrorCode.NameExpected };
      yield* skipUntilTagBoundary(options);
      return null;
    }

    yield next();

    yield* consumeScannerErrors(options);
    const closeToken = peek();
    if (matchesToken(closeToken, SyntaxKind.TagCloseToken)) {
      yield next();
      return nameToken.value;
    }
    if (matchesToken(closeToken, SyntaxKind.EmptyElementCloseToken)) {
      yield { type: "onError", error: ParseErrorCode.TagCloseExpected };
      yield next();
      return nameToken.value;
    }
    if (closeToken === GENERATOR_END) {
      return nameToken.value;
    }

    yield { type: "onError", error: ParseErrorCode.TagCloseExpected };
    yield* skipUntilTagBoundary(options);
    return nameToken.value;
  }

  function* parseXmlDeclaration(
    options: GeneratorFactoryOptions<ScanOutput>,
  ): ParseGenerator<XMLAttribute[]> {
    const { attributes } = yield* parseAttributes(options, false);
    return attributes;
  }

  function* autoCloseOpenElements(stack: OpenElement[]): ParseGenerator {
    while (stack.length > 0) {
      const current = stack.pop()!;
      yield { type: "onElementEnd", name: current.name };
    }
  }

  function findOpenElementIndex(stack: OpenElement[], name: string): number {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === name) {
        return i;
      }
    }
    return -1;
  }

  return fromGenerator(function* (options) {
    const { peek, next } = options;
    const stack: OpenElement[] = [];
    let sawXmlDeclaration = false;
    let declarationStillAllowed = true;

    function markTopLevelContentSeen(): void {
      if (stack.length === 0) {
        declarationStillAllowed = false;
      }
    }

    yield { type: "onDocumentBegin" };

    while (true) {
      yield* consumeScannerErrors(options);
      const token = peek();

      if (token === GENERATOR_END) {
        if (stack.length > 0) {
          yield { type: "onError", error: ParseErrorCode.UnexpectedEndOfInput };
          yield* autoCloseOpenElements(stack);
        }
        yield { type: "onDocumentEnd" };
        return;
      }

      if (matchesToken(token, SyntaxKind.XmlDeclarationOpenToken)) {
        yield next();
        const attributes = yield* parseXmlDeclaration(options);
        if (!sawXmlDeclaration && declarationStillAllowed && stack.length === 0) {
          sawXmlDeclaration = true;
          declarationStillAllowed = false;
          yield {
            type: "onXmlDeclaration",
            attributes,
          };
        } else {
          yield { type: "onError", error: ParseErrorCode.InvalidXmlDeclaration };
          if (stack.length === 0) {
            declarationStillAllowed = false;
          }
        }
        continue;
      }

      if (matchesToken(token, SyntaxKind.StartTagOpenToken)) {
        yield next();
        markTopLevelContentSeen();
        const startTag = yield* parseStartTag(options);
        if (startTag === null) {
          continue;
        }

        yield {
          type: "onElementBegin",
          name: startTag.name,
          attributes: startTag.attributes,
        };

        if (startTag.selfClosing) {
          yield { type: "onElementEnd", name: startTag.name };
        } else {
          stack.push({ name: startTag.name });
        }
        continue;
      }

      if (matchesToken(token, SyntaxKind.EndTagOpenToken)) {
        yield next();
        const closeName = yield* parseEndTag(options);
        if (closeName === null) {
          continue;
        }

        if (stack.length === 0) {
          yield { type: "onError", error: ParseErrorCode.UnexpectedCloseTag };
          continue;
        }

        const matchIndex = findOpenElementIndex(stack, closeName);
        if (matchIndex === -1) {
          yield { type: "onError", error: ParseErrorCode.UnexpectedCloseTag };
          continue;
        }

        if (matchIndex !== stack.length - 1) {
          yield { type: "onError", error: ParseErrorCode.MismatchedTag };
        }

        while (stack.length - 1 > matchIndex) {
          const current = stack.pop()!;
          yield { type: "onElementEnd", name: current.name };
        }

        const current = stack.pop()!;
        yield { type: "onElementEnd", name: current.name };
        continue;
      }

      if (matchesToken(token, SyntaxKind.Text)) {
        yield next();
        if (stack.length === 0 && token.value.trim().length === 0) {
          continue;
        }
        markTopLevelContentSeen();
        yield { type: "onText", value: token.value };
        continue;
      }

      if (matchesToken(token, SyntaxKind.Comment)) {
        yield next();
        markTopLevelContentSeen();
        yield { type: "onComment", value: token.value };
        continue;
      }

      if (matchesToken(token, SyntaxKind.CData)) {
        yield next();
        markTopLevelContentSeen();
        yield { type: "onCData", value: token.value };
        continue;
      }

      if (matchesToken(token, SyntaxKind.ProcessingInstruction)) {
        yield next();
        markTopLevelContentSeen();
        yield {
          type: "onProcessingInstruction",
          target: token.target,
          data: token.data,
        };
        continue;
      }

      yield { type: "onError", error: ParseErrorCode.InvalidToken };
      yield next();
    }
  });
}
