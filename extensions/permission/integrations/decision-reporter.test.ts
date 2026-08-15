import { describe, expect, it, vi } from "vitest";
import { GateDecisionReporter } from "#src/integrations/decision-reporter";
import { PERMISSIONS_DECISION_CHANNEL, type PermissionDecisionEvent } from "#src/integrations/permission-events";

function makeEvents() {
  return {
    emit: vi.fn(),
    on: vi.fn().mockReturnValue(() => undefined),
  };
}

function makeDecision(): PermissionDecisionEvent {
  return {
    surface: "bash",
    value: "git status",
    result: "allow",
    resolution: "policy_allow",
    origin: "global",
    agentName: null,
    matchedPattern: "git status",
  };
}

describe("GateDecisionReporter", () => {
  it("emits permission decisions", () => {
    const events = makeEvents();
    const reporter = new GateDecisionReporter(events);
    const decision = makeDecision();

    reporter.emitDecision(decision);

    expect(events.emit).toHaveBeenCalledWith(PERMISSIONS_DECISION_CHANNEL, decision);
  });

  it("does not throw when a listener throws", () => {
    const events = makeEvents();
    events.emit.mockImplementation(() => {
      throw new Error("listener failure");
    });
    const reporter = new GateDecisionReporter(events);

    expect(() => reporter.emitDecision(makeDecision())).not.toThrow();
  });
});
