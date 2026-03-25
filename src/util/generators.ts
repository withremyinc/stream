// These functions have been really helpful in building out
// parsers for JSON, XML, etc...
//
// With that in mind, I'm not sure if they're ready for prime time yet.
// Thus: they're only in the util/ folder and not exported.

export const GENERATOR_END = Symbol("GENERATOR_END");

export type GeneratorWithNext<T> = Generator<T | { next: true }>;

export type GeneratorFactoryOptions<T0> = {
  peek: () => T0 | typeof GENERATOR_END;
  next: () => { next: true };
  pos: () => number;
};

export function fromGenerator<T0, T1>(
  factory: (options: GeneratorFactoryOptions<T0>) => GeneratorWithNext<T1>,
): TransformStream<T0, T1> {
  let tokens: T0[] = [];
  let closed = false;
  let idx: number = 0;

  function peek(): T0 | typeof GENERATOR_END {
    if (closed) {
      return GENERATOR_END;
    }
    if (idx >= tokens.length) {
      throw new Error("Tokens index out of range");
    }
    return tokens[idx];
  }

  function next(): { next: true } {
    idx++;
    return { next: true };
  }

  function pos(): number {
    return idx;
  }

  const generator = factory({
    peek,
    next,
    pos,
  });

  function runGeneratorUntilNeedingMoreTokens(
    controller: TransformStreamDefaultController<T1>,
  ) {
    if (idx === 0 && tokens.length === 0) {
      return;
    }
    if (idx >= tokens.length && !closed) {
      return;
    }

    while (true) {
      const { value, done } = generator.next();
      if (!value) {
        break;
      }

      if ("next" in value) {
        if (idx >= tokens.length) {
          return;
        }
      } else {
        controller.enqueue(value);
      }

      if (done) {
        return;
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
  next: () => { next: true };
  substring: (start: number, end: number) => string;
  pos: () => number;
};

export function fromStringGenerator<T1>(
  factory: (options: StringGeneratorFactoryOptions) => GeneratorWithNext<T1>,
): TransformStream<string, T1> {
  let tokens: string = "";
  let closed = false;
  let idx: number = 0;

  function peek(): string | typeof GENERATOR_END {
    if (closed) {
      return GENERATOR_END;
    }
    if (idx >= tokens.length) {
      throw new Error("Tokens index out of range");
    }
    return tokens[idx];
  }

  function next(): { next: true } {
    idx++;
    return { next: true };
  }

  function substring(start: number, end: number): string {
    return tokens.substring(start, end);
  }

  function pos(): number {
    return idx;
  }

  const generator = factory({
    peek,
    next,
    substring,
    pos,
  });

  function runGeneratorUntilNeedingMoreTokens(
    controller: TransformStreamDefaultController<T1>,
  ) {
    if (idx === 0 && tokens.length === 0) {
      return;
    }
    if (idx >= tokens.length && !closed) {
      return;
    }

    while (true) {
      const { value, done } = generator.next();
      if (!value) {
        break;
      }

      if ("next" in value) {
        if (idx >= tokens.length) {
          return;
        }
      } else {
        controller.enqueue(value);
      }

      if (done) {
        return;
      }
    }
  }

  return new TransformStream<string, T1>({
    start(controller) {
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
