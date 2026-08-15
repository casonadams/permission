import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequestApproval = vi.fn();

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PermissionPromptDecision } from "#src/prompting/permission-dialog";
import type { PromptPermissionDetails } from "#src/prompting/permission-prompter";
import { PermissionPrompter, type PermissionPrompterDeps } from "#src/prompting/permission-prompter";

function makeCtx(hasUI: boolean): ExtensionContext {
  return {
    hasUI,
    ui: { select: vi.fn(), input: vi.fn() },
    sessionManager: { getSessionDir: vi.fn().mockReturnValue(null) },
  } as unknown as ExtensionContext;
}

function makeDetails(overrides?: Partial<PromptPermissionDetails>): PromptPermissionDetails {
  return {
    requestId: "req-123",
    source: "tool_call",
    agentName: "test-agent",
    message: "Allow read?",
    toolName: "read",
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<PermissionPrompterDeps>): PermissionPrompterDeps {
  return {
    events: { emit: vi.fn(), on: vi.fn().mockReturnValue(() => undefined) },
    forwarder: { requestApproval: mockRequestApproval },
    ...overrides,
  };
}

describe("PermissionPrompter", () => {
  beforeEach(() => {
    mockRequestApproval.mockReset();
    mockRequestApproval.mockResolvedValue({
      approved: true,
      state: "approved",
    });
  });

  describe("UI present", () => {
    it("emits a UI prompt event with normalized surface and value when the session has UI", async () => {
      const events = {
        emit: vi.fn(),
        on: vi.fn().mockReturnValue(() => undefined),
      };
      mockRequestApproval.mockResolvedValue({
        approved: true,
        state: "approved",
      });
      const deps = makeDeps({ events });
      const prompter = new PermissionPrompter(deps);

      await prompter.prompt(
        makeCtx(true),
        makeDetails({
          toolName: "bash",
          command: "git push",
          toolInputPreview: "git push",
        }),
      );

      expect(events.emit).toHaveBeenCalledWith("permissions:ui_prompt", {
        requestId: "req-123",
        source: "tool_call",
        surface: "bash",
        value: "git push",
        agentName: "test-agent",
        message: "Allow read?",
        forwarding: null,
      });
    });

    it("normalizes skill UI prompt events to the skill surface", async () => {
      const events = {
        emit: vi.fn(),
        on: vi.fn().mockReturnValue(() => undefined),
      };
      mockRequestApproval.mockResolvedValue({
        approved: true,
        state: "approved",
      });
      const deps = makeDeps({ events });
      const prompter = new PermissionPrompter(deps);

      await prompter.prompt(
        makeCtx(true),
        makeDetails({
          source: "skill_input",
          toolName: undefined,
          skillName: "deploy-helper",
        }),
      );

      expect(events.emit).toHaveBeenCalledWith("permissions:ui_prompt", {
        requestId: "req-123",
        source: "skill_input",
        surface: "skill",
        value: "deploy-helper",
        agentName: "test-agent",
        message: "Allow read?",
        forwarding: null,
      });
    });

    it("does not emit a UI prompt event when the session has no UI", async () => {
      const events = {
        emit: vi.fn(),
        on: vi.fn().mockReturnValue(() => undefined),
      };
      mockRequestApproval.mockResolvedValue({
        approved: true,
        state: "approved",
      });
      const deps = makeDeps({ events });
      const prompter = new PermissionPrompter(deps);

      await prompter.prompt(makeCtx(false), makeDetails());

      expect(events.emit).not.toHaveBeenCalledWith("permissions:ui_prompt", expect.anything());
    });

    it("returns the decision from confirmPermission", async () => {
      const decision: PermissionPromptDecision = {
        approved: false,
        state: "denied_with_reason",
        denialReason: "sensitive",
      };
      mockRequestApproval.mockResolvedValue(decision);
      const deps = makeDeps();
      const prompter = new PermissionPrompter(deps);

      const result = await prompter.prompt(makeCtx(true), makeDetails());

      expect(result).toEqual(decision);
    });

    it("passes sessionLabel option to confirmPermission when present", async () => {
      mockRequestApproval.mockResolvedValue({
        approved: true,
        state: "approved",
      });
      const deps = makeDeps();
      const prompter = new PermissionPrompter(deps);
      const details = makeDetails({ sessionLabel: "Yes, for 'read' tool" });

      await prompter.prompt(makeCtx(true), details);

      expect(mockRequestApproval).toHaveBeenCalledWith({
        ctx: expect.anything(),
        message: expect.any(String),
        options: { sessionLabel: "Yes, for 'read' tool" },
        forwarded: { source: "tool_call", surface: "read", value: "read" },
      });
    });

    it("passes the display fields (source/surface/value) to confirmPermission", async () => {
      mockRequestApproval.mockResolvedValue({
        approved: true,
        state: "approved",
      });
      const deps = makeDeps();
      const prompter = new PermissionPrompter(deps);
      const details = makeDetails({
        toolName: "bash",
        command: "git push",
      });

      await prompter.prompt(makeCtx(false), details);

      expect(mockRequestApproval).toHaveBeenCalledWith({
        ctx: expect.anything(),
        message: expect.any(String),
        options: undefined,
        forwarded: {
          source: "tool_call",
          surface: "bash",
          value: "git push",
        },
      });
    });

    it("passes undefined options to confirmPermission when sessionLabel is absent", async () => {
      mockRequestApproval.mockResolvedValue({
        approved: true,
        state: "approved",
      });
      const deps = makeDeps();
      const prompter = new PermissionPrompter(deps);

      await prompter.prompt(makeCtx(true), makeDetails());

      expect(mockRequestApproval).toHaveBeenCalledWith({
        ctx: expect.anything(),
        message: expect.any(String),
        options: undefined,
        forwarded: {
          source: "tool_call",
          surface: "read",
          value: "read",
        },
      });
    });

    it("passes the message from details to confirmPermission", async () => {
      mockRequestApproval.mockResolvedValue({
        approved: true,
        state: "approved",
      });
      const deps = makeDeps();
      const prompter = new PermissionPrompter(deps);
      const details = makeDetails({ message: "Allow bash: git status?" });

      await prompter.prompt(makeCtx(true), details);

      expect(mockRequestApproval).toHaveBeenCalledWith({
        ctx: expect.anything(),
        message: "Allow bash: git status?",
        options: undefined,
        forwarded: {
          source: "tool_call",
          surface: "read",
          value: "read",
        },
      });
    });
  });

  describe("subagent forwarding path", () => {
    it("calls confirmPermission even when ctx has no UI", async () => {
      const forwarded: PermissionPromptDecision = {
        approved: true,
        state: "approved",
      };
      mockRequestApproval.mockResolvedValue(forwarded);
      const deps = makeDeps();
      const prompter = new PermissionPrompter(deps);

      await prompter.prompt(makeCtx(false), makeDetails());

      expect(mockRequestApproval).toHaveBeenCalled();
    });

    it("returns the decision from confirmPermission in the subagent path", async () => {
      const forwarded: PermissionPromptDecision = {
        approved: false,
        state: "denied",
      };
      mockRequestApproval.mockResolvedValue(forwarded);
      const deps = makeDeps();
      const prompter = new PermissionPrompter(deps);

      const result = await prompter.prompt(makeCtx(false), makeDetails());

      expect(result).toEqual(forwarded);
    });
  });
});
