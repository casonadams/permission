import { describe, expect, it, vi } from "vitest";
import { applyPermissionGate, type PermissionGateParams } from "./permission-gate";

function makeParams(overrides: Partial<PermissionGateParams> = {}): PermissionGateParams {
  return {
    state: "allow",
    canConfirm: true,
    promptForApproval: vi.fn().mockResolvedValue({ approved: true, state: "approved" }),
    messages: {
      denyReason: "Denied by policy.",
      unavailableReason: "No interactive UI available.",
      userDeniedReason: (decision) =>
        decision.denialReason ? `User denied. Reason: ${decision.denialReason}.` : "User denied.",
    },
    ...overrides,
  };
}

describe("applyPermissionGate", () => {
  it("allows an allowed state without prompting", async () => {
    const params = makeParams();
    await expect(applyPermissionGate(params)).resolves.toEqual({ action: "allow" });
    expect(params.promptForApproval).not.toHaveBeenCalled();
  });

  it("blocks a denied state", async () => {
    await expect(applyPermissionGate(makeParams({ state: "deny" }))).resolves.toEqual({
      action: "block",
      reason: "Denied by policy.",
    });
  });

  it("blocks ask when confirmation is unavailable", async () => {
    await expect(applyPermissionGate(makeParams({ state: "ask", canConfirm: false }))).resolves.toEqual({
      action: "block",
      reason: "No interactive UI available.",
    });
  });

  it("allows a user-approved ask", async () => {
    await expect(applyPermissionGate(makeParams({ state: "ask" }))).resolves.toEqual({ action: "allow" });
  });

  it("blocks a user-denied ask with its reason", async () => {
    const promptForApproval = vi.fn().mockResolvedValue({
      approved: false,
      state: "denied_with_reason",
      denialReason: "not now",
    });
    await expect(applyPermissionGate(makeParams({ state: "ask", promptForApproval }))).resolves.toEqual({
      action: "block",
      reason: "User denied. Reason: not now.",
    });
  });

  it("returns a session approval when selected", async () => {
    const promptForApproval = vi.fn().mockResolvedValue({ approved: true, state: "approved_for_session" });
    await expect(
      applyPermissionGate({
        ...makeParams({ state: "ask", promptForApproval }),
        sessionApproval: { surface: "bash", pattern: "git *" },
      }),
    ).resolves.toEqual({
      action: "allow",
      sessionApproval: { surface: "bash", pattern: "git *" },
    });
  });
});
