---
name: thinking-in-streams
description: How to write streaming code — composable TransformStream factories, real backpressure, chunk-boundary handling, and incremental LLM/JSON/XML parsing with @withremyinc/stream. Use when writing, reviewing, or refactoring anything that streams — LLM and agent responses, tool-call argument deltas, SSE or HTTP streaming endpoints, incremental parsers, progressive rendering — or any code touching TransformStream, ReadableStream, WritableStream, pipeThrough/pipeTo/getWriter/getReader, or importing from @withremyinc/stream.
---

# Thinking in Streams

A streaming feature is **one unbroken chain of `TransformStream`s** from the producer (usually a
model API) to the consumer (usually a socket). Your job is to add stages to that chain — not to build
a new stream from scratch, and never to take the chain apart and reassemble it by hand. Web Streams
already give you backpressure, cancellation, and error propagation, wired end to end. Every wrapper
you introduce is a place to lose all three.

## The default shape

A stage is a **`<domain>Transform` function that returns a `TransformStream`**. Nothing else.

```ts
export function summaryTransform(options: Options): TransformStream<Delta, Summary> {
  let seen = 0; // per-instance state lives in the closure
  return new TransformStream({
    transform(chunk, controller) {
      /* ... */
    },
    flush(controller) {
      /* end of input is a real state — handle it */
    },
  });
}
```

When a stage is itself several stages, compose and return the composition. Callers cannot tell the
difference, so `answerTransform` stays as composable as any single stage:

```ts
export function answerTransform(ctx: Ctx): TransformStream<string, AnswerEvent> {
  return pipeThrough(
    extractXML({ allowTags: ['answer'], textMode: 'delta' }),
    parseJSON({ emitPartialStrings: true }),
    jsonToJSObject(),
    answerEventTransform(ctx),
  );
}
```

Requirements:

- **Name it `<domain>Transform`.** Domain in the prefix, `Transform` as the suffix:
  `answerTransform`, `summaryTransform`, `sseTransform`. Not `parseAnswers` (reads like it returns a
  value), not `createAnswerTransformStream` (ceremony). The suffix makes a call site self-evident and
  keeps stages visually distinct from the plain functions around them.
- **Annotate `TransformStream<In, Out>` explicitly.** The types are the documentation.
- **All mutable state in the closure.** A call returns a fresh, independent instance. Never share one
  instance across two pipelines, and never hoist a `TransformStream` to module scope — streams are
  single-use.
- **No side effects at construction.** Building the stage must not start work.

If a pipeline is inlined into a 200-line function, extract it. `domainTransform()` composes; a block
of plumbing does not.

> `pipeThrough(...)` uses native stream composition, so thrown errors reach the consumer and
> cancellation propagates through every composed stage.
>
> **Any pipeline promise you intend to observe _later_ needs a rejection handler immediately** — a
> side branch's `done`, a lifecycle object's `outcome` — because the rejection is otherwise unhandled
> during the window between the throw and your later `await`. Park a no-op handler on it at creation
> and keep awaiting the real one where you always did:
>
> ```ts
> const done = branch.readable.pipeTo(sink);
> void done.catch(() => undefined); // observed now; the real await still reports it
> ```

## The rules

### 1. Don't break the chain

`pipeThrough` and `pipeTo` propagate backpressure, cancellation, and errors. Nothing else does. The
chain must run continuously from producer to consumer.

Break it — with a hand-rolled source, a detached writer, or an accumulate-then-emit step — and the
producer runs flat out into an unbounded queue. Memory grows to the size of the full response,
disconnects stop propagating, and a stalled consumer becomes a leak instead of a pause. Nothing
throws; it just degrades under load, which is why it survives review.

**Smell:** the stream ends in the middle of a function and something else begins.

(One inherent exception: `tee()` buffers for the slower branch by design — it pulls whenever _either_
branch has demand. That is correct for two independent consumers and a silent regression when one
branch is a slow side effect you meant to keep ordered against the other. Rule 3 has the measurement
and the alternative.)

### 2. Never re-wrap a stream you were handed

Model APIs hand you a `ReadableStream`. Transform it.

```ts
// WRONG — an adapter that adds nothing, forwards nothing, and buffers without bound.
const wrapped = new ReadableStream({
  async start(controller) {
    for await (const part of llmStream) controller.enqueue(transform(part));
  },
});

// RIGHT
const wrapped = llmStream.pipeThrough(map(transform));
```

The wrong version drains the model as fast as it will emit regardless of whether anyone downstream is
reading, and drops cancellation on the floor. `new ReadableStream({...})` is correct **only** when
you are the original source — bridging a WebSocket, an event emitter, a poller.

### 3. Reach for `getWriter()` last

`getWriter()` is a strong smell. Reaching for it usually means hand-building a pipe the platform
already builds correctly, and every hand-built pipe re-implements close, abort, cancel, and error
propagation — which is why the code around a writer is almost always several times longer than the
code that replaces it. Treat it as a last resort you have to justify, not a tool.

It shows up in five situations. All five have a direct answer, and the fifth is the one people miss:

**"I need to connect two streams."** Pipe them. This is the whole API. Five lines of
`getWriter()` / `write` / `close` / `pipeTo(sink)` / `await done` is
`await upstream.pipeThrough(parser).pipeTo(sink)`.

**"I need a value out of the pipeline."** Collect it. A `WritableStream` whose `write` assigns a
captured `let` is a collector someone wrote by hand — use `collectLast(pipeline.readable)`.

> **`collectLast` resolves only on success.** If the stream throws mid-way, it rejects and the last
> value it saw is gone. When you need that value on the failure path — the usual reason is retracting
> provisional side effects the stream already performed — collect it with a tap instead:
>
> ```ts
> // Keeps the last snapshot even when a later chunk throws.
> let last: Snapshot | undefined;
> const done = pipeline.readable
>   .pipeThrough(
>     forEach<Snapshot>((v) => {
>       last = v;
>     }),
>   )
>   .pipeTo(new WritableStream());
> ```
>
> That is a `forEach` tap plus an empty drain, not a capturing sink — the chain stays intact and the
> value survives the error. Reach for it only when the failure path actually needs the value;
> otherwise `collectLast` reads better.

**"I need to fan out to two independent consumers."** That is `tee()`:

```ts
upstream.pipeThrough(
  tee((toMain, toSide) =>
    merge([toMain.pipeThrough(mainTransform()), toSide.pipeThrough(sideTransform())]),
  ),
);
```

**`tee()` is only correct when both branches can consume independently.** It is not a way to sequence
a side effect against forwarding. Native `tee()` pulls whenever _either_ branch has demand, so a fast
main branch drains the source while a slow branch's queue grows without bound. Measured, with a slow
side branch:

```
tee     produce:0 produce:1 down:0 produce:2 down:1 ... down:4  side:0 side:1 side:2 side:3 side:4
```

Every side effect runs _after_ the entire source has been produced and forwarded. This is the same
property rule 1 notes as inherent to `tee()` — it is fine when the branches are genuinely
independent, and a silent regression when they are not.

If the side branch is pure side effects and emits nothing, `forEach(fn)` is simpler — it awaits `fn`
and passes the chunk through, so the effect stays in the chain and backpressures the producer. But
`forEach` takes a **function**: it cannot host a stateful multi-stage pipeline, and it has no
`flush()` hook, so it is the wrong tool whenever the branch is itself a parser chain or needs an
end-of-input state.

**"I need to feed a sub-pipeline with backpressure while still forwarding downstream."** This is the
case that looks like it requires a writer, and does not. Feed the branch with a one-element `pipeTo`
from inside `transform`:

```ts
const branch = sideTransform();
const done = branch.readable.pipeTo(sink);
// Keep the branch's failure observed until `flush`/`cancel` gets to it — see the promise note
// under "The default shape".
void done.catch(() => undefined);

return new TransformStream({
  async transform(chunk, controller) {
    await arrayStream([chunk]).pipeTo(branch.writable, { preventClose: true });
    controller.enqueue(chunk);
  },
  async flush() {
    await branch.writable.close().catch(() => undefined);
    await done;
  },
  async cancel(reason) {
    await branch.writable.abort(reason).catch(() => undefined);
  },
});
```

`arrayStream([chunk]).pipeTo(writable, { preventClose: true })` is the writer-free equivalent of
`await writer.write(chunk)`: it awaits the sink's demand, so the branch's cost propagates back to the
producer, and the effect stays ordered against the forward. `preventClose` is what lets you feed the
same writable again on the next chunk. Measured against the same slow branch as above:

```
pipeTo  produce:0 produce:1 side:0 down:0 produce:2 side:1 down:1 ... side:4 down:4
```

Note `cancel` — without it, an aborted pipeline leaves the branch open and its promise pending
forever. (`Transformer.cancel` is typed against Node's stream types but is still missing from
TypeScript's DOM lib, so browser-targeted code may need a widened local to declare it. The hook fires
either way.)

**"I am the origin — my data comes from an event emitter / socket / callback API."** That is the case
rule 2 carves out for `new ReadableStream({ start, pull, cancel })`. Build the source as a
`ReadableStream` and hand _that_ to the pipeline. `pull` and `cancel` are what make it respect
backpressure and stop when the consumer goes away — exactly what a writer loop cannot give you.

**If you have a stream, pipe it; if you are making one, make a `ReadableStream`; if you are feeding
one, feed it with `pipeTo`.** Between those three, nearly every writer disappears.

"Nearly" is honest rather than absolute. A demultiplexer — one stream fanning out to N sinks that do
not exist until their first chunk arrives — has no combinator, and the one-element `pipeTo` above is
what covers it (hold the branch's `writable`, not a writer). If you do land somewhere none of these
fit, the bar is a comment at the site saying which property the writer buys that piping cannot, and
ideally a test that measures it. "It was easier to write" is not that property.

One mechanism worth knowing, because it is what makes hand-built pipes leak: **`flush()` does not run
when a stream is cancelled or aborted** — only on normal close. So a writer you close in `flush()` is
never closed on cancel, and the pipeline behind it never settles. Piping has no equivalent hole:
cancellation propagates upstream on its own.

(Draining is fine: `pipeTo(new WritableStream())` discards output while keeping the chain intact. The
smell is a sink with a body that captures something. `collect()` is _not_ a drain — it buffers the
whole run into an array — so don't reach for it just to await completion.)

### 4. Chunks should be keyed objects

Bare strings force every downstream stage to re-derive what it is looking at, and a stage that
guesses from shape breaks the moment you add a case. Use a discriminated union — the convention the
library's own parsers use:

```ts
type AnswerEvent =
  | { type: 'onAnswerBegin'; id: string }
  | { type: 'onAnswerText'; id: string; delta: string }
  | { type: 'onAnswerEnd'; id: string };
```

One stream can then carry several logical channels, `switch (chunk.type)` stays exhaustive under
TypeScript, and adding an event type doesn't change any existing stage's signature. `mergeKeyed`
preserves the label when merging sources.

A stage handing a summary to a non-stream caller may emit a single result chunk from `flush()` — that
is a legitimate terminal handoff, not an accumulate-then-emit smell, because nothing continues
downstream. Tag it like any other chunk (`{ type: 'onComplete', ... }`) so the stage can grow a second
event later without changing its signature.

### 5. Emit as soon as the meaning is known; buffer only when it is not

Latency is the whole point. Hold data back only when more input could change what it means, retain
the minimum needed to decide, and bound every buffer.

For LLM streams that means `parseJSON({ emitPartialStrings: true })` and
`parseXML({ textMode: 'delta' })` — waiting for a closing quote turns a 2 KB argument into a 2 KB
pause. See `references/chunk-boundaries.md`.

The flip side: a parser emits on every change, which can be far more often than an expensive effect
should fire. **Reduce on meaning, not on a clock** — `filter` out snapshots whose relevant fields did
not change, and let the awaited effect do the pacing. A wall-clock throttle is a legitimate answer
only for a sink that is genuinely rate-limited (a repaint budget, an API quota); when you need one,
make it a named stage rather than an `if (now - last < 50) return` buried inside the effect, so what
it drops is visible.

### 6. One parse, one renderer

Never stream for display and then re-parse the buffered text to "commit" it. One parser, running
incrementally; the committed value is its last emission. This is why `jsonToJSObject()` emits on
every change.

The same applies to the write side: provisional and canonical paths must share one payload builder.
When they fork, every shape change gets made twice, they drift, and the user watches the canonical
render replace the streamed one — the jumpscare.

And be permissive — LLM output is malformed constantly, so heal it rather than rejecting it. See
`references/permissive-parsing.md`.

### 7. Stream all the way to the consumer

The chain ends at the thing the user observes — never at a variable something else picks up later.
Collecting a response into memory and re-emitting it is not streaming; it is a slower non-streaming
endpoint.

For an HTTP endpoint that means SSE, with the frames built as one more transform so the
`ReadableStream` reaches the response body directly. When the terminal consumer is not an HTTP body —
a database, a canvas, a socket to another service — the rule is unchanged: the final stage performs
the observable effect and _awaits_ it, so its cost propagates back up the chain to the producer.

### 8. Use the library

`@withremyinc/stream` covers the functional transforms, combinators, collectors, and incremental
JSON/XML/frontmatter/fence parsers. Hand-writing a `TransformStream` whose `transform` just calls
`controller.enqueue(f(chunk))` means you did not check.

Read `references/library.md` before writing any stage — it opens with a table mapping "the thing you
were about to hand-roll" to the function that already does it.

## A complete example

A chat endpoint. The model returns frontmatter metadata followed by a markdown body; the client
renders the body live over SSE, and the finished reply is persisted. Every rule above is visible
here.

```ts
// Keyed chunks — the pipeline's vocabulary (rule 4).
type ReplyEvent = { type: 'onMeta'; meta: ReplyMeta } | { type: 'onBody'; text: string }; // cumulative snapshot, not a delta

/** Frontmatter events -> domain events. Pure; all state in the closure. */
function replyEventTransform(): TransformStream<FrontmatterExtractOutput, ReplyEvent> {
  let body = '';
  return new TransformStream({
    transform(event, controller) {
      if (event.type === 'onFrontmatter') {
        controller.enqueue({ type: 'onMeta', meta: parseMeta(event.raw) });
        return;
      }
      body += event.value; // emit early: partial body is real output (rule 5)
      controller.enqueue({ type: 'onBody', text: body });
    },
    flush() {
      // End of input is a state. Invariants belong here, checked against what
      // the stream already accumulated — not against a re-read buffer (rule 6).
      if (body.trim().length === 0) throw new Error('reply body must not be empty');
    },
  });
}

/** Raw model text -> reply events. */
export function replyTransform(): TransformStream<string, ReplyEvent> {
  return pipeThrough(extractFrontmatter(), replyEventTransform());
}

/** Persistence as a pass-through stage — one commit path, no reparse (rule 6). */
function persistTransform(db: Db, id: string): TransformStream<ReplyEvent, ReplyEvent> {
  let latest = '';
  return new TransformStream({
    async transform(event, controller) {
      if (event.type === 'onBody') {
        latest = event.text;
        await db.upsertDraft(id, event.text); // awaited → DB cost backpressures the model
      }
      controller.enqueue(event);
    },
    async flush() {
      if (latest) await db.finalize(id, latest); // same snapshot the client saw
    },
  });
}

function sseTransform(): TransformStream<ReplyEvent, string> {
  return map((event: ReplyEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

// One chain, provider to socket. No getWriter, no collect, no second parse.
export async function POST(req: Request): Promise<Response> {
  const { textStream } = streamText({ model, prompt: await req.text() });
  return new Response(
    textStream
      .pipeThrough(replyTransform())
      .pipeThrough(persistTransform(db, id))
      .pipeThrough(sseTransform())
      .pipeThrough(new TextEncoderStream()),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
```

What to notice: the model's `ReadableStream` is transformed, never wrapped. Persistence is a stage in
the chain rather than a separate commit pass, so the finalized value is the same snapshot the client
saw. The client disconnecting cancels the chain all the way back to the model. And there is no point
in the file where a value leaves the stream and re-enters it.

## Leaving the pipeline

Streams are backpressure, not a religion. At a genuine terminal edge — a test, or a caller that truly
needs the whole value — use the collectors or consume with `for await`. What makes that fine is that
nothing continues downstream; collect and then re-emit, and you have inserted an unbounded buffer
mid-pipeline.

## Review checklist

- [ ] Each stage is a `<domain>Transform` function returning `TransformStream<In, Out>`.
- [ ] No `new ReadableStream` except at a true origin.
- [ ] No `getWriter()` in production code, or a comment naming the property piping cannot buy.
      (Tests driving a transform's writable are fine.)
- [ ] No `WritableStream` sink with a body that captures something (use `collectLast`, or a `forEach`
      tap + drain when the failure path needs the last value).
- [ ] Every side-branch promise observed later has a `void p.catch(() => undefined)` parked on it.
- [ ] Unbroken `pipeThrough`/`pipeTo` from producer to the observable effect.
- [ ] Chunks are keyed/discriminated objects.
- [ ] Nothing is re-parsed after the stream ends; the last snapshot is the committed value.
- [ ] Provisional and canonical writes share one payload builder.
- [ ] `emitPartialStrings` / `textMode: 'delta'` set wherever output is rendered live.
- [ ] Every retained buffer is bounded and every `flush()` case is handled.
- [ ] No hand-rolled stage that duplicates a library function.
- [ ] Tests feed the same input under several chunk splits, including one character at a time.

## References

- `references/library.md` — the `@withremyinc/stream` API, and what not to hand-roll.
- `references/chunk-boundaries.md` — the residue pattern, the suspendable-generator pattern, and how
  to test splits.
- `references/permissive-parsing.md` — one parse path, and healing malformed LLM output.

A project may also keep its own map of where these rules are followed and violated in its codebase.
If one exists, it will be linked from the project's agent instructions (`AGENTS.md` / `CLAUDE.md`).
