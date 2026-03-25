import { describe, it, expect } from "vitest";

import {
  collect,
  collectToString,
  collectFirst,
  collectLast,
} from "../collects";
import { arrayStream } from "../streams"; // Helper to create streams

describe("collects", () => {
  describe("collect", () => {
    it("should collect all chunks from a stream into an array", async () => {
      const stream = arrayStream([1, 2, 3]);
      const result = await collect(stream);
      expect(result).toEqual([1, 2, 3]);
    });

    it("should return an empty array for an empty stream", async () => {
      const stream = arrayStream([]);
      const result = await collect(stream);
      expect(result).toEqual([]);
    });
  });

  describe("collectToString", () => {
    it("should collect all string chunks into a single string", async () => {
      const stream = arrayStream(["hello", " ", "world"]);
      const result = await collectToString(stream);
      expect(result).toBe("hello world");
    });

    it("should return an empty string for an empty stream", async () => {
      const stream = arrayStream([]);
      const result = await collectToString(stream);
      expect(result).toBe("");
    });
  });

  describe("collectFirst", () => {
    it("should return the first chunk of the stream", async () => {
      const stream = arrayStream([10, 20, 30]);
      const result = await collectFirst(stream);
      expect(result).toBe(10);
    });

    it("should return undefined for an empty stream", async () => {
      const stream = arrayStream([]);
      const result = await collectFirst(stream);
      expect(result).toBeUndefined();
    });
  });

  describe("collectLast", () => {
    it("should return the last chunk of the stream", async () => {
      const stream = arrayStream([10, 20, 30]);
      const result = await collectLast(stream);
      expect(result).toBe(30);
    });

    it("should return the only chunk if the stream has one item", async () => {
      const stream = arrayStream([5]);
      const result = await collectLast(stream);
      expect(result).toBe(5);
    });

    it("should return undefined for an empty stream", async () => {
      const stream = arrayStream([]);
      const result = await collectLast(stream);
      expect(result).toBeUndefined();
    });
  });
});
