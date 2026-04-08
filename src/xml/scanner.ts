import { fromStringGenerator, GENERATOR_END } from "../util/generators";

export const enum ScanError {
  UnexpectedEndOfInput = "UnexpectedEndOfInput",
  UnterminatedComment = "UnterminatedComment",
  UnterminatedCData = "UnterminatedCData",
  UnterminatedString = "UnterminatedString",
  UnterminatedProcessingInstruction = "UnterminatedProcessingInstruction",
  InvalidName = "InvalidName",
  InvalidEntityReference = "InvalidEntityReference",
  InvalidToken = "InvalidToken",
}

export const enum SyntaxKind {
  StartTagOpenToken = "StartTagOpenToken",
  EndTagOpenToken = "EndTagOpenToken",
  XmlDeclarationOpenToken = "XmlDeclarationOpenToken",
  TagCloseToken = "TagCloseToken",
  EmptyElementCloseToken = "EmptyElementCloseToken",
  EqualsToken = "EqualsToken",
  Name = "Name",
  StringLiteral = "StringLiteral",
  Text = "Text",
  Comment = "Comment",
  CData = "CData",
  ProcessingInstruction = "ProcessingInstruction",
}

export type ScanOutput =
  | {
      token: SyntaxKind.StartTagOpenToken;
    }
  | {
      token: SyntaxKind.EndTagOpenToken;
    }
  | {
      token: SyntaxKind.XmlDeclarationOpenToken;
    }
  | {
      token: SyntaxKind.TagCloseToken;
    }
  | {
      token: SyntaxKind.EmptyElementCloseToken;
    }
  | {
      token: SyntaxKind.EqualsToken;
    }
  | {
      token: SyntaxKind.Name;
      value: string;
    }
  | {
      token: SyntaxKind.StringLiteral;
      value: string;
    }
  | {
      token: SyntaxKind.Text;
      value: string;
    }
  | {
      token: SyntaxKind.Comment;
      value: string;
    }
  | {
      token: SyntaxKind.CData;
      value: string;
    }
  | {
      token: SyntaxKind.ProcessingInstruction;
      target: string;
      data: string;
    }
  | {
      error: ScanError;
    };

export type XMLTextMode = "coalesced" | "delta";

export type ScanXMLOptions = {
  foreignTags?: readonly string[];
  textMode?: XMLTextMode;
};

type ScanGenerator<T = void> = Generator<ScanOutput | { next: true }, T, unknown>;

const enum TagMode {
  None = "None",
  Element = "Element",
  XmlDeclaration = "XmlDeclaration",
}

/**
 * XML scanner design
 *
 * Modes:
 * - content mode: emit text, comments, CDATA, processing instructions, and tag open tokens
 * - tag mode: emit element/attribute names, equals, quoted string literals, tag closes
 * - quoted value mode: collect attribute value text and decode entity references
 * - comment/CDATA/PI modes: collect raw content until their terminating delimiters
 * - foreign/raw mode: collect opaque text until a matching closing tag for a configured foreign tag
 */
export function scanXML(
  options: ScanXMLOptions = {},
): TransformStream<string, ScanOutput> {
  const foreignTagSet = new Set(options.foreignTags ?? []);
  const textMode = options.textMode ?? "coalesced";

  return fromStringGenerator(function* (generatorOptions) {
    const { peek, next, substring, pos, retainFrom, resumedAfterInputExhaustion } = generatorOptions;
    let tagMode = TagMode.None;
    let currentTagIsEnd = false;
    let currentTagName: string | null = null;
    let currentTagIsForeign = false;
    let rawTagName: string | null = null;

    function currentChar(): string | null {
      const value = peek();
      if (value === GENERATOR_END) {
        return null;
      }
      return value;
    }

    function resetCurrentTag(): void {
      currentTagIsEnd = false;
      currentTagName = null;
      currentTagIsForeign = false;
    }

    function shouldEmitTextDelta(): boolean {
      return textMode === "delta" && resumedAfterInputExhaustion();
    }

    function* emitTextToken(value: string): ScanGenerator {
      if (value.length === 0) {
        return;
      }
      yield {
        token: SyntaxKind.Text,
        value,
      };
    }

    function* flushTextDelta(value: string): ScanGenerator<string> {
      if (!shouldEmitTextDelta() || value.length === 0) {
        return value;
      }
      yield* emitTextToken(value);
      return "";
    }

    function* advance(retainCurrent: boolean = true): ScanGenerator {
      yield next();
      if (retainCurrent) {
        retainFrom(pos());
      }
    }

    function* skipWhitespace(): ScanGenerator {
      while (isWhitespace(currentChar())) {
        yield* advance();
      }
    }

    function* readName(): ScanGenerator<string> {
      const first = currentChar();
      if (first === null || !isNameStartChar(first)) {
        yield { error: ScanError.InvalidName };
        return "";
      }

      const start = pos();
      retainFrom(start);
      yield* advance(false);
      while (true) {
        const ch = currentChar();
        if (ch === null || !isNameChar(ch)) {
          break;
        }
        yield* advance(false);
      }
      const value = substring(start, pos());
      retainFrom(pos());
      return value;
    }

    function* emitNameToken(): ScanGenerator {
      const value = yield* readName();
      if (value.length > 0) {
        if (
          tagMode === TagMode.Element &&
          !currentTagIsEnd &&
          currentTagName === null
        ) {
          currentTagName = value;
          currentTagIsForeign = foreignTagSet.has(value);
        }
        yield { token: SyntaxKind.Name, value };
      }
    }

    /**
     * v1 intentionally supports only predefined XML entities plus numeric
     * character references. Unknown named entities are rejected instead of
     * guessed or resolved through DTD/entity declarations.
     */
    function decodeEntityReference(body: string): string | undefined {
      switch (body) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
      }

      if (!body.startsWith("#")) {
        return undefined;
      }

      let codePoint: number;
      if (body[1] === "x" || body[1] === "X") {
        const digits = body.slice(2);
        if (digits.length === 0 || !/^[0-9a-fA-F]+$/.test(digits)) {
          return undefined;
        }
        codePoint = Number.parseInt(digits, 16);
      } else {
        const digits = body.slice(1);
        if (digits.length === 0 || !/^[0-9]+$/.test(digits)) {
          return undefined;
        }
        codePoint = Number.parseInt(digits, 10);
      }

      if (
        !Number.isFinite(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff
      ) {
        return undefined;
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return undefined;
      }
    }

    function* scanEntityReference(): ScanGenerator<string> {
      let raw = "&";
      let body = "";

      yield* advance();

      while (true) {
        const ch = currentChar();
        if (ch === null) {
          yield { error: ScanError.InvalidEntityReference };
          return raw + body;
        }
        if (ch === ";") {
          raw += body + ";";
          yield* advance();
          const decoded = decodeEntityReference(body);
          if (decoded === undefined) {
            yield { error: ScanError.InvalidEntityReference };
            return raw;
          }
          return decoded;
        }
        if (!isEntityBodyChar(ch)) {
          yield { error: ScanError.InvalidEntityReference };
          return raw + body;
        }

        body += ch;
        yield* advance();
      }
    }

    function* scanQuotedString(): ScanGenerator {
      const quote = currentChar();
      if (quote !== '"' && quote !== "'") {
        yield { error: ScanError.InvalidToken };
        return;
      }

      yield* advance();
      let value = "";
      let start = pos();
      retainFrom(start);

      while (true) {
        const ch = currentChar();
        if (ch === null) {
          value += substring(start, pos());
          retainFrom(pos());
          yield { error: ScanError.UnterminatedString };
          break;
        }
        if (ch === quote) {
          value += substring(start, pos());
          yield* advance();
          retainFrom(pos());
          break;
        }
        if (ch === "&") {
          value += substring(start, pos());
          value += yield* scanEntityReference();
          start = pos();
          retainFrom(start);
          continue;
        }
        if (ch === "<") {
          value += substring(start, pos());
          yield { error: ScanError.InvalidToken };
          value += ch;
          yield* advance(false);
          start = pos();
          retainFrom(start);
          continue;
        }
        yield* advance(false);
      }

      yield {
        token: SyntaxKind.StringLiteral,
        value,
      };
    }

    function* scanText(): ScanGenerator {
      let value = "";
      let start = pos();
      retainFrom(start);

      while (true) {
        const ch = currentChar();
        if (ch === null || ch === "<") {
          break;
        }
        if (ch === "&") {
          value += substring(start, pos());
          value += yield* scanEntityReference();
          value = yield* flushTextDelta(value);
          start = pos();
          retainFrom(start);
          continue;
        }
        yield* advance(false);
        if (shouldEmitTextDelta()) {
          value += substring(start, pos());
          value = yield* flushTextDelta(value);
          start = pos();
          retainFrom(start);
        }
      }

      value += substring(start, pos());
      retainFrom(pos());
      yield* emitTextToken(value);
    }

    function* scanRawTextUntilClosingTag(tagName: string): ScanGenerator {
      let value = "";
      let candidate = "";
      let matchedNameChars = 0;
      let state: "text" | "afterOpen" | "afterSlash" | "afterName" = "text";

      while (true) {
        const ch = currentChar();
        if (ch === null) {
          value += candidate;
          rawTagName = null;
          yield* emitTextToken(value);
          return;
        }

        switch (state) {
          case "text": {
            if (ch === "<") {
              candidate = "<";
              state = "afterOpen";
              yield* advance();
              value = yield* flushTextDelta(value);
              continue;
            }
            value += ch;
            yield* advance();
            value = yield* flushTextDelta(value);
            continue;
          }
          case "afterOpen": {
            if (ch === "/") {
              candidate += "/";
              matchedNameChars = 0;
              state = "afterSlash";
              yield* advance();
              value = yield* flushTextDelta(value);
              continue;
            }
            value += candidate;
            candidate = "";
            state = "text";
            continue;
          }
          case "afterSlash": {
            if (matchedNameChars < tagName.length) {
              if (ch === tagName[matchedNameChars]) {
                candidate += ch;
                matchedNameChars++;
                yield* advance();
                value = yield* flushTextDelta(value);
                if (matchedNameChars === tagName.length) {
                  state = "afterName";
                }
                continue;
              }

              value += candidate;
              candidate = "";
              matchedNameChars = 0;
              state = "text";
              continue;
            }
            state = "afterName";
            continue;
          }
          case "afterName": {
            if (isWhitespace(ch)) {
              candidate += ch;
              yield* advance();
              value = yield* flushTextDelta(value);
              continue;
            }
            if (ch === ">") {
              yield* advance();
              rawTagName = null;
              yield* emitTextToken(value);
              yield { token: SyntaxKind.EndTagOpenToken };
              yield { token: SyntaxKind.Name, value: tagName };
              yield { token: SyntaxKind.TagCloseToken };
              return;
            }

            value += candidate;
            candidate = "";
            matchedNameChars = 0;
            state = "text";
            continue;
          }
        }
      }
    }

    function* scanComment(): ScanGenerator {
      let value = "";
      let dashCount = 0;

      while (true) {
        const ch = currentChar();
        if (ch === null) {
          yield { error: ScanError.UnterminatedComment };
          break;
        }
        if (ch === ">" && dashCount >= 2) {
          yield* advance();
          value = value.slice(0, -2);
          break;
        }

        value += ch;
        dashCount = ch === "-" ? Math.min(dashCount + 1, 2) : 0;
        yield* advance();
      }

      yield {
        token: SyntaxKind.Comment,
        value,
      };
    }

    function* scanCData(): ScanGenerator {
      let value = "";
      let rightBracketCount = 0;

      while (true) {
        const ch = currentChar();
        if (ch === null) {
          yield { error: ScanError.UnterminatedCData };
          break;
        }
        if (ch === ">" && rightBracketCount >= 2) {
          yield* advance();
          value = value.slice(0, -2);
          break;
        }

        value += ch;
        rightBracketCount = ch === "]" ? Math.min(rightBracketCount + 1, 2) : 0;
        yield* advance();
      }

      yield {
        token: SyntaxKind.CData,
        value,
      };
    }

    function* scanProcessingInstruction(target: string): ScanGenerator {
      while (isWhitespace(currentChar())) {
        yield* advance();
      }

      let data = "";
      while (true) {
        const ch = currentChar();
        if (ch === null) {
          yield { error: ScanError.UnterminatedProcessingInstruction };
          break;
        }
        if (ch === "?") {
          yield* advance();
          if (currentChar() === ">") {
            yield* advance();
            break;
          }
          data += "?";
          continue;
        }
        data += ch;
        yield* advance();
      }

      yield {
        token: SyntaxKind.ProcessingInstruction,
        target,
        data,
      };
    }

    function* consumeExact(value: string): ScanGenerator<boolean> {
      for (const expected of value) {
        const ch = currentChar();
        if (ch === null) {
          yield { error: ScanError.UnexpectedEndOfInput };
          return false;
        }
        if (ch !== expected) {
          return false;
        }
        yield* advance();
      }
      return true;
    }

    function* scanMarkup(): ScanGenerator {
      yield* advance();
      const ch = currentChar();

      if (ch === null) {
        yield { error: ScanError.UnexpectedEndOfInput };
        return;
      }

      if (ch === "/") {
        yield* advance();
        tagMode = TagMode.Element;
        currentTagIsEnd = true;
        currentTagName = null;
        currentTagIsForeign = false;
        yield { token: SyntaxKind.EndTagOpenToken };
        return;
      }

      if (ch === "!") {
        yield* advance();
        if (currentChar() === "-") {
          yield* advance();
          if (currentChar() === "-") {
            yield* advance();
            yield* scanComment();
            return;
          }
          yield { error: ScanError.InvalidToken };
          return;
        }

        if (currentChar() === "[") {
          yield* advance();
          const matched = yield* consumeExact("CDATA[");
          if (!matched) {
            yield { error: ScanError.InvalidToken };
            return;
          }
          yield* scanCData();
          return;
        }

        yield { error: ScanError.InvalidToken };
        return;
      }

      if (ch === "?") {
        yield* advance();
        if (currentChar() === null) {
          yield { error: ScanError.UnterminatedProcessingInstruction };
          return;
        }

        const target = yield* readName();
        if (target.length === 0) {
          return;
        }

        const afterTarget = currentChar();
        if (
          target === "xml" &&
          (afterTarget === null ||
            isWhitespace(afterTarget) ||
            afterTarget === "?")
        ) {
          tagMode = TagMode.XmlDeclaration;
          resetCurrentTag();
          yield { token: SyntaxKind.XmlDeclarationOpenToken };
          return;
        }

        yield* scanProcessingInstruction(target);
        return;
      }

      if (isNameStartChar(ch)) {
        tagMode = TagMode.Element;
        currentTagIsEnd = false;
        currentTagName = null;
        currentTagIsForeign = false;
        yield { token: SyntaxKind.StartTagOpenToken };
        return;
      }

      yield { error: ScanError.InvalidName };
    }

    function* scanTagToken(): ScanGenerator {
      yield* skipWhitespace();
      const ch = currentChar();

      if (ch === null) {
        yield { error: ScanError.UnexpectedEndOfInput };
        return;
      }

      if (tagMode === TagMode.XmlDeclaration && ch === "?") {
        yield* advance();
        if (currentChar() === ">") {
          yield* advance();
          tagMode = TagMode.None;
          yield { token: SyntaxKind.TagCloseToken };
          return;
        }
        yield { error: ScanError.InvalidToken };
        return;
      }

      if (tagMode === TagMode.Element && ch === ">") {
        const enterRawMode =
          !currentTagIsEnd && currentTagIsForeign && currentTagName !== null;
        const tagName = currentTagName;
        yield* advance();
        tagMode = TagMode.None;
        resetCurrentTag();
        yield { token: SyntaxKind.TagCloseToken };
        if (enterRawMode && tagName !== null) {
          rawTagName = tagName;
        }
        return;
      }

      if (tagMode === TagMode.Element && ch === "/") {
        yield* advance();
        if (currentChar() === ">") {
          yield* advance();
          tagMode = TagMode.None;
          resetCurrentTag();
          yield { token: SyntaxKind.EmptyElementCloseToken };
          return;
        }
        yield { error: ScanError.InvalidToken };
        return;
      }

      if (ch === "=") {
        yield* advance();
        yield { token: SyntaxKind.EqualsToken };
        return;
      }

      if (ch === '"' || ch === "'") {
        yield* scanQuotedString();
        return;
      }

      if (isNameStartChar(ch)) {
        yield* emitNameToken();
        return;
      }

      yield { error: ScanError.InvalidToken };
      yield* advance();
    }

    while (true) {
      if (rawTagName !== null) {
        yield* scanRawTextUntilClosingTag(rawTagName);
        continue;
      }

      const ch = currentChar();
      if (ch === null) {
        if (tagMode !== TagMode.None) {
          yield { error: ScanError.UnexpectedEndOfInput };
        }
        return;
      }

      if (tagMode === TagMode.None) {
        if (ch === "<") {
          yield* scanMarkup();
        } else {
          yield* scanText();
        }
      } else {
        yield* scanTagToken();
      }
    }
  });
}

function isWhitespace(ch: string | null): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isNameStartChar(ch: string): boolean {
  const codePoint = ch.codePointAt(0)!;
  return (
    ch === ":" ||
    ch === "_" ||
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a) ||
    codePoint >= 0x80
  );
}

function isNameChar(ch: string): boolean {
  const codePoint = ch.codePointAt(0)!;
  return (
    isNameStartChar(ch) ||
    ch === "-" ||
    ch === "." ||
    (codePoint >= 0x30 && codePoint <= 0x39)
  );
}

function isEntityBodyChar(ch: string): boolean {
  const codePoint = ch.codePointAt(0)!;
  return (
    ch === "#" ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a)
  );
}
