import { describe, expect, it, vi } from "vitest";

import type { GatePrompter } from "#src/prompting/gate-prompter";
import {
  getDecisionEvents,
  makeCheckResult,
  makeCtx,
  makeHandler,
  makeToolCallEvent,
} from "#test/helpers/handler-fixtures";

describe("handleToolCall decision events — policy_allow", () => {
  it("emits allow with policy_allow when checkPermission returns allow", async () => {
    const { handler, events } = makeHandler({
      session: {
        checkPermission: vi.fn().mockReturnValue(
          makeCheckResult({
            state: "allow",
            origin: "global",
            matchedPattern: "*",
          }),
        ),
      },
    });

    await handler.handleToolCall(makeToolCallEvent("read"), makeCtx());

    const decisions = getDecisionEvents(events);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      surface: "read",
      result: "allow",
      resolution: "policy_allow",
      origin: "global",
      matchedPattern: "*",
    });
  });
});

describe("handleToolCall decision events — policy_deny", () => {
  it("emits deny with policy_deny when checkPermission returns deny", async () => {
    const { handler, events } = makeHandler({
      session: {
        checkPermission: vi.fn().mockReturnValue(
          makeCheckResult({
            state: "deny",
            origin: "project",
            matchedPattern: "read",
          }),
        ),
      },
    });

    await handler.handleToolCall(makeToolCallEvent("read"), makeCtx());

    const decisions = getDecisionEvents(events);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      surface: "read",
      result: "deny",
      resolution: "policy_deny",
    });
  });
});

describe("handleToolCall decision events — session_approved", () => {
  it("emits allow with session_approved when checkPermission returns source:session", async () => {
    const { handler, events } = makeHandler({
      session: {
        checkPermission: vi.fn().mockReturnValue(
          makeCheckResult({
            state: "allow",
            source: "session",
            matchedPattern: "git *",
          }),
        ),
      },
    });

    await handler.handleToolCall(makeToolCallEvent("bash", { input: { command: "git status" } }), makeCtx());

    const decisions = getDecisionEvents(events);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      surface: "bash",
      result: "allow",
      resolution: "session_approved",
    });
  });
});

describe("handleToolCall decision events — user_approved", () => {
  it("emits allow with user_approved when state=ask and user approves once", async () => {
    const { handler, events } = makeHandler({
      session: {
        checkPermission: vi.fn().mockReturnValue(makeCheckResult({ state: "ask" })),
      },
      prompter: {
        canConfirm: vi.fn().mockReturnValue(true),
        prompt: vi.fn<GatePrompter["prompt"]>().mockResolvedValue({ approved: true, state: "approved" }),
      },
    });

    await handler.handleToolCall(makeToolCallEvent("read"), makeCtx());

    const decisions = getDecisionEvents(events);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      result: "allow",
      resolution: "user_approved",
    });
  });

  it("emits allow with user_approved_for_session when user approves for session", async () => {
    const { handler, events } = makeHandler({
      session: {
        checkPermission: vi.fn().mockReturnValue(makeCheckResult({ state: "ask" })),
      },
      prompter: {
        canConfirm: vi.fn().mockReturnValue(true),
        prompt: vi.fn<GatePrompter["prompt"]>().mockResolvedValue({
          approved: true,
          state: "approved_for_session",
        }),
      },
    });

    await handler.handleToolCall(makeToolCallEvent("read"), makeCtx());

    const decisions = getDecisionEvents(events);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      result: "allow",
      resolution: "user_approved_for_session",
    });
  });
});

describe("handleToolCall decision events — user_denied", () => {
  it("emits deny with user_denied when state=ask and user denies", async () => {
    const { handler, events } = makeHandler({
      session: {
        checkPermission: vi.fn().mockReturnValue(makeCheckResult({ state: "ask" })),
      },
      prompter: {
        canConfirm: vi.fn().mockReturnValue(true),
        prompt: vi.fn<GatePrompter["prompt"]>().mockResolvedValue({ approved: false, state: "denied" }),
      },
    });

    await handler.handleToolCall(makeToolCallEvent("read"), makeCtx());

    const decisions = getDecisionEvents(events);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      result: "deny",
      resolution: "user_denied",
    });
  });
});

describe("handleToolCall decision events — confirmation_unavailable", () => {
  it("emits deny with confirmation_unavailable when state=ask but no UI", async () => {
    const { handler, events } = makeHandler({
      session: {
        checkPermission: vi.fn().mockReturnValue(makeCheckResult({ state: "ask" })),
      },
      prompter: {
        canConfirm: vi.fn().mockReturnValue(false),
        prompt: vi.fn<GatePrompter["prompt"]>(),
      },
    });

    await handler.handleToolCall(makeToolCallEvent("read"), makeCtx({ hasUI: false }));

    const decisions = getDecisionEvents(events);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      result: "deny",
      resolution: "confirmation_unavailable",
    });
  });
});

describe("handleToolCall decision events — infrastructure_auto_allowed", () => {
  it("emits allow with infrastructure_auto_allowed for Pi infra reads", async () => {
    const infraDir = "/test/agent";
    const { handler, events } = makeHandler({
      session: {
        checkPermission: vi.fn().mockReturnValue(makeCheckResult({ state: "ask", source: "special" })),
        getInfrastructureReadDirs: vi.fn().mockReturnValue([infraDir]),
      },
    });

    const event = makeToolCallEvent("read", {
      input: { path: `${infraDir}/some-file.json` },
    });
    await handler.handleToolCall(event, makeCtx());

    const decisions = getDecisionEvents(events);
    const infraEvents = decisions.filter((e) => e.resolution === "infrastructure_auto_allowed");
    expect(infraEvents).toHaveLength(1);
    expect(infraEvents[0]).toMatchObject({
      result: "allow",
      resolution: "infrastructure_auto_allowed",
    });
  });
});
