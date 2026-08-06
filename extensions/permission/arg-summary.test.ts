import { describe, expect, test } from "vitest";
import { formatArgsSummary } from "#src/arg-summary";

describe("formatArgsSummary", () => {
  test("single-quotes string values so embedded double quotes stay readable", () => {
    expect(formatArgsSummary({ code: 'emit("check");' }, 80)).toBe("code: 'emit(\"check\");'");
  });

  test("renders numbers and booleans bare", () => {
    expect(formatArgsSummary({ n: 3, ok: true }, 80)).toBe("n: 3, ok: true");
  });

  test("summarizes arrays and nested objects", () => {
    expect(formatArgsSummary({ items: [1, 2], opts: { a: 1 } }, 80)).toBe("items: [2 items], opts: {…}");
  });

  test("returns undefined for an empty record", () => {
    expect(formatArgsSummary({}, 80)).toBeUndefined();
  });
});
