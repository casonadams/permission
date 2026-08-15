import { describe, expect, it } from "vitest";
import { SessionApproval } from "#src/policy/session-approval";

describe("SessionApproval", () => {
  it("creates a single-pattern gate approval", () => {
    const approval = SessionApproval.single("bash", "git *");

    expect(approval.surface).toBe("bash");
    expect(approval.patterns).toEqual(["git *"]);
    expect(approval.representativePattern).toBe("git *");
    expect(approval.toGateApproval()).toEqual({ surface: "bash", pattern: "git *" });
  });

  it("copies multiple patterns and uses the first for the gate", () => {
    const source = ["/outside/a/*", "/outside/b/*"];
    const approval = SessionApproval.multiple("path", source);
    source.push("/outside/c/*");

    expect(approval.surface).toBe("path");
    expect(approval.patterns).toEqual(["/outside/a/*", "/outside/b/*"]);
    expect(approval.representativePattern).toBe("/outside/a/*");
    expect(approval.toGateApproval()).toEqual({ surface: "path", pattern: "/outside/a/*" });
  });

  it("does not create a gate approval without patterns", () => {
    const approval = SessionApproval.multiple("path", []);
    expect(approval.representativePattern).toBeUndefined();
    expect(approval.toGateApproval()).toBeUndefined();
  });
});
