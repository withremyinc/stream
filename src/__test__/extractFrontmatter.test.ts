import { describe, expect, test } from "vitest";

import {
  arrayStream,
  collect,
  extractFrontmatter,
  jsonToJSObject,
  parseJSON,
  takeLast,
  type FrontmatterExtractOutput,
} from "../index";

function events(chunks: string[]): Promise<FrontmatterExtractOutput[]> {
  return collect(arrayStream(chunks).pipeThrough(extractFrontmatter()));
}

describe("extractFrontmatter", () => {
  test("emits the header then body deltas", async () => {
    expect(await events(["---\nbehav", "ior: reply\n---\nHel", "lo"])).toEqual([
      { type: "onFrontmatter", raw: "behavior: reply" },
      { type: "onBody", value: "Hel" },
      { type: "onBody", value: "lo" },
    ]);
  });

  test("emits the header before the whole input is consumed", async () => {
    // The stream never closes, so anything emitted came from the header alone.
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("---\nbehavior: reply\n---\nbody text");
      },
    });

    const reader = source.pipeThrough(extractFrontmatter()).getReader();

    expect((await reader.read()).value).toEqual({
      type: "onFrontmatter",
      raw: "behavior: reply",
    });
    expect((await reader.read()).value).toEqual({
      type: "onBody",
      value: "body text",
    });
  });

  test("delimiters may span arbitrary chunk boundaries", async () => {
    const source = "---\nbehavior: reply\noffer: none\n---\nbody";
    expect(await events(source.split(""))).toEqual([
      {
        type: "onFrontmatter",
        raw: "behavior: reply\noffer: none",
      },
      ...[..."body"].map((value) => ({ type: "onBody", value })),
    ]);
  });

  test("a closing delimiter at end of input needs no trailing newline", async () => {
    expect(await events(["---\nbehavior: acknowledge\noffer: none\n---"])).toEqual([
      {
        type: "onFrontmatter",
        raw: "behavior: acknowledge\noffer: none",
      },
    ]);
  });

  test("a closing delimiter at end of input may be split across chunks", async () => {
    expect(await events(["---\nbehavior: acknowledge\n-", "-", "-  "])).toEqual([
      {
        type: "onFrontmatter",
        raw: "behavior: acknowledge",
      },
    ]);
  });

  test("empty headers and empty bodies are valid", async () => {
    expect(await events(["---\n---\n"])).toEqual([
      { type: "onFrontmatter", raw: "" },
    ]);
    expect(await events(["---\nbehavior: reply\n---\n"])).toEqual([
      { type: "onFrontmatter", raw: "behavior: reply" },
    ]);
  });

  test("CRLF input works and line endings are preserved verbatim", async () => {
    expect(
      await events(["---\r\nbehavior: reply\r\noffer: none\r\n---\r\nline\r\nnext"]),
    ).toEqual([
      {
        type: "onFrontmatter",
        // Interior line endings are untouched; only the one before the closing
        // delimiter is removed.
        raw: "behavior: reply\r\noffer: none",
      },
      { type: "onBody", value: "line\r\nnext" },
    ]);
  });

  test("leading whitespace before the opening delimiter is ignored", async () => {
    expect(await events(["\n\n  ", "---\nbehavior: reply\n---\nbody"])).toEqual([
      { type: "onFrontmatter", raw: "behavior: reply" },
      { type: "onBody", value: "body" },
    ]);
  });

  test("trailing whitespace on delimiter lines is allowed", async () => {
    expect(await events(["--- \t\nbehavior: reply\n---  \nbody"])).toEqual([
      { type: "onFrontmatter", raw: "behavior: reply" },
      { type: "onBody", value: "body" },
    ]);
  });

  test("delimiter-like text in the body is passed through unchanged", async () => {
    expect(await events(["---\nbehavior: reply\n---\nbefore\n---\nafter"])).toEqual([
      { type: "onFrontmatter", raw: "behavior: reply" },
      { type: "onBody", value: "before\n---\nafter" },
    ]);
  });

  test("a custom delimiter is honored", async () => {
    const result = await collect(
      arrayStream(["+++\ntitle: hi\n+++\nbody"]).pipeThrough(
        extractFrontmatter({ delimiter: "+++" }),
      ),
    );

    expect(result).toEqual([
      { type: "onFrontmatter", raw: "title: hi" },
      { type: "onBody", value: "body" },
    ]);
  });

  test("multi-line headers keep their interior line endings", async () => {
    const result = await collect(
      arrayStream(["---\na: 1\nb: 2\n---\n"]).pipeThrough(extractFrontmatter()),
    );

    expect(result).toEqual([{ type: "onFrontmatter", raw: "a: 1\nb: 2" }]);
  });

  test("throws when the opening delimiter is missing", async () => {
    await expect(events(["hello\n---\nbehavior: reply\n---\n"])).rejects.toThrow(
      /expected frontmatter to open/,
    );
  });

  test("throws on an empty stream", async () => {
    await expect(events([])).rejects.toThrow(/expected frontmatter to open/);
  });

  test("throws when the header never closes", async () => {
    await expect(events(["---\nbehavior: reply\n"])).rejects.toThrow(
      /ended before the frontmatter/,
    );
    await expect(events(["---"])).rejects.toThrow(/ended before the frontmatter/);
    await expect(events(["---\nbehavior: rep"])).rejects.toThrow(
      /ended before the frontmatter/,
    );
  });

  test("throws once the header exceeds maxHeaderChars", async () => {
    const long = "x".repeat(200);
    await expect(
      collect(
        arrayStream([`---\n${long}\n---\n`]).pipeThrough(
          extractFrontmatter({ maxHeaderChars: 64 }),
        ),
      ),
    ).rejects.toThrow(/maxHeaderChars/);
  });

  test("body size is not capped by maxHeaderChars", async () => {
    const body = "x".repeat(500);
    const result = await collect(
      arrayStream([`---\na: 1\n---\n${body}`]).pipeThrough(
        extractFrontmatter({ maxHeaderChars: 64 }),
      ),
    );

    expect(result).toEqual([
      { type: "onFrontmatter", raw: "a: 1" },
      { type: "onBody", value: body },
    ]);
  });

  test("the raw header is parsed by the caller, at the point of consumption", async () => {
    const reader = arrayStream(["---\nbehavior: reply\noffer: none\n---\nbody"])
      .pipeThrough(extractFrontmatter())
      .getReader();

    let meta: Record<string, string> | undefined;
    let body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "onFrontmatter") {
        meta = Object.fromEntries(
          value.raw
            .split(/\r?\n/)
            .map((line) => line.split(":", 2).map((part) => part.trim())),
        );
      } else {
        body += value.value;
      }
    }

    expect(meta).toEqual({ behavior: "reply", offer: "none" });
    expect(body).toBe("body");
  });

  test("rejects invalid options", () => {
    expect(() => extractFrontmatter({ delimiter: "" })).toThrow(RangeError);
    expect(() => extractFrontmatter({ delimiter: "--\n-" })).toThrow(RangeError);
    expect(() => extractFrontmatter({ delimiter: " --- " })).toThrow(RangeError);
    expect(() => extractFrontmatter({ maxHeaderChars: 0 })).toThrow(RangeError);
  });

  test("applies backpressure while the consumer is not reading", async () => {
    const transform = extractFrontmatter();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    // This chunk produces two events; with nothing reading, the write stays
    // pending rather than buffering the whole body.
    let written = false;
    const pending = writer.write("---\na: 1\n---\nbody").then(() => {
      written = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(written).toBe(false);
    expect(writer.desiredSize).toBeLessThanOrEqual(0);

    expect((await reader.read()).value).toEqual({
      type: "onFrontmatter",
      raw: "a: 1",
    });

    // Draining releases the producer.
    await pending;
    expect((await reader.read()).value).toEqual({ type: "onBody", value: "body" });
  });

  test("body chunks stream into parseJSON", async () => {
    const bodies = arrayStream(["---\nkind: json\n---\n{\"a\":", "[1,2]}"])
      .pipeThrough(extractFrontmatter())
      .pipeThrough(
        new TransformStream<FrontmatterExtractOutput, string>({
          transform(chunk, controller) {
            if (chunk.type === "onBody") controller.enqueue(chunk.value);
          },
        }),
      );

    const [value] = await collect(
      bodies
        .pipeThrough(parseJSON())
        .pipeThrough(jsonToJSObject())
        .pipeThrough(takeLast(1)),
    );

    expect(value).toEqual({ a: [1, 2] });
  });
});
