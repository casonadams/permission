import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ToolInputFormatterLookup } from "#src/integrations/tool-input-formatter-registry";

vi.mock("../shared/json.js", () => ({
  safeJsonStringify: vi.fn((value: unknown) => JSON.stringify(value)),
}));

import { TOOL_INPUT_PREVIEW_MAX_LENGTH, TOOL_TEXT_SUMMARY_MAX_LENGTH } from "#src/prompting/tool-input-preview";
import { ToolPreviewFormatter, type ToolPreviewFormatterOptions } from "#src/prompting/tool-preview-formatter";
import { safeJsonStringify } from "#src/shared/json";

const mockedStringify = vi.mocked(safeJsonStringify);

function makeFormatter(overrides: Partial<ToolPreviewFormatterOptions> = {}): ToolPreviewFormatter {
  return new ToolPreviewFormatter({
    toolInputPreviewMaxLength: TOOL_INPUT_PREVIEW_MAX_LENGTH,
    toolTextSummaryMaxLength: TOOL_TEXT_SUMMARY_MAX_LENGTH,
    ...overrides,
  });
}

beforeEach(() => {
  mockedStringify.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ToolPreviewFormatter.sanitizeInlineText", () => {
  test("collapses whitespace and trims", () => {
    const f = makeFormatter();
    expect(f.sanitizeInlineText("  hello   world  ")).toBe("hello world");
  });

  test("returns 'empty text' for blank string", () => {
    const f = makeFormatter();
    expect(f.sanitizeInlineText("")).toBe("empty text");
    expect(f.sanitizeInlineText("   ")).toBe("empty text");
  });

  test("truncates at constructor toolTextSummaryMaxLength", () => {
    const f = makeFormatter({ toolTextSummaryMaxLength: 5 });
    const result = f.sanitizeInlineText("hello world");
    expect(result).toBe("hello…");
  });

  test("explicit maxLength override takes precedence over constructor default", () => {
    const f = makeFormatter({ toolTextSummaryMaxLength: 80 });
    const result = f.sanitizeInlineText("hello world", 5);
    expect(result).toBe("hello…");
  });
});

describe("ToolPreviewFormatter.formatJsonInputForPrompt", () => {
  test("returns empty string when serialization yields empty", () => {
    mockedStringify.mockReturnValue(undefined);
    const f = makeFormatter();
    expect(f.formatJsonInputForPrompt({})).toBe("");
  });

  test("returns prefixed JSON with 'with input' prefix", () => {
    mockedStringify.mockReturnValue('{"k":"v"}');
    const f = makeFormatter();
    expect(f.formatJsonInputForPrompt({ k: "v" })).toBe('with input {"k":"v"}');
  });

  test("truncates at constructor toolInputPreviewMaxLength", () => {
    const longJson = `"${"x".repeat(20)}"`;
    mockedStringify.mockReturnValue(longJson);
    const f = makeFormatter({ toolInputPreviewMaxLength: 10 });
    const result = f.formatJsonInputForPrompt({});
    const preview = result.slice("with input ".length);
    expect(preview.length).toBe(11);
    expect(preview.endsWith("…")).toBe(true);
  });

  test("does not truncate when within toolInputPreviewMaxLength", () => {
    mockedStringify.mockReturnValue('{"k":"v"}');
    const f = makeFormatter({ toolInputPreviewMaxLength: 200 });
    expect(f.formatJsonInputForPrompt({ k: "v" })).toBe('with input {"k":"v"}');
  });
});

describe("ToolPreviewFormatter.formatSearchInputForPrompt", () => {
  test("includes pattern and path", () => {
    const f = makeFormatter();
    const result = f.formatSearchInputForPrompt("grep", {
      pattern: "TODO",
      path: "/src",
    });
    expect(result).toContain("pattern 'TODO'");
    expect(result).toContain("path '/src'");
  });

  test("truncates pattern at toolTextSummaryMaxLength", () => {
    const f = makeFormatter({ toolTextSummaryMaxLength: 5 });
    const result = f.formatSearchInputForPrompt("grep", {
      pattern: "abcdefgh",
    });
    expect(result).toContain("abcde…");
  });

  test("uses 'current working directory' for find/grep/ls without path", () => {
    const f = makeFormatter();
    for (const toolName of ["find", "grep", "ls"]) {
      const result = f.formatSearchInputForPrompt(toolName, {});
      expect(result).toContain("current working directory");
    }
  });

  test("returns empty string for unknown tool with no input", () => {
    const f = makeFormatter();
    expect(f.formatSearchInputForPrompt("other", {})).toBe("");
  });
});

describe("ToolPreviewFormatter.formatToolInputForPrompt", () => {
  test("dispatches 'edit' to standalone formatEditInputForPrompt", () => {
    mockedStringify.mockReturnValue(undefined);
    const f = makeFormatter();
    const result = f.formatToolInputForPrompt("edit", {
      path: "/foo.ts",
      edits: [],
    });
    expect(result).toContain("for '/foo.ts'");
  });

  test("dispatches 'write' to standalone formatWriteInputForPrompt", () => {
    const f = makeFormatter();
    const result = f.formatToolInputForPrompt("write", {
      path: "/out.ts",
      content: "hi",
    });
    expect(result).toContain("for '/out.ts'");
  });

  test("dispatches 'read' to standalone formatReadInputForPrompt", () => {
    const f = makeFormatter();
    const result = f.formatToolInputForPrompt("read", { path: "/src/x.ts" });
    expect(result).toContain("path '/src/x.ts'");
  });

  test("dispatches 'find'/'grep'/'ls' to formatSearchInputForPrompt", () => {
    const f = makeFormatter();
    for (const tool of ["find", "grep", "ls"]) {
      const result = f.formatToolInputForPrompt(tool, {});
      expect(result).toContain("current working directory");
    }
  });

  test("summarizes unknown tool arguments as key/value pairs", () => {
    const f = makeFormatter();
    expect(f.formatToolInputForPrompt("unknown", { x: 1, name: "abc" })).toBe("with x: 1, name: 'abc'");
  });

  test("falls back to inline JSON when unknown tool input is not a record", () => {
    mockedStringify.mockReturnValue('["a"]');
    const f = makeFormatter();
    expect(f.formatToolInputForPrompt("unknown", ["a"])).toContain('["a"]');
  });

  test("unknown tool truncates at constructor toolInputPreviewMaxLength", () => {
    const longJson = `{"k":"${"x".repeat(50)}"}`;
    mockedStringify.mockReturnValue(longJson);
    const f = makeFormatter({ toolInputPreviewMaxLength: 10 });
    const result = f.formatToolInputForPrompt("custom", {});
    const preview = result.slice("with input ".length);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBe(11);
  });
});

describe("ToolPreviewFormatter.formatToolInputForPrompt — custom formatter seam", () => {
  function makeLookup(toolName: string, result: string | undefined): ToolInputFormatterLookup {
    return {
      get: (name) => (name === toolName ? () => result : undefined),
    };
  }

  test("uses a custom formatter's string result verbatim, bypassing the switch", () => {
    const lookup = makeLookup("my-tool", "custom preview");
    const f = new ToolPreviewFormatter(
      {
        toolInputPreviewMaxLength: TOOL_INPUT_PREVIEW_MAX_LENGTH,
        toolTextSummaryMaxLength: TOOL_TEXT_SUMMARY_MAX_LENGTH,
      },
      lookup,
    );
    expect(f.formatToolInputForPrompt("my-tool", {})).toBe("custom preview");
  });

  test("falls through to the built-in switch when custom formatter returns undefined", () => {
    mockedStringify.mockReturnValue('{"x":1}');
    const lookup = makeLookup("unknown-tool", undefined);
    const f = new ToolPreviewFormatter(
      {
        toolInputPreviewMaxLength: TOOL_INPUT_PREVIEW_MAX_LENGTH,
        toolTextSummaryMaxLength: TOOL_TEXT_SUMMARY_MAX_LENGTH,
      },
      lookup,
    );
    expect(f.formatToolInputForPrompt("unknown-tool", { x: 1 })).toBe("with x: 1");
  });

  test("custom formatter for a built-in tool overrides the built-in preview", () => {
    const lookup = makeLookup("read", "custom read summary");
    const f = new ToolPreviewFormatter(
      {
        toolInputPreviewMaxLength: TOOL_INPUT_PREVIEW_MAX_LENGTH,
        toolTextSummaryMaxLength: TOOL_TEXT_SUMMARY_MAX_LENGTH,
      },
      lookup,
    );
    expect(f.formatToolInputForPrompt("read", { path: "/foo.ts" })).toBe("custom read summary");
  });

  test("absent lookup preserves current behaviour for all tool types", () => {
    const f = new ToolPreviewFormatter({
      toolInputPreviewMaxLength: TOOL_INPUT_PREVIEW_MAX_LENGTH,
      toolTextSummaryMaxLength: TOOL_TEXT_SUMMARY_MAX_LENGTH,
    });
    expect(f.formatToolInputForPrompt("read", { path: "/foo.ts" })).toContain("/foo.ts");
  });
});
