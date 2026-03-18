/**
 * YAML config parser for test definitions.
 */

import type { AssertionConfig } from "./assertions";

export interface TestCase {
  id: string;
  name: string;
  prompt: string;
  assertions: AssertionConfig[];
  variables?: Record<string, string | number>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tags?: string[];
  timeout?: number;
}

export interface TestSuiteConfig {
  name: string;
  description?: string;
  providers?: string[];
  defaultSystemPrompt?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  tests: TestCase[];
  metadata?: Record<string, unknown>;
}

/**
 * Simple YAML parser: handles the subset of YAML needed for test configs.
 * Supports: mappings, sequences, strings, numbers, booleans, multi-line strings.
 */
function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "~" || trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  // Remove surrounding quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  // Inline JSON array or object
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  return trimmed;
}

interface YamlNode {
  [key: string]: unknown;
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Minimal YAML parser sufficient for test configs.
 */
function parseYaml(text: string): unknown {
  const lines = text.split("\n");
  let idx = 0;

  function skipEmpty(): void {
    while (idx < lines.length) {
      const line = lines[idx].trim();
      if (line === "" || line.startsWith("#")) { idx++; continue; }
      break;
    }
  }

  function parseBlock(minIndent: number): unknown {
    skipEmpty();
    if (idx >= lines.length) return null;

    const firstLine = lines[idx];
    const firstTrimmed = firstLine.trim();

    // Check if it's a sequence
    if (firstTrimmed.startsWith("- ")) {
      return parseSequence(minIndent);
    }

    // Check if it's a mapping
    if (firstTrimmed.includes(":")) {
      return parseMapping(minIndent);
    }

    idx++;
    return parseYamlValue(firstTrimmed);
  }

  function parseSequence(minIndent: number): unknown[] {
    const result: unknown[] = [];
    while (idx < lines.length) {
      skipEmpty();
      if (idx >= lines.length) break;
      const line = lines[idx];
      const indent = getIndent(line);
      if (indent < minIndent) break;
      const trimmed = line.trim();
      if (!trimmed.startsWith("- ")) break;

      const after = trimmed.slice(2).trim();
      idx++;

      if (after.includes(":") && !after.startsWith('"') && !after.startsWith("'")) {
        // Inline mapping start — reparse
        const obj: YamlNode = {};
        const colonIdx = after.indexOf(":");
        const key = after.slice(0, colonIdx).trim();
        const val = after.slice(colonIdx + 1).trim();
        if (val) {
          obj[key] = parseYamlValue(val);
        } else {
          obj[key] = parseBlock(indent + 2);
        }
        // Continue reading keys at deeper indent
        while (idx < lines.length) {
          skipEmpty();
          if (idx >= lines.length) break;
          const nextLine = lines[idx];
          const nextIndent = getIndent(nextLine);
          if (nextIndent <= indent) break;
          const nextTrimmed = nextLine.trim();
          if (nextTrimmed.startsWith("- ")) break;
          const ci = nextTrimmed.indexOf(":");
          if (ci === -1) break;
          const k = nextTrimmed.slice(0, ci).trim();
          const v = nextTrimmed.slice(ci + 1).trim();
          idx++;
          if (v) {
            obj[k] = parseYamlValue(v);
          } else {
            obj[k] = parseBlock(nextIndent + 2);
          }
        }
        result.push(obj);
      } else {
        result.push(parseYamlValue(after));
      }
    }
    return result;
  }

  function parseMapping(minIndent: number): YamlNode {
    const result: YamlNode = {};
    while (idx < lines.length) {
      skipEmpty();
      if (idx >= lines.length) break;
      const line = lines[idx];
      const indent = getIndent(line);
      if (indent < minIndent) break;
      const trimmed = line.trim();
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) break;

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      idx++;

      if (value) {
        result[key] = parseYamlValue(value);
      } else {
        result[key] = parseBlock(indent + 2);
      }
    }
    return result;
  }

  return parseBlock(0);
}

/**
 * Parse a YAML config string into a TestSuiteConfig.
 */
export function parseConfig(yamlContent: string): TestSuiteConfig {
  const raw = parseYaml(yamlContent) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid YAML config: expected a mapping at root level");
  }

  const tests: TestCase[] = [];
  const rawTests = (raw["tests"] as Array<Record<string, unknown>>) ?? [];

  for (let i = 0; i < rawTests.length; i++) {
    const t = rawTests[i];
    const assertions: AssertionConfig[] = [];
    const rawAssertions = (t["assertions"] as Array<Record<string, unknown>>) ?? [];
    for (const a of rawAssertions) {
      assertions.push({
        type: String(a["type"] ?? "containsText"),
        value: a["value"],
        threshold: a["threshold"] as number | undefined,
        negate: a["negate"] as boolean | undefined,
      });
    }

    tests.push({
      id: String(t["id"] ?? `test-${i + 1}`),
      name: String(t["name"] ?? `Test ${i + 1}`),
      prompt: String(t["prompt"] ?? ""),
      assertions,
      variables: t["variables"] as Record<string, string | number> | undefined,
      systemPrompt: t["systemPrompt"] as string | undefined,
      temperature: t["temperature"] as number | undefined,
      maxTokens: t["maxTokens"] as number | undefined,
      tags: t["tags"] as string[] | undefined,
      timeout: t["timeout"] as number | undefined,
    });
  }

  return {
    name: String(raw["name"] ?? "Unnamed Suite"),
    description: raw["description"] as string | undefined,
    providers: raw["providers"] as string[] | undefined,
    defaultSystemPrompt: raw["defaultSystemPrompt"] as string | undefined,
    defaultTemperature: raw["defaultTemperature"] as number | undefined,
    defaultMaxTokens: raw["defaultMaxTokens"] as number | undefined,
    tests,
    metadata: raw["metadata"] as Record<string, unknown> | undefined,
  };
}

/**
 * Validate a config and return any issues.
 */
export function validateConfig(config: TestSuiteConfig): string[] {
  const issues: string[] = [];
  if (!config.name) issues.push("Suite name is required");
  if (config.tests.length === 0) issues.push("At least one test is required");

  const ids = new Set<string>();
  for (const test of config.tests) {
    if (!test.prompt) issues.push(`Test '${test.id}': prompt is required`);
    if (ids.has(test.id)) issues.push(`Duplicate test ID: '${test.id}'`);
    ids.add(test.id);
    for (const a of test.assertions) {
      if (!a.type) issues.push(`Test '${test.id}': assertion type is required`);
    }
  }
  return issues;
}
