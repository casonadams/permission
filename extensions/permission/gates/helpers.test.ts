import { describe, expect, it } from "vitest";

import { buildDecisionEvent, deriveDecisionValue, deriveResolution } from "#src/gates/helpers";
import type { PermissionCheckResult } from "#src/policy/types";

describe("deriveDecisionValue", () => {
  it("returns command for bash", () => {
    expect(deriveDecisionValue("bash", { command: "git status" })).toBe("git status");
  });

  it("falls back to toolName when bash has no command", () => {
    expect(deriveDecisionValue("bash", {})).toBe("bash");
  });

  it("returns target for mcp", () => {
    expect(deriveDecisionValue("mcp", { target: "exa:search" })).toBe("exa:search");
  });

  it("falls back to toolName when mcp has no target", () => {
    expect(deriveDecisionValue("mcp", {})).toBe("mcp");
  });

  it("returns toolName for non-path-bearing tools", () => {
    expect(deriveDecisionValue("my_extension_tool", {})).toBe("my_extension_tool");
  });

  it("returns path for path-bearing tools when path is provided", () => {
    expect(deriveDecisionValue("read", {}, "/project/src/main.ts")).toBe("/project/src/main.ts");
    expect(deriveDecisionValue("write", {}, "src/.env")).toBe("src/.env");
  });

  it("falls back to toolName for path-bearing tools when path is missing", () => {
    expect(deriveDecisionValue("read", {})).toBe("read");
    expect(deriveDecisionValue("write", {}, undefined)).toBe("write");
  });
});

describe("deriveResolution", () => {
  it("returns policy_allow for allow state", () => {
    expect(deriveResolution({ state: "allow", action: "allow", hasSession: false, canConfirm: true })).toBe(
      "policy_allow",
    );
  });

  it("returns policy_deny for deny state", () => {
    expect(deriveResolution({ state: "deny", action: "block", hasSession: false, canConfirm: true })).toBe(
      "policy_deny",
    );
  });

  it("returns user_approved for ask + allow without session", () => {
    expect(deriveResolution({ state: "ask", action: "allow", hasSession: false, canConfirm: true })).toBe(
      "user_approved",
    );
  });

  it("returns user_approved_for_session for ask + allow with session", () => {
    expect(deriveResolution({ state: "ask", action: "allow", hasSession: true, canConfirm: true })).toBe(
      "user_approved_for_session",
    );
  });

  it("returns user_denied for ask + block with canConfirm", () => {
    expect(deriveResolution({ state: "ask", action: "block", hasSession: false, canConfirm: true })).toBe(
      "user_denied",
    );
  });

  it("returns confirmation_unavailable for ask + block without canConfirm", () => {
    expect(deriveResolution({ state: "ask", action: "block", hasSession: false, canConfirm: false })).toBe(
      "confirmation_unavailable",
    );
  });
});

describe("buildDecisionEvent", () => {
  function makeCheck(overrides: Partial<PermissionCheckResult> = {}): PermissionCheckResult {
    return {
      state: "allow",
      toolName: "read",
      source: "tool",
      origin: "builtin",
      matchedPattern: "*",
      ...overrides,
    };
  }

  it("builds a decision event with all fields populated", () => {
    const event = buildDecisionEvent({
      decision: { surface: "read", value: "read" },
      check: makeCheck({ origin: "global", matchedPattern: "read" }),
      agentName: "test-agent",
      result: "allow",
      resolution: "policy_allow",
    });
    expect(event).toEqual({
      surface: "read",
      value: "read",
      result: "allow",
      resolution: "policy_allow",
      origin: "global",
      agentName: "test-agent",
      matchedPattern: "read",
    });
  });

  it("normalises undefined origin to null", () => {
    const event = buildDecisionEvent({
      decision: { surface: "bash", value: "git status" },
      check: makeCheck({ origin: undefined }),
      agentName: null,
      result: "allow",
      resolution: "user_approved",
    });
    expect(event.origin).toBeNull();
  });

  it("normalises null agentName to null", () => {
    const event = buildDecisionEvent({
      decision: { surface: "read", value: "read" },
      check: makeCheck(),
      agentName: null,
      result: "deny",
      resolution: "policy_deny",
    });
    expect(event.agentName).toBeNull();
  });

  it("normalises undefined matchedPattern to null", () => {
    const event = buildDecisionEvent({
      decision: { surface: "read", value: "read" },
      check: makeCheck({ matchedPattern: undefined }),
      agentName: null,
      result: "deny",
      resolution: "policy_deny",
    });
    expect(event.matchedPattern).toBeNull();
  });

  it("passes result and resolution through", () => {
    const event = buildDecisionEvent({
      decision: { surface: "bash", value: "rm -rf /" },
      check: makeCheck(),
      agentName: null,
      result: "deny",
      resolution: "user_denied",
    });
    expect(event.result).toBe("deny");
    expect(event.resolution).toBe("user_denied");
  });
});
