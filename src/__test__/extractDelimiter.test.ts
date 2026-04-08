import { describe, expect, test } from "vitest";

import {
  arrayStream,
  collect,
  collectToString,
  extractDelimiter,
  extractXML,
  jsonToJSObject,
  parseJSON,
} from "../index";

describe("extractDelimiter", () => {
  test("extracts the first matching fenced block body", async () => {
    const result = await collectToString(
      arrayStream([
        "before\n```markdown\n# hello\nworld\n```\nafter",
      ]).pipeThrough(extractDelimiter({ allowLanguages: ["markdown"] })),
    );

    expect(result).toBe("# hello\nworld\n");
  });

  test("skips non-matching fenced blocks before a match", async () => {
    const result = await collectToString(
      arrayStream([
        "```markdown\n# ignore me\n```\n",
        "```json\n{\"ok\":true}\n```",
      ]).pipeThrough(extractDelimiter({ allowLanguages: ["json"] })),
    );

    expect(result).toBe('{"ok":true}\n');
  });

  test("handles opening and closing fences across chunk boundaries", async () => {
    const result = await collectToString(
      arrayStream([
        "before\n``",
        "`mark",
        "down\nhe",
        "llo\n``",
        "`\nafter",
      ]).pipeThrough(extractDelimiter({ allowLanguages: ["markdown"] })),
    );

    expect(result).toBe("hello\n");
  });

  test("emits captured text incrementally across chunks", async () => {
    const chunks = await collect(
      arrayStream([
        "```json\n{\"a\":",
        "1,\"b\":2",
        "}\n```",
      ]).pipeThrough(extractDelimiter({ allowLanguages: ["json"] })),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe('{"a":1,"b":2}\n');
  });

  test("emits the captured body if eof arrives before the closing fence", async () => {
    const result = await collectToString(
      arrayStream(["```markdown\nhello\nworld"]).pipeThrough(
        extractDelimiter({ allowLanguages: ["markdown"] }),
      ),
    );

    expect(result).toBe("hello\nworld");
  });

  test("chains cleanly into parseJSON", async () => {
    const values = await collect(
      arrayStream([
        "preface\n```json\n{\"a\":1,",
        '\"b\":[true,false]}\n```\ntrailing prose',
      ])
        .pipeThrough(extractDelimiter({ allowLanguages: ["json"] }))
        .pipeThrough(parseJSON())
        .pipeThrough(jsonToJSObject()),
    );

    expect(values).toEqual([{ a: 1, b: [true, false] }]);
  });

  test("works with native tee and extractXML on one branch", async () => {
    const extracted = arrayStream([
      "before\n```markdown\nhello <instructions>use ",
      "<tool>bash</tool></instructions>\nworld\n```\nafter",
    ]).pipeThrough(extractDelimiter({ allowLanguages: ["markdown"] }));

    const [left, right] = extracted.tee();

    const [body, xmlEvents] = await Promise.all([
      collectToString(left),
      collect(right.pipeThrough(extractXML({ allowTags: ["instructions"] }))),
    ]);

    expect(body).toBe(
      "hello <instructions>use <tool>bash</tool></instructions>\nworld\n",
    );
    expect(xmlEvents).toEqual([
      {
        type: "onElementBegin",
        name: "instructions",
        attributes: [],
      },
      { type: "onText", value: "use <tool>bash</tool>" },
      { type: "onElementEnd", name: "instructions" },
    ]);
  });
});
