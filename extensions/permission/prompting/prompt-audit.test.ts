import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS_UI_PROMPT_CHANNEL, type PermissionEventBus } from "#src/integrations/permission-events";
import type { PromptPermissionDetails } from "#src/prompting/permission-prompter";
import { type PromptAuditDeps, recordPromptDecision, recordPromptWaiting } from "#src/prompting/prompt-audit";

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

function makeDeps(): PromptAuditDeps & { events: PermissionEventBus } {
  return {
    logger: { review: vi.fn() },
    events: { emit: vi.fn(), on: vi.fn(() => vi.fn()) },
  };
}

describe("prompt audit helpers", () => {
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
