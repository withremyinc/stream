import { ParseErrorCode, type ParseOutput, type XMLAttribute } from "./parser";
import { ScanError, SyntaxKind, type ScanOutput } from "./scanner";
import { isErrorToken, matchesToken } from "./token-utils";

import {
  fromGenerator,
  GENERATOR_END,
  type GeneratorFactoryOptions,
} from "../util/generators";

export type XMLExtractOutput = Extract<
  ParseOutput,
  { type: "onElementBegin" | "onElementEnd" | "onText" | "onError" }
>;

type ExtractGenerator<T = void> = Generator<XMLExtractOutput | { next: true }, T, unknown>;
type TagTerminator = "tagClose" | "emptyElementClose" | "eof";

type ParsedStartTag = {
  name: string | null;
  attributes: XMLAttribute[];
  selfClosing: boolean;
  errors: ParseErrorCode[];
};

type ParsedEndTag = {
  name: string | null;
  errors: ParseErrorCode[];
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

function* consumeScannerErrors(
  options: GeneratorFactoryOptions<ScanOutput>,
  errors: ParseErrorCode[],
): ExtractGenerator {
  const { peek, next } = options;
  while (isErrorToken(peek())) {
    const token = peek();
    if (!isErrorToken(token)) {
      return;
    }
    errors.push(mapScanError(token.error));
    yield next();
  }
}

function* skipUntilTagBoundary(
  options: GeneratorFactoryOptions<ScanOutput>,
  errors: ParseErrorCode[],
  allowEmptyElementClose: boolean = true,
): ExtractGenerator<TagTerminator> {
  const { peek, next } = options;

  while (true) {
    yield* consumeScannerErrors(options, errors);
    const token = peek();

    if (token === GENERATOR_END) {
      return "eof";
    }
    if (matchesToken(token, SyntaxKind.TagCloseToken)) {
      yield next();
      return "tagClose";
    }
    if (
      allowEmptyElementClose &&
      matchesToken(token, SyntaxKind.EmptyElementCloseToken)
    ) {
      yield next();
      return "emptyElementClose";
    }

    yield next();
  }
}

function* skipUnexpectedTagToken(
  options: GeneratorFactoryOptions<ScanOutput>,
  allowEmptyElementClose: boolean = true,
): ExtractGenerator {
  const token = options.peek();

  if (token === GENERATOR_END) {
    return;
  }
  if (matchesToken(token, SyntaxKind.TagCloseToken)) {
    return;
  }
  if (
    allowEmptyElementClose &&
    matchesToken(token, SyntaxKind.EmptyElementCloseToken)
  ) {
    return;
  }
  if (matchesToken(token, SyntaxKind.Name)) {
    return;
  }

  yield options.next();
}

function* parseAttributes(
  options: GeneratorFactoryOptions<ScanOutput>,
  errors: ParseErrorCode[],
  allowEmptyElementClose: boolean = true,
): ExtractGenerator<{ attributes: XMLAttribute[]; terminator: TagTerminator }> {
  const { peek, next } = options;
  const attributes: XMLAttribute[] = [];
  const indexByName = new Map<string, number>();

  while (true) {
    yield* consumeScannerErrors(options, errors);
    const token = peek();

    if (token === GENERATOR_END) {
      return { attributes, terminator: "eof" };
    }
    if (matchesToken(token, SyntaxKind.TagCloseToken)) {
      yield next();
      return { attributes, terminator: "tagClose" };
    }
    if (
      allowEmptyElementClose &&
      matchesToken(token, SyntaxKind.EmptyElementCloseToken)
    ) {
      yield next();
      return { attributes, terminator: "emptyElementClose" };
    }

    if (!matchesToken(token, SyntaxKind.Name)) {
      errors.push(ParseErrorCode.NameExpected);
      yield* skipUnexpectedTagToken(options, allowEmptyElementClose);
      continue;
    }

    const name = token.value;
    yield next();

    yield* consumeScannerErrors(options, errors);
    const equalsToken = peek();
    if (!matchesToken(equalsToken, SyntaxKind.EqualsToken)) {
      errors.push(ParseErrorCode.EqualsExpected);
      if (matchesToken(equalsToken, SyntaxKind.StringLiteral)) {
        yield next();
      } else {
        yield* skipUnexpectedTagToken(options, allowEmptyElementClose);
      }
      continue;
    }

    yield next();

    yield* consumeScannerErrors(options, errors);
    const valueToken = peek();
    if (!matchesToken(valueToken, SyntaxKind.StringLiteral)) {
      errors.push(ParseErrorCode.AttributeValueExpected);
      yield* skipUnexpectedTagToken(options, allowEmptyElementClose);
      continue;
    }

    yield next();

    const existingIndex = indexByName.get(name);
    if (existingIndex !== undefined) {
      errors.push(ParseErrorCode.DuplicateAttribute);
      attributes[existingIndex] = { name, value: valueToken.value };
      continue;
    }

    indexByName.set(name, attributes.length);
    attributes.push({ name, value: valueToken.value });
  }
}

function* parseStartTag(
  options: GeneratorFactoryOptions<ScanOutput>,
): ExtractGenerator<ParsedStartTag> {
  const { peek, next } = options;
  const errors: ParseErrorCode[] = [];

  yield* consumeScannerErrors(options, errors);
  const nameToken = peek();
  if (!matchesToken(nameToken, SyntaxKind.Name)) {
    errors.push(ParseErrorCode.NameExpected);
    yield* skipUntilTagBoundary(options, errors);
    return {
      name: null,
      attributes: [],
      selfClosing: false,
      errors,
    };
  }

  yield next();

  const { attributes, terminator } = yield* parseAttributes(options, errors);
  return {
    name: nameToken.value,
    attributes,
    selfClosing: terminator === "emptyElementClose",
    errors,
  };
}

function* parseEndTag(
  options: GeneratorFactoryOptions<ScanOutput>,
): ExtractGenerator<ParsedEndTag> {
  const { peek, next } = options;
  const errors: ParseErrorCode[] = [];

  yield* consumeScannerErrors(options, errors);
  const nameToken = peek();
  if (!matchesToken(nameToken, SyntaxKind.Name)) {
    errors.push(ParseErrorCode.NameExpected);
    yield* skipUntilTagBoundary(options, errors, false);
    return { name: null, errors };
  }

  yield next();

  yield* consumeScannerErrors(options, errors);
  const closeToken = peek();
  if (matchesToken(closeToken, SyntaxKind.TagCloseToken)) {
    yield next();
    return { name: nameToken.value, errors };
  }
  if (matchesToken(closeToken, SyntaxKind.EmptyElementCloseToken)) {
    errors.push(ParseErrorCode.TagCloseExpected);
    yield next();
    return { name: nameToken.value, errors };
  }
  if (closeToken === GENERATOR_END) {
    return { name: nameToken.value, errors };
  }

  errors.push(ParseErrorCode.TagCloseExpected);
  yield* skipUntilTagBoundary(options, errors, false);
  return { name: nameToken.value, errors };
}

export function extractXMLFromScanner(options: {
  allowTags: ReadonlySet<string>;
}): TransformStream<ScanOutput, XMLExtractOutput> {
  const { allowTags } = options;

  return fromGenerator(function* (generatorOptions) {
    const { peek, next } = generatorOptions;
    let activeTagName: string | null = null;

    while (true) {
      const token = peek();

      if (token === GENERATOR_END) {
        if (activeTagName !== null) {
          yield {
            type: "onError",
            error: ParseErrorCode.UnexpectedEndOfInput,
          };
          yield {
            type: "onElementEnd",
            name: activeTagName,
          };
        }
        return;
      }

      if (activeTagName !== null) {
        if (isErrorToken(token)) {
          yield {
            type: "onError",
            error: mapScanError(token.error),
          };
          yield next();
          continue;
        }

        if (matchesToken(token, SyntaxKind.Text)) {
          yield next();
          yield {
            type: "onText",
            value: token.value,
          };
          continue;
        }

        if (matchesToken(token, SyntaxKind.EndTagOpenToken)) {
          yield next();
          const endTag = yield* parseEndTag(generatorOptions);
          for (const error of endTag.errors) {
            yield { type: "onError", error };
          }
          if (endTag.name !== null && endTag.name !== activeTagName) {
            yield { type: "onError", error: ParseErrorCode.MismatchedTag };
          }
          yield {
            type: "onElementEnd",
            name: activeTagName,
          };
          activeTagName = null;
          continue;
        }

        yield { type: "onError", error: ParseErrorCode.InvalidToken };
        yield next();
        continue;
      }

      if (isErrorToken(token)) {
        yield next();
        continue;
      }

      if (matchesToken(token, SyntaxKind.StartTagOpenToken)) {
        yield next();
        const startTag = yield* parseStartTag(generatorOptions);
        if (startTag.name === null || !allowTags.has(startTag.name)) {
          continue;
        }

        for (const error of startTag.errors) {
          yield { type: "onError", error };
        }
        yield {
          type: "onElementBegin",
          name: startTag.name,
          attributes: startTag.attributes,
        };

        if (startTag.selfClosing) {
          yield {
            type: "onElementEnd",
            name: startTag.name,
          };
        } else {
          activeTagName = startTag.name;
        }
        continue;
      }

      if (matchesToken(token, SyntaxKind.EndTagOpenToken)) {
        yield next();
        yield* parseEndTag(generatorOptions);
        continue;
      }

      if (matchesToken(token, SyntaxKind.XmlDeclarationOpenToken)) {
        yield next();
        yield* skipUntilTagBoundary(generatorOptions, [], false);
        continue;
      }

      yield next();
    }
  });
}
