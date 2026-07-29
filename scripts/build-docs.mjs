/**
 * Build script: generates docs/index.html from API metadata.
 * Run via: node scripts/build-docs.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { createHighlighter } from "shiki";

const highlighter = await createHighlighter({
  themes: ["github-light"],
  langs: ["typescript"],
});

function highlight(code, lang = "typescript") {
  return highlighter.codeToHtml(code, { lang, theme: "github-light" });
}

// Wraps occurrences of known type names in shiki-rendered HTML with anchor links
// pointing at their #type-Foo entries in the sidebar. Operates on text nodes only
// (the segment between `>` and `<`), so it won't disturb tag attributes.
function linkifyTypes(html, linkableTypes) {
  return html.replace(/>([^<>]+)</g, (_match, text) => {
    const replaced = text.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
      if (linkableTypes.has(name)) {
        return `<a class="type-link" href="#type-${name}">${name}</a>`;
      }
      return name;
    });
    return `>${replaced}<`;
  });
}

// ─── API Definitions ────────────────────────────────────────────────────────

const categories = [
  {
    id: "sources",
    title: "Sources",
    subtitle: "Create ReadableStreams from data",
    apis: [
      {
        name: "arrayStream",
        signature: "arrayStream<T>(array: T[]): ReadableStream<T>",
        description: "Create a ReadableStream from an array of items.",
        marble: {
          type: "source",
          output: [
            { value: "1", color: "orange", x: 15 },
            { value: "2", color: "blue", x: 40 },
            { value: "3", color: "green", x: 65 },
          ],
        },
        example: `import { arrayStream, collect } from "@withremyinc/stream";

const stream = arrayStream([1, 2, 3]);
const result = await collect(stream);
// [1, 2, 3]`,
      },
    ],
  },
  {
    id: "transforms",
    title: "Transforms",
    subtitle: "TransformStreams that process chunks",
    apis: [
      {
        name: "map",
        signature:
          "map<T, U>(mapper: (chunk: T, index: number) => U | Promise<U>): TransformStream<T, U>",
        description:
          "Applies a synchronous or asynchronous mapper to each chunk.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "2", color: "blue", x: 40 },
            { value: "3", color: "orange", x: 65 },
          ],
          label: "map(x => x * 10)",
          output: [
            { value: "10", color: "orange", x: 15 },
            { value: "20", color: "blue", x: 40 },
            { value: "30", color: "orange", x: 65 },
          ],
        },
        example: `import { arrayStream, collect, map } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2, 3]).pipeThrough(map(x => x * 10))
);
// [10, 20, 30]`,
      },
      {
        name: "filter",
        signature:
          "filter<T>(predicate: (chunk: T, index: number) => boolean | Promise<boolean>): TransformStream<T, T>",
        description:
          "Filters chunks based on a synchronous or asynchronous predicate.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 10 },
            { value: "2", color: "blue", x: 30 },
            { value: "3", color: "orange", x: 50 },
            { value: "4", color: "green", x: 70 },
          ],
          label: "filter(x => x % 2 === 0)",
          output: [
            { value: "2", color: "blue", x: 30 },
            { value: "4", color: "green", x: 70 },
          ],
        },
        example: `import { arrayStream, collect, filter } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2, 3, 4]).pipeThrough(filter(x => x % 2 === 0))
);
// [2, 4]`,
      },
      {
        name: "filterMap",
        signature:
          "filterMap<T, U>(mapper: (chunk: T, index: number) => U | null | undefined | Promise<U | null | undefined>): TransformStream<T, NonNullable<U>>",
        description:
          "Maps each chunk to a value and drops only nullish results.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 10 },
            { value: "2", color: "blue", x: 30 },
            { value: "3", color: "orange", x: 50 },
            { value: "4", color: "green", x: 70 },
          ],
          label: "filterMap(x => x > 2 ? x * 10 : null)",
          output: [
            { value: "30", color: "orange", x: 50 },
            { value: "40", color: "green", x: 70 },
          ],
        },
        example: `import { arrayStream, collect, filterMap } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2, 3, 4]).pipeThrough(filterMap(x => x > 2 ? x * 10 : null))
);
// [30, 40]`,
      },
      {
        name: "flatMap",
        signature:
          "flatMap<T, U>(mapper: (chunk: T, index: number) => Iterable<U> | AsyncIterable<U> | U | Promise<…>): TransformStream<T, U>",
        description: "Maps each chunk to an (async) iterable then flattens.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "2", color: "blue", x: 55 },
          ],
          label: "flatMap(x => [x, x * 10])",
          output: [
            { value: "1", color: "orange", x: 10 },
            { value: "10", color: "orange", x: 30 },
            { value: "2", color: "blue", x: 50 },
            { value: "20", color: "blue", x: 70 },
          ],
        },
        example: `import { arrayStream, collect, flatMap } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2]).pipeThrough(flatMap(x => [x, x * 10]))
);
// [1, 10, 2, 20]`,
      },
      {
        name: "scan",
        signature:
          "scan<T, U>(reducer: (acc: U, chunk: T, index: number) => U | Promise<U>, initialValue: U): TransformStream<T, U>",
        description:
          "Accumulates chunks and emits each intermediate accumulator value (rolling reduce).",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "3", color: "blue", x: 45 },
            { value: "5", color: "orange", x: 75 },
          ],
          label: "scan((acc, curr) => acc + curr, 0)",
          output: [
            { value: "1", color: "orange", x: 15 },
            { value: "4", color: "green", x: 45 },
            { value: "9", color: "orange", x: 75 },
          ],
        },
        example: `import { arrayStream, collect, scan } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 3, 5]).pipeThrough(scan((acc, x) => acc + x, 0))
);
// [1, 4, 9]`,
      },
      {
        name: "reduce",
        signature:
          "reduce<T, U>(reducer: (acc: U, chunk: T, index: number) => U | Promise<U>, initialValue: U): TransformStream<T, U>",
        description:
          "Accumulates chunks into a single result, emitting it on completion.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "3", color: "blue", x: 45 },
            { value: "5", color: "orange", x: 75 },
          ],
          label: "reduce((acc, curr) => acc + curr, 0)",
          output: [{ value: "9", color: "green", x: 75, flush: true }],
        },
        example: `import { arrayStream, collectFirst, reduce } from "@withremyinc/stream";

const result = await collectFirst(
  arrayStream([1, 3, 5]).pipeThrough(reduce((acc, x) => acc + x, 0))
);
// 9`,
      },
      {
        name: "take",
        signature: "take<T>(limit?: number): TransformStream<T, T>",
        description: "Emits up to limit chunks then closes the stream.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 10 },
            { value: "2", color: "blue", x: 30 },
            { value: "3", color: "orange", x: 50 },
            { value: "4", color: "green", x: 70 },
          ],
          label: "take(2)",
          output: [
            { value: "1", color: "orange", x: 10 },
            { value: "2", color: "blue", x: 30 },
          ],
          earlyClose: true,
        },
        example: `import { arrayStream, collect, take } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2, 3, 4]).pipeThrough(take(2))
);
// [1, 2]`,
      },
      {
        name: "takeLast",
        signature: "takeLast<T>(count?: number): TransformStream<T, T>",
        description:
          "Buffers the last count chunks and emits them on completion.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 10 },
            { value: "2", color: "blue", x: 30 },
            { value: "3", color: "orange", x: 50 },
            { value: "4", color: "green", x: 70 },
          ],
          label: "takeLast(2)",
          output: [
            { value: "3", color: "orange", x: 50, flush: true },
            { value: "4", color: "green", x: 70, flush: true },
          ],
        },
        example: `import { arrayStream, collect, takeLast } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2, 3, 4]).pipeThrough(takeLast(2))
);
// [3, 4]`,
      },
      {
        name: "drop",
        signature: "drop<T>(limit: number): TransformStream<T, T>",
        description: "Skips the first limit chunks, then emits the rest.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 10 },
            { value: "2", color: "blue", x: 30 },
            { value: "3", color: "orange", x: 50 },
            { value: "4", color: "green", x: 70 },
          ],
          label: "drop(2)",
          output: [
            { value: "3", color: "orange", x: 50 },
            { value: "4", color: "green", x: 70 },
          ],
        },
        example: `import { arrayStream, collect, drop } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2, 3, 4]).pipeThrough(drop(2))
);
// [3, 4]`,
      },
      {
        name: "forEach",
        signature:
          "forEach<T>(fn: (chunk: T, index: number) => void | Promise<void>): TransformStream<T, T>",
        description:
          "Executes a side-effect function for each chunk, re-emitting the chunk unchanged.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "2", color: "blue", x: 45 },
            { value: "3", color: "orange", x: 75 },
          ],
          label: "forEach(x => console.log(x))",
          output: [
            { value: "1", color: "orange", x: 15 },
            { value: "2", color: "blue", x: 45 },
            { value: "3", color: "orange", x: 75 },
          ],
        },
        example: `import { arrayStream, collect, forEach } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2, 3]).pipeThrough(forEach(x => console.log(x)))
);
// logs: 1, 2, 3  →  result: [1, 2, 3]`,
      },
      {
        name: "some",
        signature:
          "some<T>(predicate: (chunk: T, index: number) => boolean | Promise<boolean>): TransformStream<T, boolean>",
        description:
          "Emits true if any chunk satisfies predicate, else false.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "4", color: "green", x: 45 },
            { value: "2", color: "blue", x: 75 },
          ],
          label: "some(x => x > 3)",
          output: [{ value: "true", color: "green", x: 45 }],
          earlyClose: true,
        },
        example: `import { arrayStream, collectFirst, some } from "@withremyinc/stream";

const result = await collectFirst(
  arrayStream([1, 4, 2]).pipeThrough(some(x => x > 3))
);
// true`,
      },
      {
        name: "every",
        signature:
          "every<T>(predicate: (chunk: T, index: number) => boolean | Promise<boolean>): TransformStream<T, boolean>",
        description:
          "Emits false if any chunk fails predicate, else true.",
        marble: {
          type: "transform",
          input: [
            { value: "2", color: "blue", x: 15 },
            { value: "4", color: "green", x: 45 },
            { value: "1", color: "orange", x: 75 },
          ],
          label: "every(x => x > 1)",
          output: [{ value: "false", color: "red", x: 75 }],
        },
        example: `import { arrayStream, collectFirst, every } from "@withremyinc/stream";

const result = await collectFirst(
  arrayStream([2, 4, 1]).pipeThrough(every(x => x > 1))
);
// false`,
      },
      {
        name: "find",
        signature:
          "find<T>(predicate: (chunk: T, index: number) => boolean | Promise<boolean>): TransformStream<T, T | undefined>",
        description:
          "Finds the first chunk satisfying a predicate, emits it or undefined.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "4", color: "green", x: 45 },
            { value: "2", color: "blue", x: 75 },
          ],
          label: "find(x => x > 3)",
          output: [{ value: "4", color: "green", x: 45 }],
          earlyClose: true,
        },
        example: `import { arrayStream, collectFirst, find } from "@withremyinc/stream";

const result = await collectFirst(
  arrayStream([1, 4, 2]).pipeThrough(find(x => x > 3))
);
// 4`,
      },
      {
        name: "toArray",
        signature: "toArray<T>(): TransformStream<T, T[]>",
        description:
          "Collects all chunks into an array and emits it on completion.",
        marble: {
          type: "transform",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "2", color: "blue", x: 45 },
            { value: "3", color: "orange", x: 75 },
          ],
          label: "toArray()",
          output: [{ value: "[1,2,3]", color: "green", x: 75, flush: true }],
        },
        example: `import { arrayStream, collectFirst, toArray } from "@withremyinc/stream";

const result = await collectFirst(
  arrayStream([1, 2, 3]).pipeThrough(toArray())
);
// [1, 2, 3]`,
      },
      {
        name: "toString",
        signature: "toString(): TransformStream<string, string>",
        description:
          "Concatenates string chunks into one string, emits on completion.",
        marble: {
          type: "transform",
          input: [
            { value: "he", color: "orange", x: 10 },
            { value: "ll", color: "blue", x: 40 },
            { value: "o", color: "orange", x: 70 },
          ],
          label: "toString()",
          output: [
            { value: "hello", color: "green", x: 70, flush: true },
          ],
        },
        example: `import { arrayStream, collectFirst, toString } from "@withremyinc/stream";

const result = await collectFirst(
  arrayStream(["he", "ll", "o"]).pipeThrough(toString())
);
// "hello"`,
      },
      {
        name: "extractDelimiter",
        signature:
          "extractDelimiter(options?: ExtractDelimiterOptions): TransformStream<string, string>",
        description:
          "Extracts the body of the first matching fenced block (e.g. markdown code fences) as a string stream. Opening and closing fence lines are removed.",
        marble: {
          type: "transform",
          input: [
            { value: "```", color: "muted", x: 8 },
            { value: "{…}", color: "blue", x: 35 },
            { value: "```", color: "muted", x: 62 },
          ],
          label: "extractDelimiter()",
          output: [{ value: "{…}", color: "blue", x: 35 }],
        },
        example: `import { arrayStream, collectToString, extractDelimiter } from "@withremyinc/stream";

const md = \`Here is some JSON:
\\\`\\\`\\\`json
{"name": "stream"}
\\\`\\\`\\\`
\`;
const result = await collectToString(
  arrayStream([md]).pipeThrough(extractDelimiter({ allowLanguages: ["json"] }))
);
// '{"name": "stream"}\\n'`,
      },
      {
        name: "extractFrontmatter",
        signature:
          "extractFrontmatter(options?: ExtractFrontmatterOptions): TransformStream<string, FrontmatterExtractOutput>",
        description:
          "Splits a Markdown-style frontmatter header from the body that follows it. Emits onFrontmatter as soon as the closing delimiter line is complete, then forwards body text as onBody deltas without buffering the whole body. Delimiters are recognized only as complete lines and may be split across any number of chunks; end of input counts as a line boundary, so a closing delimiter in the final bytes needs no trailing newline. The header arrives as raw text — parse it however you like, so no YAML dependency is implied.",
        marble: {
          type: "parser",
          input: [
            { value: "---", color: "muted", x: 5 },
            { value: "k: v", color: "blue", x: 28 },
            { value: "---", color: "muted", x: 51 },
            { value: "hi", color: "green", x: 74 },
          ],
          label: "extractFrontmatter()",
          events: ['onFrontmatter "k: v"', 'onBody "hi"'],
        },
        example: `import { arrayStream, collect, extractFrontmatter } from "@withremyinc/stream";

const events = await collect(
  arrayStream(["---\\nbehav", "ior: reply\\n---\\nHel", "lo"]).pipeThrough(
    extractFrontmatter()
  )
);
// [
//   { type: "onFrontmatter", raw: "behavior: reply" },
//   { type: "onBody", value: "Hel" },
//   { type: "onBody", value: "lo" },
// ]

// Parse the header however you like:
for (const event of events) {
  if (event.type === "onFrontmatter") meta = YAML.parse(event.raw);
}`,
      },
      {
        name: "tee",
        signature:
          "tee<T0, T1>(callback: (branch1: ReadableStream<T0>, branch2: ReadableStream<T0>) => ReadableStream<T1>): TransformStream<T0, T1>",
        description:
          "Duplicates the stream into two branches, processes them with a callback, and emits the results.",
        marble: {
          type: "tee",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "2", color: "blue", x: 45 },
            { value: "3", color: "orange", x: 75 },
          ],
          label: "tee((a, b) => merge([a, b]))",
          output: [
            { value: "1", color: "orange", x: 10 },
            { value: "1", color: "orange", x: 25 },
            { value: "2", color: "blue", x: 40 },
            { value: "2", color: "blue", x: 55 },
            { value: "3", color: "orange", x: 70 },
            { value: "3", color: "orange", x: 85 },
          ],
        },
        example: `import { arrayStream, collect, tee, merge } from "@withremyinc/stream";

const result = await collect(
  arrayStream([1, 2, 3]).pipeThrough(
    tee((a, b) => merge([a, b]))
  )
);
// [1, 1, 2, 2, 3, 3] (order may vary)`,
      },
    ],
  },
  {
    id: "combinators",
    title: "Combinators",
    subtitle: "Merge and compose streams",
    apis: [
      {
        name: "merge",
        signature:
          "merge<T>(streams: ReadableStream<T>[]): ReadableStream<T>",
        description:
          "Merges multiple ReadableStreams into a single stream of chunks as they arrive.",
        marble: {
          type: "merge",
          inputs: [
            [
              { value: "a", color: "orange", x: 10 },
              { value: "b", color: "orange", x: 50 },
            ],
            [
              { value: "1", color: "blue", x: 25 },
              { value: "2", color: "blue", x: 70 },
            ],
          ],
          output: [
            { value: "a", color: "orange", x: 10 },
            { value: "1", color: "blue", x: 25 },
            { value: "b", color: "orange", x: 50 },
            { value: "2", color: "blue", x: 70 },
          ],
        },
        example: `import { arrayStream, collect, merge } from "@withremyinc/stream";

const result = await collect(
  merge([arrayStream(["a", "b"]), arrayStream(["1", "2"])])
);
// ["a", "b", "1", "2"] (order may vary)`,
      },
      {
        name: "mergeKeyed",
        signature:
          'mergeKeyed<V>(streamsObj: { [K in keyof V]: ReadableStream<V[K]> }): ReadableStream<Partial<V>>',
        description:
          "Merges an object of ReadableStreams into a single stream of keyed chunks.",
        marble: {
          type: "merge",
          inputs: [
            [
              { value: "a:1", color: "orange", x: 10 },
              { value: "a:2", color: "orange", x: 55 },
            ],
            [
              { value: "b:x", color: "blue", x: 30 },
              { value: "b:y", color: "blue", x: 75 },
            ],
          ],
          output: [
            { value: "{a:1}", color: "orange", x: 10 },
            { value: "{b:x}", color: "blue", x: 30 },
            { value: "{a:2}", color: "orange", x: 55 },
            { value: "{b:y}", color: "blue", x: 75 },
          ],
        },
        example: `import { arrayStream, collect, mergeKeyed } from "@withremyinc/stream";

const result = await collect(
  mergeKeyed({
    letters: arrayStream(["a", "b"]),
    numbers: arrayStream([1, 2]),
  })
);
// [{ letters: "a" }, { numbers: 1 }, …]`,
      },
      {
        name: "concat",
        signature:
          "concat<T>(streams: ReadableStream<T>[]): ReadableStream<T>",
        description:
          "Concatenates multiple ReadableStreams into a single stream, in order.",
        marble: {
          type: "merge",
          inputs: [
            [
              { value: "a", color: "orange", x: 10 },
              { value: "b", color: "orange", x: 30 },
            ],
            [
              { value: "1", color: "blue", x: 55 },
              { value: "2", color: "blue", x: 75 },
            ],
          ],
          output: [
            { value: "a", color: "orange", x: 10 },
            { value: "b", color: "orange", x: 30 },
            { value: "1", color: "blue", x: 55 },
            { value: "2", color: "blue", x: 75 },
          ],
        },
        example: `import { arrayStream, collect, concat } from "@withremyinc/stream";

const result = await collect(
  concat([arrayStream(["a", "b"]), arrayStream(["1", "2"])])
);
// ["a", "b", "1", "2"]`,
      },
      {
        name: "pipeThrough",
        signature:
          "pipeThrough<In, Out>(...streams: TransformStream[]): TransformStream<In, Out>",
        description:
          "Compose N TransformStreams into a single TransformStream.",
        marble: {
          type: "transform",
          input: [
            { value: "hi", color: "orange", x: 15 },
            { value: "ok", color: "blue", x: 55 },
          ],
          label: "pipeThrough(upper, bracket)",
          output: [
            { value: "[HI]", color: "orange", x: 15 },
            { value: "[OK]", color: "blue", x: 55 },
          ],
        },
        example: `import { pipeThrough, map } from "@withremyinc/stream";

const upper = map(s => s.toUpperCase());
const bracket = map(s => \`[\${s}]\`);
const composed = pipeThrough(upper, bracket);`,
      },
    ],
  },
  {
    id: "collectors",
    title: "Collectors",
    subtitle: "Consume streams into values",
    apis: [
      {
        name: "collect",
        signature: "collect<T>(stream: ReadableStream<T>): Promise<T[]>",
        description:
          "Consumes a ReadableStream and returns an array of all chunks.",
        marble: {
          type: "collect",
          input: [
            { value: "1", color: "orange", x: 15 },
            { value: "2", color: "blue", x: 45 },
            { value: "3", color: "orange", x: 75 },
          ],
          result: "[1, 2, 3]",
        },
        example: `import { arrayStream, collect } from "@withremyinc/stream";

const result = await collect(arrayStream([1, 2, 3]));
// [1, 2, 3]`,
      },
      {
        name: "collectToString",
        signature:
          "collectToString(stream: ReadableStream<string>): Promise<string>",
        description:
          "Consumes a ReadableStream of strings and concatenates them.",
        marble: {
          type: "collect",
          input: [
            { value: "he", color: "orange", x: 15 },
            { value: "ll", color: "blue", x: 45 },
            { value: "o", color: "orange", x: 75 },
          ],
          result: "hello",
        },
        example: `import { arrayStream, collectToString } from "@withremyinc/stream";

const result = await collectToString(arrayStream(["he", "ll", "o"]));
// "hello"`,
      },
      {
        name: "collectFirst",
        signature:
          "collectFirst<T>(stream: ReadableStream<T>): Promise<T | undefined>",
        description: "Retrieves the first chunk from a ReadableStream.",
        marble: {
          type: "collect",
          input: [
            { value: "1", color: "green", x: 15 },
            { value: "2", color: "muted", x: 45 },
            { value: "3", color: "muted", x: 75 },
          ],
          result: "1",
        },
        example: `import { arrayStream, collectFirst } from "@withremyinc/stream";

const result = await collectFirst(arrayStream([1, 2, 3]));
// 1`,
      },
      {
        name: "collectLast",
        signature:
          "collectLast<T>(stream: ReadableStream<T>): Promise<T | undefined>",
        description: "Retrieves the last chunk from a ReadableStream.",
        marble: {
          type: "collect",
          input: [
            { value: "1", color: "muted", x: 15 },
            { value: "2", color: "muted", x: 45 },
            { value: "3", color: "green", x: 75 },
          ],
          result: "3",
        },
        example: `import { arrayStream, collectLast } from "@withremyinc/stream";

const result = await collectLast(arrayStream([1, 2, 3]));
// 3`,
      },
    ],
  },
  {
    id: "parsers",
    title: "Parsers",
    subtitle: "Streaming JSON & XML parsing",
    apis: [
      {
        name: "parseJSON",
        signature:
          "parseJSON(options?: JSONParserOptions): TransformStream<string, JSONParserOutput>",
        description:
          "Streaming JSON/JSONC parser. Emits SAX-style events (onObjectBegin, onObjectEnd, onArrayBegin, onArrayEnd, onLiteralValue, onObjectProperty, onError) with full JSONPath tracking. Pass `{ emitPartialStrings: true }` to also emit onPartialLiteralValue events for open strings at chunk boundaries (useful for LLM token streams).",
        marble: {
          type: "parser",
          input: [
            { value: "{", color: "orange", x: 5 },
            { value: "na", color: "blue", x: 22 },
            { value: "me", color: "blue", x: 39 },
            { value: ":", color: "muted", x: 52 },
            { value: "s", color: "green", x: 69 },
            { value: "}", color: "orange", x: 86 },
          ],
          label: "parseJSON()",
          events: [
            "onObjectBegin",
            'onObjectProperty "name"',
            'onLiteralValue "s"',
            "onObjectEnd",
          ],
        },
        example: `import { arrayStream, collect, parseJSON } from "@withremyinc/stream";

const events = await collect(
  arrayStream(['{"na', 'me":"', 'stream"}']).pipeThrough(parseJSON())
);
// [
//   { type: "onObjectBegin", path: [] },
//   { type: "onObjectProperty", name: "name", path: [] },
//   { type: "onLiteralValue", value: "stream", path: ["name"] },
//   { type: "onObjectEnd", path: [] },
// ]`,
      },
      {
        name: "jsonToJSObject",
        signature:
          "jsonToJSObject(): TransformStream<JSONParserOutput, any>",
        description:
          "Folds a stream of JSONParserOutput events back into a JavaScript value, emitting the value reconstructed so far every time it changes — including the partial strings from `parseJSON({ emitPartialStrings: true })`. Add `takeLast(1)` for just the completed document. Every emission is the same live accumulator rather than a copy, which is what makes emitting on every event free; copy anything you retain and treat emitted values as read-only.",
        marble: {
          type: "parser",
          input: [
            { value: "{…", color: "orange", x: 5 },
            { value: "prop", color: "blue", x: 28 },
            { value: "val", color: "green", x: 51 },
            { value: "…}", color: "orange", x: 74 },
          ],
          label: "jsonToJSObject()",
          events: ["→ {}", '→ {name: "str"}', '→ {name: "stream"}'],
        },
        example: `import { arrayStream, collect, collectLast, jsonToJSObject, map, parseJSON } from "@withremyinc/stream";

// Every change, as it arrives.
const snapshots = await collect(
  arrayStream(['{"name":"str', 'eam"}'])
    .pipeThrough(parseJSON({ emitPartialStrings: true }))
    .pipeThrough(jsonToJSObject())
    .pipeThrough(map((value) => structuredClone(value)))
);
// [{}, { name: "str" }, { name: "stream" }]

// Just the completed document.
const result = await collectLast(
  arrayStream(['{"name":"stream"}'])
    .pipeThrough(parseJSON())
    .pipeThrough(jsonToJSObject())
);
// { name: "stream" }`,
      },
      {
        name: "parseXML",
        signature:
          "parseXML(options?: XMLParserOptions): TransformStream<string, XMLParserOutput>",
        description:
          "Tolerant streaming XML parser. Emits SAX-style events (onDocumentBegin, onElementBegin, onAttribute, onText, onElementEnd, onComment, onProcessingInstruction, onCDATA, onDocumentEnd, onError).",
        marble: {
          type: "parser",
          input: [
            { value: "<r", color: "orange", x: 5 },
            { value: "oo", color: "orange", x: 22 },
            { value: "t>", color: "orange", x: 39 },
            { value: "hi", color: "green", x: 56 },
            { value: "</", color: "orange", x: 73 },
            { value: ">", color: "orange", x: 90 },
          ],
          label: "parseXML()",
          events: [
            'onElementBegin "root"',
            'onText "hi"',
            'onElementEnd "root"',
          ],
        },
        example: `import { arrayStream, collect, parseXML } from "@withremyinc/stream";

const events = await collect(
  arrayStream(["<root>", "hello", "</root>"]).pipeThrough(parseXML())
);`,
      },
      {
        name: "extractXML",
        signature:
          "extractXML(options: XMLExtractOptions): TransformStream<string, XMLExtractOutput>",
        description:
          "Extracts a flat stream of allowlisted XML tags from mixed text. Nested markup inside allowed tags is surfaced as a single onText payload.",
        marble: {
          type: "parser",
          input: [
            { value: "Hi", color: "muted", x: 5 },
            { value: "<a>", color: "orange", x: 28 },
            { value: "ok", color: "green", x: 51 },
            { value: "</a>", color: "orange", x: 74 },
          ],
          label: 'extractXML({ allowTags: ["a"] })',
          events: [
            'onElementBegin "a"',
            'onText "ok"',
            'onElementEnd "a"',
          ],
        },
        example: `import { arrayStream, collect, extractXML } from "@withremyinc/stream";

const events = await collect(
  arrayStream(["Hello <code>world</code>"])
    .pipeThrough(extractXML({ allowTags: ["code"] }))
);`,
      },
    ],
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

const typeDefinitions = [
  {
    name: "JSONParserOutput",
    definition: `type JSONParserOutput =
  | { type: "onObjectBegin"; path: JSONPath }
  | { type: "onObjectProperty"; name: string | number; path: JSONPath }
  | { type: "onObjectEnd"; path: JSONPath }
  | { type: "onArrayBegin"; path: JSONPath }
  | { type: "onArrayEnd"; path: JSONPath }
  | { type: "onLiteralValue"; value: any; path: JSONPath }
  | { type: "onPartialLiteralValue"; value: string; path: JSONPath }
  | { type: "onError"; error: ParseErrorCode }`,
  },
  {
    name: "JSONParserOptions",
    definition: `type JSONParserOptions = {
  /** Emit onPartialLiteralValue events for unterminated string literals at chunk boundaries. */
  emitPartialStrings?: boolean;
}`,
  },
  {
    name: "JSONPath",
    definition: `type Segment = string | number;
type JSONPath = Segment[];`,
  },
  {
    name: "XMLParserOutput",
    definition: `type XMLParserOutput =
  | { type: "onDocumentBegin" }
  | { type: "onDocumentEnd" }
  | { type: "onElementBegin"; name: string; attributes: XMLAttribute[] }
  | { type: "onElementEnd"; name: string }
  | { type: "onText"; text: string }
  | { type: "onComment"; text: string }
  | { type: "onProcessingInstruction"; name: string; body: string }
  | { type: "onCDATA"; text: string }
  | { type: "onError"; message: string }`,
  },
  {
    name: "XMLExtractOutput",
    definition: `type XMLExtractOutput = Extract<
  XMLParserOutput,
  { type: "onElementBegin" | "onElementEnd" | "onText" | "onError" }
>`,
  },
  {
    name: "XMLParserOptions",
    definition: `type XMLParserOptions = {
  /** Tags whose contents should be treated as opaque foreign text. */
  foreignTags?: readonly string[];
  /** "coalesced" (default) buffers text runs; "delta" emits text as it streams. */
  textMode?: XMLTextMode;
}`,
  },
  {
    name: "XMLExtractOptions",
    definition: `type XMLExtractOptions = {
  /** Tag names to extract from mixed text. Contents are surfaced as opaque onText. */
  allowTags: readonly string[];
  /** "coalesced" (default) buffers text runs; "delta" emits text as it streams. */
  textMode?: XMLTextMode;
}`,
  },
  {
    name: "XMLTextMode",
    definition: `type XMLTextMode = "coalesced" | "delta";`,
  },
  {
    name: "XMLAttribute",
    definition: `type XMLAttribute = { name: string; value: string }`,
  },
  {
    name: "ExtractDelimiterOptions",
    definition: `type ExtractDelimiterOptions = {
  /** Fence marker. Defaults to triple backticks. */
  delimiter?: string;
  /** Allowed fence labels (e.g. "json", "xml"). Case-insensitive. */
  allowLanguages?: readonly string[];
}`,
  },
  {
    name: "FrontmatterExtractOutput",
    definition: `type FrontmatterExtractOutput =
  | { type: "onFrontmatter"; raw: string }
  | { type: "onBody"; value: string }`,
  },
  {
    name: "ExtractFrontmatterOptions",
    definition: `type ExtractFrontmatterOptions = {
  /** Line marker used for both delimiters. Defaults to "---". */
  delimiter?: string;
  /** Cap on characters buffered while waiting for the closing delimiter. Defaults to 65536. */
  maxHeaderChars?: number;
}`,
  },
];

// ─── HTML Builder ───────────────────────────────────────────────────────────

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colorToHex(c) {
  const map = {
    orange: "#f37d39",
    blue: "#4c93af",
    green: "#fcb827",
    red: "#e5484d",
    muted: "#d8dde3",
  };
  return map[c] || c;
}

function renderMarbleSVG(marble) {
  if (!marble) return "";

  const W = 520;
  const H_LINE = 48;
  const R = 16;
  const GUTTER = 60;  // left label area
  const PAD_R = 24;   // right padding

  function railLabel(text, y) {
    return `<text x="${GUTTER - 10}" y="${y + 1}" text-anchor="end" dominant-baseline="central" font-size="11" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#a99fa2" font-weight="500">${escapeHtml(text)}</text>`;
  }

  function arrowLine(y, earlyClose, earlyCloseX) {
    const lineStart = GUTTER;
    const endX = earlyClose ? Math.min((earlyCloseX / 100) * (W - GUTTER - PAD_R) + GUTTER + 30, W - PAD_R) : W - PAD_R;
    const arrowEnd = earlyClose ? "" : `<polygon points="${endX},${y - 5} ${endX + 8},${y} ${endX},${y + 5}" fill="#6b5d62"/>`;
    const completeBar = earlyClose
      ? `<line x1="${endX}" y1="${y - 10}" x2="${endX}" y2="${y + 10}" stroke="#6b5d62" stroke-width="2"/>
         <line x1="${endX + 6}" y1="${y - 8}" x2="${endX + 6}" y2="${y + 8}" stroke="#6b5d62" stroke-width="1.5"/>`
      : `<line x1="${endX + 10}" y1="${y - 10}" x2="${endX + 10}" y2="${y + 10}" stroke="#6b5d62" stroke-width="2"/>`;
    return `<line x1="${lineStart}" y1="${y}" x2="${endX}" y2="${y}" stroke="#6b5d62" stroke-width="2"/>${arrowEnd}${completeBar}`;
  }

  function marble_circle(item, y) {
    const cx = (item.x / 100) * (W - GUTTER - PAD_R) + GUTTER;
    const color = colorToHex(item.color);
    // Ink text on light brand fills (yellow/gray) for readability; white otherwise.
    const textColor = item.color === "green" || item.color === "muted" ? "#302127" : "#fff";
    const fontSize = item.value.length > 4 ? 9 : item.value.length > 3 ? 10 : 11;
    return `<g class="marble-item">
      <circle cx="${cx}" cy="${y}" r="${R}" fill="${color}" stroke="${color}" stroke-width="2"/>
      <text x="${cx}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-size="${fontSize}" font-weight="700" font-family="Onest, -apple-system, sans-serif">${escapeHtml(item.value)}</text>
    </g>`;
  }

  function labelBox(text, y, h) {
    return `<rect x="${GUTTER}" y="${y}" width="${W - GUTTER - PAD_R}" height="${h}" rx="8" fill="#fff" stroke="#e3d9cc" stroke-width="1.5"/>
      <text x="${(W + GUTTER - PAD_R) / 2}" y="${y + h / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-size="13" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#4a3f44">${escapeHtml(text)}</text>`;
  }

  if (marble.type === "source") {
    const totalH = H_LINE + 8;
    const y = H_LINE / 2 + 4;
    let svg = `<svg viewBox="0 0 ${W} ${totalH}" class="marble-svg">`;
    svg += railLabel("output", y);
    svg += arrowLine(y, false);
    marble.output.forEach((item, i) => {
      svg += marble_circle(item, y);
    });
    svg += `</svg>`;
    return svg;
  }

  if (marble.type === "transform") {
    const totalH = H_LINE * 3 + 20;
    const y1 = H_LINE / 2;
    const yBox = H_LINE + 4;
    const boxH = 36;
    const y2 = H_LINE * 2 + 16 + H_LINE / 2 - 20;

    const earlyCloseX = marble.earlyClose && marble.output.length > 0
      ? marble.output[marble.output.length - 1].x
      : 0;

    let svg = `<svg viewBox="0 0 ${W} ${totalH}" class="marble-svg">`;
    svg += railLabel("input", y1);
    svg += arrowLine(y1, false);
    marble.input.forEach((item, i) => {
      svg += marble_circle(item, y1);
    });
    svg += labelBox(marble.label, yBox, boxH);
    svg += railLabel("output", y2);
    svg += arrowLine(y2, marble.earlyClose, earlyCloseX);
    marble.output.forEach((item, i) => {
      svg += marble_circle(item, y2);
    });
    svg += `</svg>`;
    return svg;
  }

  if (marble.type === "merge") {
    const nInputs = marble.inputs.length;
    const inputLabels = marble.inputLabels || marble.inputs.map((_, i) => String.fromCharCode(97 + i)); // a, b, c…
    const totalH = (nInputs + 1) * H_LINE + 30;
    let svg = `<svg viewBox="0 0 ${W} ${totalH}" class="marble-svg">`;
    marble.inputs.forEach((line, li) => {
      const y = H_LINE / 2 + li * H_LINE;
      svg += railLabel(inputLabels[li], y);
      svg += arrowLine(y, false);
      line.forEach((item) => {
        svg += marble_circle(item, y);
      });
    });
    const yOut = nInputs * H_LINE + 20 + H_LINE / 2 - 10;
    svg += railLabel("output", yOut);
    svg += arrowLine(yOut, false);
    marble.output.forEach((item, i) => {
      svg += marble_circle(item, yOut);
    });
    svg += `</svg>`;
    return svg;
  }

  if (marble.type === "collect") {
    const totalH = H_LINE + 36;
    const y = H_LINE / 2;
    let svg = `<svg viewBox="0 0 ${W} ${totalH}" class="marble-svg">`;
    svg += railLabel("stream", y);
    svg += arrowLine(y, false);
    marble.input.forEach((item, i) => {
      svg += marble_circle(item, y);
    });
    // Result label
    svg += `<text x="${GUTTER - 10}" y="${H_LINE + 22}" text-anchor="end" font-size="11" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#a99fa2" font-weight="500">result</text>`;
    svg += `<text x="${GUTTER + 8}" y="${H_LINE + 22}" font-size="14" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#302127" font-weight="600">${escapeHtml(marble.result)}</text>`;
    svg += `</svg>`;
    return svg;
  }

  if (marble.type === "parser") {
    const evtH = marble.events.length * 20 + 16;
    const totalH = H_LINE + 8 + evtH + 8;
    const y = H_LINE / 2;
    let svg = `<svg viewBox="0 0 ${W} ${totalH}" class="marble-svg">`;
    svg += railLabel("chunks", y);
    svg += arrowLine(y, false);
    marble.input.forEach((item, i) => {
      svg += marble_circle(item, y);
    });
    // Events box
    svg += `<text x="${GUTTER - 10}" y="${H_LINE + 10 + evtH / 2}" text-anchor="end" font-size="11" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#a99fa2" font-weight="500">events</text>`;
    svg += `<rect x="${GUTTER}" y="${H_LINE + 2}" width="${W - GUTTER - PAD_R}" height="${evtH}" rx="8" fill="#fdf7ec" stroke="#e9e0d3" stroke-width="1.5"/>`;
    svg += `<text x="${GUTTER + 12}" y="${H_LINE + 20}" font-size="11" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#978f92" font-weight="600">${escapeHtml(marble.label)}</text>`;
    marble.events.forEach((evt, i) => {
      svg += `<text x="${GUTTER + 12}" y="${H_LINE + 38 + i * 20}" font-size="12" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#4a3f44">→ ${escapeHtml(evt)}</text>`;
    });
    svg += `</svg>`;
    return svg;
  }

  if (marble.type === "tee") {
    return renderMarbleSVG({ ...marble, type: "transform" });
  }

  return "";
}

const linkableTypes = new Set(typeDefinitions.map((t) => t.name));

/** Escape HTML, then render Markdown `inline code` spans. */
function renderProse(s) {
  return escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderApi(api) {
  return `
    <div class="api-item" id="${api.name}">
      <h3 class="api-name"><a href="#${api.name}">${escapeHtml(api.name)}</a></h3>
      <p class="api-description">${renderProse(api.description)}</p>
      <div class="api-signature">${linkifyTypes(highlight(api.signature), linkableTypes)}</div>
      ${api.marble ? `<div class="api-visual"><div class="marble-diagram">${renderMarbleSVG(api.marble)}</div><div class="code-preview">${highlight(api.example)}</div></div>` : `<div class="api-visual"><div class="code-preview">${highlight(api.example)}</div></div>`}
    </div>`;
}

function renderCategory(cat) {
  return `
    <section class="api-section" id="cat-${cat.id}">
      <div class="section-header">
        <h2 class="section-title">${escapeHtml(cat.title)}</h2>
        <p class="section-subtitle">${escapeHtml(cat.subtitle)}</p>
      </div>
      ${cat.apis.map(renderApi).join("\n")}
    </section>`;
}

function renderTypes() {
  // Don't link a type to itself in its own definition.
  let html = ``;
  for (const t of typeDefinitions) {
    const others = new Set(linkableTypes);
    others.delete(t.name);
    html += `
        <div class="api-item" id="type-${t.name}">
          <div class="api-header">
            <span class="api-name"><a href="#type-${t.name}">${escapeHtml(t.name)}</a></span>
          </div>
          <div class="code-preview">${linkifyTypes(highlight(t.definition), others)}</div>
        </div>`;
  }
  return html;
}

function renderNav(cats) {
  let html = `<nav class="sidebar">
    <div class="sidebar-header">
      <a class="brand" href="https://www.npmjs.com/package/@withremyinc/stream" target="_blank" rel="noopener">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 245 244" width="19" height="19" fill="none" stroke="#302127" stroke-width="36" stroke-linecap="round">
            <path d="M18 142.515C37.1392 126.32 55.0015 108.629 70.3638 88.7807C83.1654 72.2409 97.4587 40.3036 92.552 19.1415C91.5234 14.7056 82.9118 24.3798 80.5 28.0003C67.6628 47.2709 53.0406 87.9162 86.5 93C110.35 96.6237 178.12 25.736 159.699 59.5492C151.436 74.7143 143.083 89.7157 136.697 105.805C130.415 121.634 120.704 149.206 117.405 170.017C114 191.5 120.5 221.5 151.171 225.5C181.663 229.477 211.133 196.674 226.388 173.791"/>
          </svg>
        </span>
        <span class="brand-text">
          <span class="brand-name">stream</span>
          <span class="brand-scope">@withremyinc</span>
        </span>
      </a>
      <p class="sidebar-tagline">Composable Web Streams utilities with streaming JSON &amp; XML parsing.</p>
    </div>
    <div class="sidebar-links">
      <a href="https://www.npmjs.com/package/@withremyinc/stream" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/></svg>
        npm
      </a>
      <a href="https://github.com/withremyinc/stream" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
        GitHub
      </a>
    </div>
    <div class="sidebar-nav">`;
  for (const cat of cats) {
    html += `
      <div class="nav-group">
        <a href="#cat-${cat.id}" class="nav-group-title">${escapeHtml(cat.title)}</a>
        <ul>`;
    for (const api of cat.apis) {
      html += `\n          <li><a href="#${api.name}">${escapeHtml(api.name)}</a></li>`;
    }
    html += `\n        </ul>\n      </div>`;
  }
  html += `
      <div class="nav-group">
        <a href="#cat-types" class="nav-group-title">Types</a>
        <ul>`;
  for (const t of typeDefinitions) {
    html += `\n          <li><a href="#type-${t.name}">${escapeHtml(t.name)}</a></li>`;
  }
  html += `\n        </ul>\n      </div>`;
  html += `\n    </div>\n  </nav>`;
  return html;
}

function pageShell({ title, navHtml, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap');
    @font-face {
      font-family: "Rodger Bold";
      src: url("https://framerusercontent.com/assets/WTgH0Lz1557m7kIAoJZYg7NHUcY.woff2") format("woff2");
      font-display: swap;
      font-style: normal;
      font-weight: 700;
    }

    :root {
      /* Brand palette — withremy.com */
      --ink: #302127;
      --cream: #feedc9;
      --cream-soft: #fdf7ec;
      --yellow: #fcb827;
      --yellow-bright: #ffe24d;
      --orange: #f37d39;
      --blue: #4c93af;
      --cyan-bg: #d7f1f7;
      --line-strong: #e6ded2;

      /* Semantic tokens (names reused throughout) */
      --bg-color: #ffffff;
      --text-primary: #302127;
      --text-secondary: #635a5d;
      --text-muted: #978f92;
      --hover-bg: #fbf3e0;
      --border-color: #efe9df;
      --sidebar-w: 264px;
      --font-stack: "Onest", -apple-system, BlinkMacSystemFont, "Segoe UI", helvetica, arial, sans-serif;
      --font-display: "Rodger Bold", "Onest", -apple-system, BlinkMacSystemFont, "Segoe UI", helvetica, arial, sans-serif;
      --mono: Menlo, Consolas, Monaco, "Adwaita Mono", "Liberation Mono", "Lucida Console", monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    html { scroll-behavior: smooth; scroll-padding-top: 24px; }

    body {
      font-family: var(--font-stack);
      background-color: var(--bg-color);
      color: var(--text-primary);
      line-height: 1.55;
      font-size: 15px;
      letter-spacing: -0.01em;
    }

    /* Sidebar */
    .sidebar {
      position: fixed;
      top: 0; left: 0;
      width: var(--sidebar-w);
      height: 100vh;
      overflow-y: auto;
      border-right: 1px solid var(--border-color);
      background: var(--cream-soft);
      padding: 28px 20px;
      z-index: 100;
    }
    .sidebar-header {
      margin-bottom: 20px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--line-strong);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      text-decoration: none;
    }
    .brand-mark {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--yellow);
      border: 1px solid var(--ink);
      box-shadow: 0 2px 0 var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .brand:hover .brand-mark {
      transform: translateY(-1px);
      box-shadow: 0 3px 0 var(--ink);
    }
    .brand-text { display: flex; flex-direction: column; line-height: 1; }
    .brand-name {
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--ink);
    }
    .brand-scope {
      font-family: var(--font-stack);
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .sidebar-tagline {
      font-family: var(--font-stack);
      font-size: 12.5px;
      font-weight: 400;
      color: var(--text-muted);
      margin-top: 16px;
      line-height: 1.45;
      letter-spacing: 0;
    }
    .sidebar-links {
      display: flex;
      gap: 8px;
      margin-bottom: 22px;
    }
    .sidebar-links a {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 100px;
      background: #fff;
      border: 1px solid var(--line-strong);
      box-shadow: 0 2px 0 var(--line-strong);
      transition: transform 0.12s ease, box-shadow 0.12s ease, background-color 0.15s;
    }
    .sidebar-links a:hover {
      background: var(--yellow);
      border-color: var(--ink);
      box-shadow: 0 2px 0 var(--ink);
      transform: translateY(-1px);
    }

    .nav-group { margin-bottom: 16px; }
    .nav-group-title {
      display: block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
      padding: 4px 10px;
      text-decoration: none;
      transition: color 0.15s;
    }
    .nav-group-title:hover { color: var(--orange); }
    .nav-group ul { list-style: none; }
    .nav-group li a {
      display: block;
      padding: 4px 10px 4px 16px;
      font-size: 14px;
      font-family: var(--font-stack);
      color: var(--text-secondary);
      text-decoration: none;
      border-radius: 8px;
      transition: all 0.12s;
    }
    .nav-group li a:hover {
      background: #fff;
      color: var(--ink);
    }

    /* Main */
    .main {
      margin-left: var(--sidebar-w);
      max-width: 760px;
      padding: 56px 48px 96px;
    }

    /* Hero */
    .hero-header {
      margin-bottom: 44px;
      padding: 0;
      background: none;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }
    h1.hero-title {
      font-family: var(--font-display);
      font-size: 44px;
      font-weight: 700;
      letter-spacing: -1.5px;
      line-height: 1.05;
      color: var(--ink);
      margin-bottom: 12px;
    }
    p.hero-subtitle {
      font-size: 17px;
      color: var(--text-secondary);
      max-width: 52ch;
      line-height: 1.45;
    }

    /* Section headers */
    .api-section { margin-bottom: 12px; }
    .section-header {
      margin: 8px 0 4px;
      padding-bottom: 12px;
    }
    .section-title {
      font-family: var(--font-display);
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--ink);
      line-height: 1.1;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .section-title::after {
      content: "";
      flex: 1;
      height: 3px;
      border-radius: 100px;
      background: var(--yellow);
      opacity: 0.5;
    }
    .section-subtitle {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 6px;
    }


    /* API items */
    details { outline: none; }
    summary { list-style: none; outline: none; }
    summary::-webkit-details-marker { display: none; }
    .api-item {
      padding: 30px 0;
      border-bottom: 1px solid var(--border-color);
    }
    .api-item:last-child { border-bottom: none; }
    .api-name {
      font-size: 19px;
      font-weight: 700;
      font-family: var(--font-stack);
      letter-spacing: -0.02em;
      color: var(--ink);
      margin: 0 0 10px 0;
    }
    .api-name a {
      color: inherit;
      text-decoration: none;
    }
    .api-name a::after {
      content: ' #';
      color: var(--orange);
      opacity: 0;
      transition: opacity 0.15s;
      font-weight: 700;
    }
    .api-name:hover a::after {
      opacity: 1;
    }
    .api-description {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.5;
      margin-bottom: 10px;
    }
    .api-description code {
      font-family: var(--mono);
      font-size: 0.9em;
      color: var(--text-primary);
      background: var(--hover-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 1px 4px;
    }
    .api-signature {
      padding: 0;
      margin-bottom: 14px;
      overflow-x: auto;
    }
    .api-signature pre.shiki {
      margin: 0;
      padding: 0;
      background: none !important;
    }
    .api-signature code {
      font-size: 12px;
      font-family: var(--mono);
      color: var(--text-muted) !important;
      white-space: pre;
      line-height: 1.5;
    }
    .api-signature .line span {
      color: var(--text-muted) !important;
    }

    /* Type cross-reference links inside signatures + type definitions */
    a.type-link {
      color: inherit;
      text-decoration: none;
      border-bottom: 1px dashed var(--orange);
      transition: border-color 0.15s, color 0.15s, background-color 0.15s;
    }
    a.type-link:hover {
      border-bottom-color: var(--orange);
      color: var(--orange) !important;
      background: rgba(243, 125, 57, 0.08);
    }
    .api-signature a.type-link:hover {
      color: var(--orange) !important;
    }

    /* Type preview popover (Wikipedia-style) */
    .type-preview {
      position: absolute;
      z-index: 1000;
      max-width: 480px;
      min-width: 280px;
      background: var(--bg-color);
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      box-shadow:
        0 1px 2px rgba(48, 33, 39, 0.05),
        0 10px 28px rgba(48, 33, 39, 0.12);
      padding: 12px 14px;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(-2px);
      transition: opacity 0.12s ease-out, transform 0.12s ease-out;
    }
    .type-preview.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .type-preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .type-preview-name {
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .type-preview-jump {
      font-size: 11px;
      color: var(--text-muted);
      text-decoration: none;
      padding: 2px 6px;
      border-radius: 4px;
      transition: background-color 0.15s, color 0.15s;
    }
    .type-preview-jump:hover {
      background: var(--hover-bg);
      color: var(--text-primary);
    }
    .type-preview pre.shiki {
      margin: 0;
      padding: 0;
      background: none !important;
      max-height: 320px;
      overflow: auto;
    }
    .type-preview code {
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.55;
      white-space: pre;
    }
    @media (max-width: 768px) {
      .type-preview { display: none !important; }
    }


    /* Marble + Code combined block */
    .api-visual {
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 3px 0 var(--border-color);
    }
    .api-visual .marble-diagram {
      background: var(--cream-soft);
      padding: 18px 12px;
      border-bottom: 1px solid var(--line-strong);
      display: flex;
      justify-content: center;
    }
    .api-visual .code-preview {
      padding: 14px 16px;
      border-radius: 0;
    }
    .marble-svg {
      width: 100%;
      max-width: 520px;
      height: auto;
    }

    /* Code Preview */
    .code-preview {
      padding: 14px 16px;
      overflow-x: auto;
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      background: var(--cream-soft);
    }
    .api-visual .code-preview {
      border: none;
      border-radius: 0;
      background: #fff;
    }
    .code-preview pre.shiki {
      margin: 0;
      padding: 0;
      background: none !important;
    }
    .code-preview code {
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.6;
      white-space: pre;
    }

    /* Active page in sidebar */
    .nav-group li a.is-active {
      background: var(--cream);
      color: var(--ink);
      font-weight: 600;
    }

    /* TOC card under the hero */
    .toc-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0 0 52px;
      padding: 14px;
      border: 1px solid var(--line-strong);
      border-radius: 16px;
      background: var(--cream-soft);
    }
    .toc-card-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
      padding: 4px 8px 8px;
    }
    .toc-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      text-decoration: none;
      border: 1px solid transparent;
      transition: background-color 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
    }
    .toc-item:hover {
      background: #fff;
      border-color: var(--line-strong);
      transform: translateX(2px);
    }
    .toc-item.is-here { cursor: default; }
    .toc-item.is-here:hover { background: transparent; border-color: transparent; transform: none; }
    .toc-item-text { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .toc-item-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toc-here-tag {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--ink);
      background: var(--yellow);
      padding: 2px 7px;
      border-radius: 100px;
    }
    .toc-item-desc { font-size: 13px; color: var(--text-secondary); }
    .toc-item-arrow {
      font-size: 16px;
      color: var(--text-muted);
      transition: color 0.12s ease, transform 0.12s ease;
    }
    .toc-item:hover .toc-item-arrow { color: var(--orange); transform: translateX(2px); }
    .toc-item.is-here .toc-item-arrow { display: none; }

    /* Guide prose */
    .guide-hero .hero-title { font-family: var(--font-display); }
    .prose { max-width: 660px; }
    .prose p {
      font-size: 15.5px;
      line-height: 1.7;
      color: var(--text-secondary);
      margin: 0 0 16px;
    }
    .prose p.lead {
      font-size: 18px;
      line-height: 1.6;
      color: var(--ink);
    }
    .prose ul {
      margin: 0 0 16px;
      padding-left: 22px;
    }
    .prose li {
      font-size: 15.5px;
      line-height: 1.6;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    .prose strong { color: var(--ink); font-weight: 600; }
    .prose code {
      font-family: var(--mono);
      font-size: 0.86em;
      background: var(--cream-soft);
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      padding: 1px 5px;
      color: var(--ink);
    }
    .prose a {
      color: var(--orange);
      text-decoration: none;
      border-bottom: 1px solid rgba(243, 125, 57, 0.35);
      transition: border-color 0.12s ease;
    }
    .prose a:hover { border-bottom-color: var(--orange); }
    .prose .code-preview { margin: 18px 0; }
    .guide-section .section-header { padding-bottom: 8px; }

    /* Callout */
    .callout {
      background: var(--cream);
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      padding: 16px 18px;
      margin: 4px 0 18px;
      font-size: 15px;
      line-height: 1.6;
      color: var(--ink);
    }
    .callout strong { color: var(--ink); }
    .callout-draft { background: var(--cream-soft); }
    .callout-draft p { margin: 8px 0 0; color: var(--text-secondary); font-size: 14px; }

    /* Mobile */
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main { margin-left: 0; padding: 24px 16px 60px; }
    }
  </style>
</head>
<body>
  ${navHtml}
  <main class="main">
    ${bodyHtml}
  </main>
  <script>
    (function () {
      const SHOW_DELAY = 220;
      const HIDE_DELAY = 160;
      const MARGIN = 12;

      let popover = null;
      let activeLink = null;
      let showTimer = null;
      let hideTimer = null;

      function ensurePopover() {
        if (popover) return popover;
        popover = document.createElement("div");
        popover.className = "type-preview";
        popover.setAttribute("role", "tooltip");
        popover.addEventListener("mouseenter", cancelHide);
        popover.addEventListener("mouseleave", scheduleHide);
        document.body.appendChild(popover);
        return popover;
      }

      function buildContent(targetId, typeName) {
        const target = document.getElementById(targetId);
        if (!target) return null;
        const code = target.querySelector(".code-preview");
        if (!code) return null;
        return (
          '<div class="type-preview-header">' +
            '<span class="type-preview-name">' + typeName + '</span>' +
            '<a class="type-preview-jump" href="#' + targetId + '">jump to definition →</a>' +
          '</div>' +
          code.outerHTML
        );
      }

      function position(link) {
        if (!popover) return;
        const linkRect = link.getBoundingClientRect();
        const popRect = popover.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;

        // Prefer below; flip above if it would overflow.
        let top = linkRect.bottom + window.scrollY + 8;
        const wouldOverflowBottom = linkRect.bottom + popRect.height + 16 > vh;
        const fitsAbove = linkRect.top - popRect.height - 16 > 0;
        if (wouldOverflowBottom && fitsAbove) {
          top = linkRect.top + window.scrollY - popRect.height - 8;
        }

        // Horizontally align to link start, clamp to viewport.
        let left = linkRect.left + window.scrollX;
        const maxLeft = window.scrollX + vw - popRect.width - MARGIN;
        const minLeft = window.scrollX + MARGIN;
        if (left > maxLeft) left = maxLeft;
        if (left < minLeft) left = minLeft;

        popover.style.top = top + "px";
        popover.style.left = left + "px";
      }

      function show(link) {
        const href = link.getAttribute("href") || "";
        if (!href.startsWith("#type-")) return;
        const targetId = href.slice(1);
        const typeName = link.textContent || targetId.replace(/^type-/, "");
        const html = buildContent(targetId, typeName);
        if (!html) return;

        const pop = ensurePopover();
        pop.innerHTML = html;
        // Render off-screen first so we can measure.
        pop.style.top = "-9999px";
        pop.style.left = "-9999px";
        pop.classList.add("visible");
        // Next frame: measure + position.
        requestAnimationFrame(function () {
          if (activeLink !== link) return;
          position(link);
        });
      }

      function hide() {
        if (!popover) return;
        popover.classList.remove("visible");
        activeLink = null;
      }

      function cancelShow() {
        if (showTimer) {
          clearTimeout(showTimer);
          showTimer = null;
        }
      }
      function cancelHide() {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      }
      function scheduleHide() {
        cancelHide();
        hideTimer = setTimeout(hide, HIDE_DELAY);
      }

      function onEnter(e) {
        const link = e.target.closest("a.type-link");
        if (!link) return;
        if (link === activeLink) {
          cancelHide();
          return;
        }
        activeLink = link;
        cancelHide();
        cancelShow();
        showTimer = setTimeout(function () {
          if (activeLink === link) show(link);
        }, SHOW_DELAY);
      }

      function onLeave(e) {
        const link = e.target.closest("a.type-link");
        if (!link) return;
        cancelShow();
        scheduleHide();
      }

      document.addEventListener("mouseover", onEnter);
      document.addEventListener("mouseout", onLeave);

      // Hide on scroll/escape so the popover never feels stuck.
      window.addEventListener(
        "scroll",
        function () {
          cancelShow();
          hide();
        },
        { passive: true }
      );
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          cancelShow();
          hide();
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ─── Pages ──────────────────────────────────────────────────────────────────

const SITE_PAGES = [
  { id: "guide", href: "streams.html", label: "Thinking in Streams" },
  { id: "api", href: "index.html", label: "API Reference" },
  { id: "skill", href: "skill.html", label: "Agent Skill" },
];

function renderPagesNav(active) {
  let html = `\n      <div class="nav-group">\n        <span class="nav-group-title">Pages</span>\n        <ul>`;
  for (const p of SITE_PAGES) {
    const cur = p.id === active ? ' aria-current="page" class="is-active"' : "";
    html += `\n          <li><a href="${p.href}"${cur}>${escapeHtml(p.label)}</a></li>`;
  }
  html += `\n        </ul>\n      </div>`;
  return html;
}

function renderTocCard(active) {
  const blurbs = {
    guide: "New to streams? Start with the mental model.",
    api: "Every helper, with marble diagrams + examples.",
    skill: "Drop-in instructions so AI agents get streams right.",
  };
  let rows = "";
  for (const p of SITE_PAGES) {
    const here = p.id === active;
    rows += `\n      <a class="toc-item${here ? " is-here" : ""}" href="${here ? "#" : p.href}"${here ? ' aria-current="page"' : ""}>
        <span class="toc-item-text">
          <span class="toc-item-title">${escapeHtml(p.label)}${here ? ' <span class="toc-here-tag">you are here</span>' : ""}</span>
          <span class="toc-item-desc">${escapeHtml(blurbs[p.id])}</span>
        </span>
        <span class="toc-item-arrow" aria-hidden="true">→</span>
      </a>`;
  }
  return `<nav class="toc-card" aria-label="Site pages">
      <span class="toc-card-label">Start here</span>${rows}
    </nav>`;
}

function renderSidebar({ active, groupsHtml = "" }) {
  return `<nav class="sidebar">
    <div class="sidebar-header">
      <a class="brand" href="https://www.npmjs.com/package/@withremyinc/stream" target="_blank" rel="noopener">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 245 244" width="19" height="19" fill="none" stroke="#302127" stroke-width="36" stroke-linecap="round">
            <path d="M18 142.515C37.1392 126.32 55.0015 108.629 70.3638 88.7807C83.1654 72.2409 97.4587 40.3036 92.552 19.1415C91.5234 14.7056 82.9118 24.3798 80.5 28.0003C67.6628 47.2709 53.0406 87.9162 86.5 93C110.35 96.6237 178.12 25.736 159.699 59.5492C151.436 74.7143 143.083 89.7157 136.697 105.805C130.415 121.634 120.704 149.206 117.405 170.017C114 191.5 120.5 221.5 151.171 225.5C181.663 229.477 211.133 196.674 226.388 173.791"/>
          </svg>
        </span>
        <span class="brand-text">
          <span class="brand-name">stream</span>
          <span class="brand-scope">@withremyinc</span>
        </span>
      </a>
      <p class="sidebar-tagline">Composable Web Streams utilities with streaming JSON &amp; XML parsing.</p>
    </div>
    <div class="sidebar-links">
      <a href="https://www.npmjs.com/package/@withremyinc/stream" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/></svg>
        npm
      </a>
      <a href="https://github.com/withremyinc/stream" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
        GitHub
      </a>
    </div>
    <div class="sidebar-nav">${renderPagesNav(active)}${groupsHtml}
    </div>
  </nav>`;
}

function renderApiNavGroups(cats) {
  let html = "";
  for (const cat of cats) {
    html += `\n      <div class="nav-group">\n        <a href="#cat-${cat.id}" class="nav-group-title">${escapeHtml(cat.title)}</a>\n        <ul>`;
    for (const api of cat.apis) {
      html += `\n          <li><a href="#${api.name}">${escapeHtml(api.name)}</a></li>`;
    }
    html += `\n        </ul>\n      </div>`;
  }
  html += `\n      <div class="nav-group">\n        <a href="#cat-types" class="nav-group-title">Types</a>\n        <ul>`;
  for (const t of typeDefinitions) {
    html += `\n          <li><a href="#type-${t.name}">${escapeHtml(t.name)}</a></li>`;
  }
  html += `\n        </ul>\n      </div>`;
  return html;
}

function renderGuideNavGroups() {
  const sections = [
    ["why", "Why streams?"],
    ["api", "The API in three nouns"],
    ["pull", "Pull, not push"],
    ["mental-model", "A mental model"],
    ["pipeline", "Your first pipeline"],
    ["when-not", "When not to use streams"],
    ["next", "Where this library fits"],
  ];
  let html = `\n      <div class="nav-group">\n        <span class="nav-group-title">On this page</span>\n        <ul>`;
  for (const [id, label] of sections) {
    html += `\n          <li><a href="#${id}">${escapeHtml(label)}</a></li>`;
  }
  html += `\n        </ul>\n      </div>`;
  return html;
}

function guideSection(id, title, inner) {
  return `
    <section class="api-section guide-section" id="${id}">
      <div class="section-header">
        <h2 class="section-title">${escapeHtml(title)}</h2>
      </div>
      <div class="prose">${inner}</div>
    </section>`;
}

function renderGuideBody() {
  const ex1 = highlight(`// A stream is values arriving over time — not all at once.
const lines = fetch("/big.log")
  .then(r => r.body)               // ReadableStream<Uint8Array>
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(splitLines());      // ReadableStream<string>`);

  const ex2 = highlight(`import { arrayStream, collect, filter, map } from "@withremyinc/stream";

const output = await collect(
  arrayStream([1, 2, 3, 4])
    .pipeThrough(map(n => n * 2))      // 2, 4, 6, 8
    .pipeThrough(filter(n => n > 4)),  // 6, 8
);
// [6, 8]`);

  const ex3 = highlight(`import { parseJSON } from "@withremyinc/stream";

// Tokens from an LLM arrive a few characters at a time.
// parseJSON emits structured events as soon as it can — no waiting
// for the closing brace.
modelStream
  .pipeThrough(parseJSON({ emitPartialStrings: true }))
  .pipeTo(renderAsItStreams());`);

  return `
    <header class="hero-header guide-hero">
      <h1 class="hero-title">Thinking in Streams</h1>
      <p class="hero-subtitle">A short, friendly mental model for the Web Streams API — and how this library helps you work with data that arrives over time.</p>
    </header>
    ${renderTocCard("guide")}

    ${guideSection("why", "Why streams?", `
      <p class="lead">Most code assumes you have all your data before you start: an array in memory, a full response body, a complete file. Streams are for the (very common) case where you <em>don't</em> — where data shows up a piece at a time.</p>
      <p>Think about an LLM typing out a response, a multi-gigabyte log file, rows from a database cursor, or bytes off a network socket. Waiting for the <em>last</em> piece before you do anything means more memory, more latency, and a worse experience. Streams let you start working on the first chunk while the rest is still on its way.</p>
      <div class="callout">
        <strong>The one-sentence version:</strong> a stream is a sequence of values that arrive over time, that you process one chunk at a time without ever holding the whole thing in memory.
      </div>`)}

    ${guideSection("api", "The API in three nouns", `
      <p>The <a href="https://developer.mozilla.org/en-US/docs/Web/API/Streams_API" target="_blank" rel="noopener">Web Streams API</a> is built into modern browsers, Node, Deno, and Bun. You really only need three nouns:</p>
      <ul>
        <li><strong>ReadableStream</strong> — a source you pull values <em>out of</em> (a file, a fetch body, an array you wrap).</li>
        <li><strong>WritableStream</strong> — a sink you push values <em>into</em> (a file, the console, a socket).</li>
        <li><strong>TransformStream</strong> — a step in the middle: values go in, (different) values come out.</li>
      </ul>
      <p>And one verb that connects them: <code>.pipeThrough()</code> for transforms, <code>.pipeTo()</code> for a final sink.</p>
      <div class="code-preview">${ex1}</div>
      <p>That's the whole shape: <strong>source → transform → transform → sink</strong>. Everything in this library is just a nicely-typed source, transform, or collector you can drop into that chain.</p>`)}

    ${guideSection("pull", "Pull, not push (a.k.a. backpressure)", `
      <p>The thing that surprises people: Web Streams are <strong>pull-based</strong>. A source doesn't fire data at you as fast as it can. The consumer asks for the next chunk when it's ready, and that "I'm ready" signal travels back up the whole pipeline.</p>
      <p>This is <strong>backpressure</strong>, and you get it for free. If your slow database write can only keep up with 100 rows/sec, the fetch at the top of the pipe automatically slows down to match. No manual buffering, no unbounded memory growth, no <code>drain</code> events to babysit.</p>
      <div class="callout">
        If you've ever written code that loaded a 2&nbsp;GB file into an array and watched the process OOM, backpressure is the thing you were missing.
      </div>`)}

    ${guideSection("mental-model", "A mental model: arrays you can't see all at once", `
      <p>The most useful trick is to picture a stream as an <strong>array stretched out across time</strong>. You can't index into it or call <code>.length</code> — you only ever see one element at the "now" line — but the operations you already know still apply:</p>
      <ul>
        <li><code>map</code> transforms each value as it passes.</li>
        <li><code>filter</code> drops values that don't match.</li>
        <li><code>reduce</code> / <code>scan</code> fold values into an accumulator.</li>
        <li><code>take</code> / <code>drop</code> slice by position.</li>
      </ul>
      <p>That's why the marble diagrams in the <a href="index.html">API reference</a> are worth a look: each one shows values flowing left-to-right along a timeline, so you can <em>see</em> what a transform does instead of decoding a type signature.</p>`)}

    ${guideSection("pipeline", "Your first pipeline", `
      <p>Here's the quick-start, annotated. <code>arrayStream</code> turns a plain array into a source, the transforms run in order, and <code>collect</code> drains everything back into an array at the end.</p>
      <div class="code-preview">${ex2}</div>
      <p>The streaming parsers are where this gets genuinely useful. Feed in text as it arrives and get structured events out immediately — ideal for LLM token streams:</p>
      <div class="code-preview">${ex3}</div>`)}

    ${guideSection("when-not", "When not to use streams", `
      <p>Streams are a tool, not a religion. If your data is small and already in memory, a plain array and <code>Array.prototype.map</code> is simpler and faster to read. Reach for streams when at least one of these is true:</p>
      <ul>
        <li>The data is large enough that holding it all in memory is a problem.</li>
        <li>The data arrives over time and you want to act on early chunks.</li>
        <li>You need backpressure between a fast producer and a slow consumer.</li>
      </ul>`)}

    ${guideSection("next", "Where this library fits", `
      <p>The Web Streams API gives you the primitives; it does <em>not</em> give you <code>map</code>, <code>filter</code>, <code>merge</code>, or a tolerant streaming JSON/XML parser. That's the gap <code>@withremyinc/stream</code> fills: small, composable, well-typed helpers that snap onto the standard <code>pipeThrough</code>/<code>pipeTo</code> chain.</p>
      <p>Ready to build something? Head to the <a href="index.html">API reference</a> — every helper has a marble diagram and a runnable example. Working with an AI agent? The <a href="skill.html">agent skill</a> teaches it to use these correctly.</p>`)}`;
}

function renderSkillBody() {
  return `
    <header class="hero-header">
      <h1 class="hero-title">Agent Skill</h1>
      <p class="hero-subtitle">A drop-in skill that teaches AI coding agents how to reason about Web Streams and use <code>@withremyinc/stream</code> correctly.</p>
    </header>
    ${renderTocCard("skill")}
    <section class="api-section">
      <div class="prose">
        <div class="callout callout-draft">
          <strong>✍️ This page is authored by hand.</strong>
          <p>Agents are notoriously shaky at streams, so the skill content is written deliberately rather than generated. Drop it in below.</p>
        </div>
        <!-- AUTHOR: write the agent skill here.
             Suggested structure:
               1. When to use this skill
               2. Core mental model (link to streams.html)
               3. The pipeThrough / pipeTo contract
               4. Common mistakes agents make (and the fix)
               5. Recipes: LLM JSON streaming, line splitting, merge/fan-in
        -->
      </div>
    </section>`;
}

// ─── index.html (API reference) ─────────────────────────────────────────────

const indexBody = `
    <header class="hero-header">
      <h1 class="hero-title">@withremyinc/<wbr>stream</h1>
      <p class="hero-subtitle">Composable Web Streams utilities with streaming JSON and XML parsing.</p>
    </header>
    ${renderTocCard("api")}
    ${categories.map(renderCategory).join("\n")}
    <section class="api-section" id="cat-types">
      <div class="section-header">
        <h2 class="section-title">Types</h2>
        <p class="section-subtitle">Shared type definitions</p>
      </div>
      ${renderTypes()}
    </section>`;

const indexHtml = pageShell({
  title: "@withremyinc/stream",
  navHtml: renderSidebar({ active: "api", groupsHtml: renderApiNavGroups(categories) }),
  bodyHtml: indexBody,
});

// ─── streams.html (guide) ───────────────────────────────────────────────────

const guideHtml = pageShell({
  title: "Thinking in Streams — @withremyinc/stream",
  navHtml: renderSidebar({ active: "guide", groupsHtml: renderGuideNavGroups() }),
  bodyHtml: renderGuideBody(),
});

// ─── skill.html (authored separately) ───────────────────────────────────────

const skillHtml = pageShell({
  title: "Agent Skill — @withremyinc/stream",
  navHtml: renderSidebar({ active: "skill" }),
  bodyHtml: renderSkillBody(),
});

mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", indexHtml);
writeFileSync("docs/streams.html", guideHtml);
writeFileSync("docs/skill.html", skillHtml);
console.log("✅ docs/index.html, docs/streams.html, docs/skill.html generated");
