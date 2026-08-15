import { describe, expect, test } from "vitest";
import {
  countTextLines,
  formatCount,
  serializeToolInputPreview,
  TOOL_INPUT_PREVIEW_MAX_LENGTH,
  TOOL_TEXT_SUMMARY_MAX_LENGTH,
  truncateInlineText,
} from "#src/prompting/tool-input-preview";
import { safeJsonStringify } from "#src/shared/json";

describe("tool input preview", () => {
  test("uses fixed preview limits", () => {
    expect(TOOL_INPUT_PREVIEW_MAX_LENGTH).toBe(200);
    expect(TOOL_TEXT_SUMMARY_MAX_LENGTH).toBe(80);
  });

  test("truncates and appends an ellipsis", () => {
    expect(truncateInlineText("abcdef", 3)).toBe("abc…");
  });

  test("leaves short text unchanged", () => {
    expect(truncateInlineText("hello", 10)).toBe("hello");
  });

  test("counts common line endings", () => {
    expect(countTextLines("")).toBe(0);
    expect(countTextLines("line1\nline2\nline3")).toBe(3);
    expect(countTextLines("line1\r\nline2")).toBe(2);
    expect(countTextLines("line1\rline2")).toBe(2);
  });

  test("formats singular and plural counts", () => {
    expect(formatCount(1, "line", "lines")).toBe("1 line");
    expect(formatCount(0, "line", "lines")).toBe("0 lines");
    expect(formatCount(3, "line", "lines")).toBe("3 lines");
  });

  test("serializes tool input inline", () => {
    expect(serializeToolInputPreview({ key: "value" })).toBe('{"key":"value"}');
  });

  test("omits empty input", () => {
    expect(serializeToolInputPreview({})).toBe("");
    expect(serializeToolInputPreview(null)).toBe("");
  });

  test("serializes bigint and circular references", () => {
    const input: Record<string, unknown> = { count: 1n };
    input.self = input;
    expect(safeJsonStringify(input)).toBe('{"count":"1","self":"[Circular]"}');
  });
});
