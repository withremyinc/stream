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
          "parseJSON(): TransformStream<string, JSONParserOutput>",
        description:
          "Streaming JSON/JSONC parser. Emits SAX-style events (onObjectBegin, onObjectEnd, onArrayBegin, onArrayEnd, onLiteralValue, onObjectProperty, onError) with full JSONPath tracking.",
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
          "Reduces a stream of JSONParserOutput events into a single JavaScript object. Emits the reconstructed value on completion.",
        marble: {
          type: "parser",
          input: [
            { value: "{…", color: "orange", x: 5 },
            { value: "prop", color: "blue", x: 28 },
            { value: "val", color: "green", x: 51 },
            { value: "…}", color: "orange", x: 74 },
          ],
          label: "jsonToJSObject()",
          events: ['→ {name: "stream"}'],
        },
        example: `import { arrayStream, collectFirst, parseJSON, jsonToJSObject, pipeThrough } from "@withremyinc/stream";

const result = await collectFirst(
  arrayStream(['{"name":"stream"}'])
    .pipeThrough(pipeThrough(parseJSON(), jsonToJSObject()))
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
  | { type: "onError"; error: ParseErrorCode }`,
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
    orange: "#ff6b35",
    blue: "#4ecdc4",
    green: "#45b649",
    red: "#ff4757",
    muted: "#8899a6",
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
    return `<text x="${GUTTER - 10}" y="${y + 1}" text-anchor="end" dominant-baseline="central" font-size="11" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#9ca3af" font-weight="500">${escapeHtml(text)}</text>`;
  }

  function arrowLine(y, earlyClose, earlyCloseX) {
    const lineStart = GUTTER;
    const endX = earlyClose ? Math.min((earlyCloseX / 100) * (W - GUTTER - PAD_R) + GUTTER + 30, W - PAD_R) : W - PAD_R;
    const arrowEnd = earlyClose ? "" : `<polygon points="${endX},${y - 5} ${endX + 8},${y} ${endX},${y + 5}" fill="#555"/>`;
    const completeBar = earlyClose
      ? `<line x1="${endX}" y1="${y - 10}" x2="${endX}" y2="${y + 10}" stroke="#555" stroke-width="2"/>
         <line x1="${endX + 6}" y1="${y - 8}" x2="${endX + 6}" y2="${y + 8}" stroke="#555" stroke-width="1.5"/>`
      : `<line x1="${endX + 10}" y1="${y - 10}" x2="${endX + 10}" y2="${y + 10}" stroke="#555" stroke-width="2"/>`;
    return `<line x1="${lineStart}" y1="${y}" x2="${endX}" y2="${y}" stroke="#555" stroke-width="2"/>${arrowEnd}${completeBar}`;
  }

  function marble_circle(item, y) {
    const cx = (item.x / 100) * (W - GUTTER - PAD_R) + GUTTER;
    const color = colorToHex(item.color);
    const fontSize = item.value.length > 4 ? 9 : item.value.length > 3 ? 10 : 11;
    return `<g class="marble-item">
      <circle cx="${cx}" cy="${y}" r="${R}" fill="${color}" stroke="${color}" stroke-width="2" opacity="0.9"/>
      <text x="${cx}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${fontSize}" font-weight="600" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace">${escapeHtml(item.value)}</text>
    </g>`;
  }

  function labelBox(text, y, h) {
    return `<rect x="${GUTTER}" y="${y}" width="${W - GUTTER - PAD_R}" height="${h}" rx="6" fill="none" stroke="#ddd" stroke-width="1.5"/>
      <text x="${(W + GUTTER - PAD_R) / 2}" y="${y + h / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-size="13" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#444">${escapeHtml(text)}</text>`;
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
    svg += `<text x="${GUTTER - 10}" y="${H_LINE + 22}" text-anchor="end" font-size="11" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#9ca3af" font-weight="500">result</text>`;
    svg += `<text x="${GUTTER + 8}" y="${H_LINE + 22}" font-size="14" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#45b649" font-weight="600">${escapeHtml(marble.result)}</text>`;
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
    svg += `<text x="${GUTTER - 10}" y="${H_LINE + 10 + evtH / 2}" text-anchor="end" font-size="11" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#9ca3af" font-weight="500">events</text>`;
    svg += `<rect x="${GUTTER}" y="${H_LINE + 2}" width="${W - GUTTER - PAD_R}" height="${evtH}" rx="6" fill="#f8f9fa" stroke="#ddd" stroke-width="1.5"/>`;
    svg += `<text x="${GUTTER + 12}" y="${H_LINE + 20}" font-size="11" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#888" font-weight="600">${escapeHtml(marble.label)}</text>`;
    marble.events.forEach((evt, i) => {
      svg += `<text x="${GUTTER + 12}" y="${H_LINE + 38 + i * 20}" font-size="12" font-family="Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace" fill="#444">→ ${escapeHtml(evt)}</text>`;
    });
    svg += `</svg>`;
    return svg;
  }

  if (marble.type === "tee") {
    return renderMarbleSVG({ ...marble, type: "transform" });
  }

  return "";
}

function renderApi(api) {
  return `
    <div class="api-item" id="${api.name}">
      <h3 class="api-name"><a href="#${api.name}">${escapeHtml(api.name)}</a></h3>
      <p class="api-description">${escapeHtml(api.description)}</p>
      <div class="api-signature">${highlight(api.signature)}</div>
      ${api.marble ? `<div class="api-visual"><div class="marble-diagram">${renderMarbleSVG(api.marble)}</div><div class="code-preview">${highlight(api.example)}</div></div>` : `<div class="api-visual"><div class="code-preview">${highlight(api.example)}</div></div>`}
    </div>`;
}

function renderCategory(cat) {
  return cat.apis.map(renderApi).join("\n");
}

function renderTypes() {
  let html = ``;
  for (const t of typeDefinitions) {
    html += `
        <div class="api-item" id="type-${t.name}">
          <div class="api-header">
            <span class="api-name"><a href="#type-${t.name}">${escapeHtml(t.name)}</a></span>
          </div>
          <div class="code-preview">${highlight(t.definition)}</div>
        </div>`;
  }
  return html;
}

function renderNav(cats) {
  let html = `<nav class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title">@withremyinc/<wbr>stream</div>
      <p class="sidebar-tagline">Composable Web Streams</p>
    </div>
    <div class="sidebar-links">
      <a href="https://www.npmjs.com/package/@withremyinc/stream" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0h-2.667V8.667h2.667v5.331zm12-5.331v4h-1.333v-4h-1.333v4h-1.334v-4h-1.333v4h-1.333V8.667h6.666z"/></svg>
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

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>@withremyinc/stream</title>
  <style>
    :root {
      --bg-color: #FFFFFF;
      --text-primary: #1F1F1F;
      --text-secondary: #595959;
      --text-muted: #828282;
      --hover-bg: #F2F2F2;
      --border-color: #f0f0f0;
      --sidebar-w: 240px;
      --font-stack: -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, Adwaita Sans, Cantarell, Ubuntu, roboto, noto, helvetica, arial, sans-serif;
      --mono: Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    html { scroll-behavior: smooth; scroll-padding-top: 24px; }

    body {
      font-family: var(--font-stack);
      background-color: var(--bg-color);
      color: var(--text-primary);
      line-height: 1.5;
      font-size: 15px;
    }

    /* Sidebar */
    .sidebar {
      position: fixed;
      top: 0; left: 0;
      width: var(--sidebar-w);
      height: 100vh;
      overflow-y: auto;
      border-right: 1px solid var(--border-color);
      padding: 28px 16px;
      z-index: 100;
    }
    .sidebar-header {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }
    .sidebar-title {
      font-size: 14px;
      font-weight: 600;
      font-family: var(--mono);
      color: var(--text-primary);
      line-height: 1.3;
    }
    .sidebar-tagline {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 3px;
    }
    .sidebar-links {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }
    .sidebar-links a {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      text-decoration: none;
      padding: 5px 10px;
      border-radius: 6px;
      background: var(--hover-bg);
      transition: background-color 0.15s;
    }
    .sidebar-links a:hover { background: #e8e8e8; }

    .nav-group { margin-bottom: 14px; }
    .nav-group-title {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      padding: 4px 8px;
      text-decoration: none;
      transition: color 0.15s;
    }
    .nav-group-title:hover { color: var(--text-primary); }
    .nav-group ul { list-style: none; }
    .nav-group li a {
      display: block;
      padding: 3px 8px 3px 16px;
      font-size: 13px;
      font-family: var(--mono);
      color: var(--text-secondary);
      text-decoration: none;
      border-radius: 4px;
      transition: all 0.1s;
    }
    .nav-group li a:hover {
      background: var(--hover-bg);
      color: var(--text-primary);
    }

    /* Main */
    .main {
      margin-left: var(--sidebar-w);
      max-width: 720px;
      padding: 40px 40px 80px;
    }

    /* Hero */
    .hero-header {
      margin-bottom: 40px;
      padding-bottom: 28px;
      border-bottom: 1px solid var(--border-color);
    }
    h1.hero-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    p.hero-subtitle {
      font-size: 15px;
      color: var(--text-secondary);
    }


    /* API items */
    details { outline: none; }
    summary { list-style: none; outline: none; }
    summary::-webkit-details-marker { display: none; }
    .api-item {
      padding: 28px 0;
      border-bottom: 1px solid var(--border-color);
    }
    .api-item:last-child { border-bottom: none; }
    .api-name {
      font-size: 16px;
      font-weight: 600;
      font-family: var(--mono);
      color: var(--text-primary);
      margin: 0 0 10px 0;
    }
    .api-name a {
      color: inherit;
      text-decoration: none;
    }
    .api-name a::after {
      content: ' #';
      color: var(--text-muted);
      opacity: 0;
      transition: opacity 0.15s;
      font-weight: 400;
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


    /* Marble + Code combined block */
    .api-visual {
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
    }
    .api-visual .marble-diagram {
      background: #FAFAFA;
      padding: 16px 12px;
      border-bottom: 1px solid var(--border-color);
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
      border: 1px solid var(--border-color);
      border-radius: 6px;
    }
    .api-visual .code-preview {
      border: none;
      border-radius: 0;
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

    /* Mobile */
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main { margin-left: 0; padding: 24px 16px 60px; }
    }
  </style>
</head>
<body>
  ${renderNav(categories)}
  <main class="main">
    <header class="hero-header">
      <h1 class="hero-title">@withremyinc/stream</h1>
      <p class="hero-subtitle">Composable Web Streams utilities with streaming JSON and XML parsing.</p>
    </header>
    ${categories.map(renderCategory).join("\n")}
    ${renderTypes()}
  </main>
</body>
</html>`;


mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html);
console.log("✅ docs/index.html generated");
