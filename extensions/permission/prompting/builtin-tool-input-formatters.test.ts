import { describe, expect, test } from "vitest";
import { ToolInputFormatterRegistry } from "#src/integrations/tool-input-formatter-registry";
import {
  formatMcpInputForPrompt,
  registerBuiltinToolInputFormatters,
} from "#src/prompting/builtin-tool-input-formatters";

describe("formatMcpInputForPrompt", () => {
  test("returns undefined when arguments is absent", () => {
    expect(formatMcpInputForPrompt({ tool: "exa:search" })).toBeUndefined();
  });

  test("returns undefined when arguments is an empty object", () => {
    expect(formatMcpInputForPrompt({ tool: "exa:search", arguments: {} })).toBeUndefined();
  });

  test("returns a summary for a single string argument", () => {
    const result = formatMcpInputForPrompt({
      tool: "exa:search",
      arguments: { query: "typescript generics" },
    });
    expect(result).toBeDefined();
    expect(result).toContain("query");
    expect(result).toContain("typescript generics");
    expect(result).toMatch(/^with /);
  });

  test("returns a comma-separated summary for multiple arguments", () => {
    const result = formatMcpInputForPrompt({
      tool: "exa:search",
      arguments: { query: "test", numResults: 5 },
    });
    expect(result).toContain("query");
    expect(result).toContain("numResults");
    expect(result).toContain("5");
  });

  test("renders number arguments without quotes", () => {
    const result = formatMcpInputForPrompt({
      arguments: { count: 42 },
    });
    expect(result).toContain("42");
    expect(result).not.toContain('"42"');
    expect(result).not.toContain("'42'");
  });

  test("renders boolean arguments without quotes", () => {
    const result = formatMcpInputForPrompt({
      arguments: { verbose: true },
    });
    expect(result).toContain("true");
  });

  test("renders array arguments as '[N items]'", () => {
    const result = formatMcpInputForPrompt({
      arguments: { ids: [1, 2, 3] },
    });
    expect(result).toContain("[3 items]");
  });

  test("renders nested object arguments as '{…}'", () => {
    const result = formatMcpInputForPrompt({
      arguments: { filter: { type: "file" } },
    });
    expect(result).toContain("{…}");
  });

  test("truncates the full summary when it exceeds the limit", () => {
    const result = formatMcpInputForPrompt({
      arguments: {
        first: "x".repeat(80),
        second: "y".repeat(80),
        third: "z".repeat(80),
      },
    });
    expect(result).toBeDefined();
    expect(result!.endsWith("…")).toBe(true);
  });

  test("truncates long string argument values", () => {
    const result = formatMcpInputForPrompt({
      arguments: { query: "x".repeat(100) },
    });
    expect(result).toBeDefined();

    expect(result).not.toContain("x".repeat(100));
  });
});

describe("registerBuiltinToolInputFormatters", () => {
  test("registers the mcp formatter in the registry", () => {
    const registry = new ToolInputFormatterRegistry();
    registerBuiltinToolInputFormatters(registry);
    expect(registry.get("mcp")).toBe(formatMcpInputForPrompt);
  });

  test("throws if called twice (duplicate registration guard)", () => {
    const registry = new ToolInputFormatterRegistry();
    registerBuiltinToolInputFormatters(registry);
    expect(() => registerBuiltinToolInputFormatters(registry)).toThrow("mcp");
  });
});
