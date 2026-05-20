// These functions have been really helpful in building out
// parsers for JSON, XML, etc...
//
// With that in mind, I'm not sure if they're ready for prime time yet.
// Thus: they're only in the util/ folder and not exported.

export const GENERATOR_END = Symbol("GENERATOR_END");

type NextSignal = { next: true };
type NeedMoreTokensSignal = { needMoreTokens: true };

export type GeneratorWithNext<TYield, TNext = unknown, TReturn = void> = Generator<
  TYield | NextSignal | NeedMoreTokensSignal,
  TReturn,
  TNext
>;

const TOKEN_COMPACT_THRESHOLD = 4_096;
const STRING_COMPACT_THRESHOLD = 256;

export type GeneratorFactoryOptions<T0> = {
  peek: () => T0 | typeof GENERATOR_END;
  next: () => NextSignal;
  pos: () => number;
};

function isNextSignal<T>(value: T | NextSignal | undefined): value is NextSignal {
  return value !== null && value !== undefined && typeof value === "object" && "next" in value;
}

function isNeedMoreTokensSignal<T>(
  value: T | NeedMoreTokensSignal | undefined,
): value is NeedMoreTokensSignal {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    "needMoreTokens" in value
  );
}

export function fromGenerator<T0, T1>(
  factory: (options: GeneratorFactoryOptions<T0>) => GeneratorWithNext<T1>,
): TransformStream<T0, T1> {
  let tokens: T0[] = [];
  let closed = false;
  let idx = 0;
  let base = 0;

  function relativePos(position: number = idx): number {
    return position - base;
  }

  function peek(): T0 | typeof GENERATOR_END {
    const relative = relativePos();
    if (relative < 0) {
      throw new Error("Tokens index fell behind compacted buffer");
    }
    if (relative < tokens.length) {
      return tokens[relative];
    }
    if (closed) {
      return GENERATOR_END;
    }
    throw new Error("Tokens index out of range");
  }

  function next(): NextSignal {
    idx++;
    return { next: true };
  }

  function pos(): number {
    return idx;
  }

  function compactTokens() {
    const consumed = idx - base;
    if (consumed < TOKEN_COMPACT_THRESHOLD) {
      return;
    }
    tokens = tokens.slice(consumed);
    base = idx;
  }

  const generator = factory({
    peek,
    next,
    pos,
  });

  function runGeneratorUntilNeedingMoreTokens(
    controller: TransformStreamDefaultController<T1>,
  ) {
    if (idx === base && tokens.length === 0) {
      return;
    }
    if (relativePos() >= tokens.length && !closed) {
      return;
    }

    while (true) {
      const { value, done } = generator.next();
      if (done) {
        compactTokens();
        return;
      }

      if (isNextSignal(value)) {
        compactTokens();
        if (relativePos() >= tokens.length && !closed) {
          return;
        }
      } else if (isNeedMoreTokensSignal(value)) {
        compactTokens();
        if (!closed) {
          return;
        }
      } else {
        controller.enqueue(value as T1);
      }
    }
  }

  return new TransformStream<T0, T1>({
    start(controller) {
      runGeneratorUntilNeedingMoreTokens(controller);
    },
    transform(chunk, controller) {
      tokens.push(chunk);
      runGeneratorUntilNeedingMoreTokens(controller);
    },
    async flush(controller) {
      closed = true;
      runGeneratorUntilNeedingMoreTokens(controller);
    },
  });
}

export type StringGeneratorFactoryOptions = {
  peek: () => string | typeof GENERATOR_END;
  next: () => NextSignal;
  substring: (start: number, end: number) => string;
  pos: () => number;
  retainFrom: (position: number) => void;
  resumedAfterInputExhaustion: () => boolean;
  waitForMoreTokens: () => NeedMoreTokensSignal;
  inputExhausted: () => boolean;
  isClosed: () => boolean;
};

export function fromStringGenerator<T1>(
  factory: (options: StringGeneratorFactoryOptions) => GeneratorWithNext<T1>,
): TransformStream<string, T1> {
  let tokens = "";
  let closed = false;
  let idx = 0;
  let base = 0;
  let retainedFrom = 0;

  function relativePos(position: number = idx): number {
    return position - base;
  }

  function peek(): string | typeof GENERATOR_END {
    const relative = relativePos();
    if (relative < 0) {
      throw new Error("String index fell behind compacted buffer");
    }
    if (relative < tokens.length) {
      return tokens[relative];
    }
    if (closed) {
      return GENERATOR_END;
    }
    throw new Error("Tokens index out of range");
  }

  function next(): NextSignal {
    idx++;
    return { next: true };
  }

  function substring(start: number, end: number): string {
    const relativeStart = relativePos(start);
    const relativeEnd = relativePos(end);
    if (relativeStart < 0 || relativeEnd < 0) {
      throw new Error("Substring position fell behind compacted buffer");
    }
    return tokens.substring(relativeStart, relativeEnd);
  }

  function pos(): number {
    return idx;
  }

  function retainFrom(position: number) {
    retainedFrom = position;
  }

  function waitForMoreTokens(): NeedMoreTokensSignal {
    return { needMoreTokens: true };
  }

  function compactTokens() {
    const retain = Math.min(retainedFrom, idx);
    const drop = retain - base;
    if (drop < STRING_COMPACT_THRESHOLD) {
      return;
    }
    tokens = tokens.slice(drop);
    base = retain;
  }

  let resumeInputExhausted = false;

  function resumedAfterInputExhaustion(): boolean {
    return resumeInputExhausted;
  }

  const generator = factory({
    peek,
    next,
    substring,
    pos,
    retainFrom,
    resumedAfterInputExhaustion,
    waitForMoreTokens,
    inputExhausted: () => relativePos() >= tokens.length && !closed,
    isClosed: () => closed,
  });

  function runGeneratorUntilNeedingMoreTokens(
    controller: TransformStreamDefaultController<T1>,
  ) {
    if (idx === base && tokens.length === 0) {
      return;
    }
    if (relativePos() >= tokens.length && !closed) {
      return;
    }

    while (true) {
      const { value, done } = generator.next();
      resumeInputExhausted = false;
      if (done) {
        compactTokens();
        return;
      }

      if (isNextSignal(value)) {
        compactTokens();
        if (relativePos() >= tokens.length && !closed) {
          resumeInputExhausted = true;
          return;
        }
      } else if (isNeedMoreTokensSignal(value)) {
        compactTokens();
        if (!closed) {
          resumeInputExhausted = true;
          return;
        }
      } else {
        controller.enqueue(value as T1);
      }
    }
  }

  return new TransformStream<string, T1>({
    start(controller) {
      retainedFrom = idx;
      runGeneratorUntilNeedingMoreTokens(controller);
    },
    transform(chunk, controller) {
      tokens += chunk;
      runGeneratorUntilNeedingMoreTokens(controller);
    },
    async flush(controller) {
      closed = true;
      runGeneratorUntilNeedingMoreTokens(controller);
    },
  });
}
