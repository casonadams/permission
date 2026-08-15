import { describe, expect, test } from "vitest";
import { formatApprovalGuidance } from "#src/prompting/approval-guidance";

describe("formatApprovalGuidance", () => {
  test("formats Bash command guidance", () => {
    expect(formatApprovalGuidance("bash", "echo *")).toContain('"echo *": "allow"');
    expect(formatApprovalGuidance("bash", "echo *")).toContain("permission.bash");
  });

  test("formats path guidance", () => {
    expect(formatApprovalGuidance("path", "/Users/Shared/*")).toContain('"/Users/Shared/*": "allow"');
  });

  test("returns undefined without a pattern", () => {
    expect(formatApprovalGuidance("bash", undefined)).toBeUndefined();
  });
});
