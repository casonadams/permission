import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS_UI_PROMPT_CHANNEL, type PermissionEventBus } from "#src/permission-events";
import type { PromptPermissionDetails } from "#src/permission-prompter";
import type { ReviewLogger } from "#src/session-logger";
import {
  type LocalPromptAuditDeps,
  maybeAutoApprovePrompt,
  recordPromptDecision,
  recordPromptWaiting,
} from "#src/ui/prompt-audit";

function makeDetails(overrides: Partial<PromptPermissionDetails> = {}): PromptPermissionDetails {
  return {
    requestId: "req-1",
    source: "tool_call",
    agentName: "agent-1",
    message: "Allow bash?",
    toolCallId: "tc-1",
    toolName: "bash",
    command: "git status",
    ...overrides,
  };
}

function makeDeps(yoloMode = false): LocalPromptAuditDeps & { logger: ReviewLogger; events: PermissionEventBus } {
  return {
    config: { current: () => ({ debugLog: false, permissionReviewLog: true, yoloMode }) },
    logger: { review: vi.fn() },
    events: { emit: vi.fn(), on: vi.fn(() => vi.fn()) },
  };
}

describe("local prompt audit helpers", () => {
  it("records and returns an auto-approved decision when yolo mode is enabled", () => {
    const deps = makeDeps(true);
    const decision = maybeAutoApprovePrompt(makeDetails(), deps);

    expect(decision).toEqual({ approved: true, state: "approved", autoApproved: true });
    expect(deps.logger.review).toHaveBeenCalledWith(
      "permission_request.auto_approved",
      expect.objectContaining({ requestId: "req-1", command: "git status", resolution: null, denialReason: null }),
    );
  });

  it("returns null without writing when yolo mode is disabled", () => {
    const deps = makeDeps(false);
    const decision = maybeAutoApprovePrompt(makeDetails(), deps);

    expect(decision).toBeNull();
    expect(deps.logger.review).not.toHaveBeenCalled();
  });

  it("records waiting and emits the UI prompt event before showing the picker", () => {
    const deps = makeDeps();
    recordPromptWaiting(makeDetails(), deps);

    expect(deps.logger.review).toHaveBeenCalledWith(
      "permission_request.waiting",
      expect.objectContaining({ requestId: "req-1", toolName: "bash", resolution: null, denialReason: null }),
    );
    expect(deps.events.emit).toHaveBeenCalledWith(
      PERMISSIONS_UI_PROMPT_CHANNEL,
      expect.objectContaining({ requestId: "req-1", surface: "bash", value: "git status" }),
    );
  });

  it("records approved decisions", () => {
    const deps = makeDeps();
    recordPromptDecision(makeDetails(), { approved: true, state: "approved_for_session" }, deps.logger);

    expect(deps.logger.review).toHaveBeenCalledWith(
      "permission_request.approved",
      expect.objectContaining({ resolution: "approved_for_session", denialReason: null }),
    );
  });

  it("records denied decisions with the denial reason", () => {
    const deps = makeDeps();
    recordPromptDecision(
      makeDetails(),
      { approved: false, state: "denied_with_reason", denialReason: "too risky" },
      deps.logger,
    );

    expect(deps.logger.review).toHaveBeenCalledWith(
      "permission_request.denied",
      expect.objectContaining({ resolution: "denied_with_reason", denialReason: "too risky" }),
    );
  });
});
