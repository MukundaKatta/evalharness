/**
 * Tests for AssertionEngine.
 */

import { AssertionEngine, AssertionConfig } from "../src/assertions";

describe("AssertionEngine", () => {
  let engine: AssertionEngine;

  beforeEach(() => {
    engine = new AssertionEngine();
  });

  describe("containsText", () => {
    test("passes when text is found", async () => {
      const result = await engine.evaluate(
        { type: "containsText", value: "hello" },
        "Say hello world!"
      );
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    test("fails when text is not found", async () => {
      const result = await engine.evaluate(
        { type: "containsText", value: "goodbye" },
        "Hello world"
      );
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    test("is case insensitive by default", async () => {
      const result = await engine.evaluate(
        { type: "containsText", value: "HELLO" },
        "hello world"
      );
      expect(result.passed).toBe(true);
    });
  });

  describe("notContainsText", () => {
    test("passes when text is absent", async () => {
      const result = await engine.evaluate(
        { type: "notContainsText", value: "secret" },
        "This is a normal response"
      );
      expect(result.passed).toBe(true);
    });

    test("fails when text is present", async () => {
      const result = await engine.evaluate(
        { type: "notContainsText", value: "secret" },
        "The secret is revealed"
      );
      expect(result.passed).toBe(false);
    });
  });

  describe("matchesRegex", () => {
    test("passes on match", async () => {
      const result = await engine.evaluate(
        { type: "matchesRegex", value: "\\d{3}-\\d{4}" },
        "Call 555-1234 today"
      );
      expect(result.passed).toBe(true);
    });

    test("fails on no match", async () => {
      const result = await engine.evaluate(
        { type: "matchesRegex", value: "^\\d+$" },
        "not a number"
      );
      expect(result.passed).toBe(false);
    });
  });

  describe("jsonSchemaValid", () => {
    test("passes for valid JSON matching schema", async () => {
      const schema = {
        type: "object",
        required: ["name", "age"],
        properties: {
          name: { type: "string" },
          age: { type: "number", minimum: 0 },
        },
      };
      const result = await engine.evaluate(
        { type: "jsonSchemaValid", value: schema },
        '{"name": "Alice", "age": 30}'
      );
      expect(result.passed).toBe(true);
    });

    test("fails for invalid JSON", async () => {
      const result = await engine.evaluate(
        { type: "jsonSchemaValid", value: { type: "object" } },
        "not json at all"
      );
      expect(result.passed).toBe(false);
    });

    test("fails for missing required field", async () => {
      const schema = { type: "object", required: ["name"] };
      const result = await engine.evaluate(
        { type: "jsonSchemaValid", value: schema },
        '{"age": 30}'
      );
      expect(result.passed).toBe(false);
    });
  });

  describe("isFactual", () => {
    test("scores high for factual response", async () => {
      const reference = "Paris is the capital of France. It has the Eiffel Tower.";
      const result = await engine.evaluate(
        { type: "isFactual", value: reference, threshold: 0.3 },
        "The capital of France is Paris, known for the Eiffel Tower."
      );
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe("toxicityBelow", () => {
    test("passes for clean text", async () => {
      const result = await engine.evaluate(
        { type: "toxicityBelow", threshold: 0.5 },
        "The weather today is sunny and pleasant."
      );
      expect(result.passed).toBe(true);
    });

    test("detects toxic content", async () => {
      const result = await engine.evaluate(
        { type: "toxicityBelow", threshold: 0.1 },
        "All those people should die and be eliminated for being stupid people."
      );
      expect(result.passed).toBe(false);
    });
  });

  describe("lengthBetween", () => {
    test("passes when within range", async () => {
      const result = await engine.evaluate(
        { type: "lengthBetween", value: { min: 5, max: 100 } },
        "Hello world"
      );
      expect(result.passed).toBe(true);
    });

    test("fails when too short", async () => {
      const result = await engine.evaluate(
        { type: "lengthBetween", value: { min: 50 } },
        "Hi"
      );
      expect(result.passed).toBe(false);
    });
  });

  describe("isJson", () => {
    test("passes for valid JSON", async () => {
      const result = await engine.evaluate({ type: "isJson" }, '{"key": "value"}');
      expect(result.passed).toBe(true);
    });

    test("fails for invalid JSON", async () => {
      const result = await engine.evaluate({ type: "isJson" }, "not json");
      expect(result.passed).toBe(false);
    });
  });

  describe("containsAllOf", () => {
    test("passes when all items present", async () => {
      const result = await engine.evaluate(
        { type: "containsAllOf", value: ["apple", "banana"] },
        "I like apple and banana"
      );
      expect(result.passed).toBe(true);
    });

    test("fails when some missing", async () => {
      const result = await engine.evaluate(
        { type: "containsAllOf", value: ["apple", "cherry"] },
        "I like apple"
      );
      expect(result.passed).toBe(false);
    });
  });

  describe("containsAnyOf", () => {
    test("passes when at least one found", async () => {
      const result = await engine.evaluate(
        { type: "containsAnyOf", value: ["cat", "dog"] },
        "I have a dog"
      );
      expect(result.passed).toBe(true);
    });

    test("fails when none found", async () => {
      const result = await engine.evaluate(
        { type: "containsAnyOf", value: ["cat", "dog"] },
        "I have a fish"
      );
      expect(result.passed).toBe(false);
    });
  });

  describe("negate", () => {
    test("negates a passing assertion", async () => {
      const result = await engine.evaluate(
        { type: "containsText", value: "hello", negate: true },
        "hello world"
      );
      expect(result.passed).toBe(false);
    });
  });

  describe("semanticSimilarity", () => {
    test("returns error without embedding function", async () => {
      const result = await engine.evaluate(
        { type: "semanticSimilarity", value: "test", threshold: 0.8 },
        "test response"
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain("No embedding function");
    });

    test("works with mock embedding function", async () => {
      const mockEmbed = async (text: string): Promise<number[]> => {
        // Simple hash-based mock embedding
        let hash = 0;
        for (const ch of text) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
        return Array.from({ length: 8 }, (_, i) => Math.sin(hash + i));
      };
      engine.setEmbeddingFunction(mockEmbed);

      const result = await engine.evaluate(
        { type: "semanticSimilarity", value: "hello world", threshold: 0.5 },
        "hello world"
      );
      expect(result.score).toBe(1); // Same text = same embedding = similarity 1.0
      expect(result.passed).toBe(true);
    });
  });

  describe("unknown assertion type", () => {
    test("returns failed result", async () => {
      const result = await engine.evaluate(
        { type: "nonExistentType", value: "x" },
        "response"
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain("Unknown");
    });
  });
});
