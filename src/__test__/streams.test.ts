import { describe, it, expect } from "vitest";

import { collect } from "../collects";
import { arrayStream } from "../streams"; // Helper for testing

describe("streams", () => {
  describe("arrayStream", () => {
    it("should create a ReadableStream from an array", async () => {
      const data = [1, 2, 3];
      const stream = arrayStream(data);
      const result = await collect(stream);
      expect(result).toEqual(data);
    });

    it("should create an empty stream from an empty array", async () => {
      const data: string[] = [];
      const stream = arrayStream(data);
      const result = await collect(stream);
      expect(result).toEqual([]);
    });

    it("should handle different data types", async () => {
      const data = [{ id: 1 }, { id: 2 }];
      const stream = arrayStream(data);
      const result = await collect(stream);
      expect(result).toEqual(data);
    });
  });
});
