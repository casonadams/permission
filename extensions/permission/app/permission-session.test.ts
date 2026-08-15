import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetActiveAgentName, mockGetActiveAgentNameFromSystemPrompt } = vi.hoisted(() => ({
  mockGetActiveAgentName: vi.fn<(ctx: ExtensionContext) => string | null>(),
  mockGetActiveAgentNameFromSystemPrompt: vi.fn<(systemPrompt?: string) => string | null>(),
}));

vi.mock("./active-agent", () => ({
  getActiveAgentName: mockGetActiveAgentName,
  getActiveAgentNameFromSystemPrompt: mockGetActiveAgentNameFromSystemPrompt,
}));

import type { SkillPromptEntry } from "#src/app/skill-prompt-sanitizer";
import { SessionApproval } from "#src/policy/session-approval";
import { makeCtx } from "#test/helpers/handler-fixtures";
import { makeFakePermissionManager, makeRealSession } from "#test/helpers/session-fixtures";

const createSession = makeRealSession;
const makePermissionManager = makeFakePermissionManager;

function makeSkillEntry(name: string, overrides: Partial<SkillPromptEntry> = {}): SkillPromptEntry {
  return {
    name,
    description: `${name} skill`,
    location: `/${name}/SKILL.md`,
    state: "allow",
    normalizedLocation: `/${name}/SKILL.md`,
    normalizedBaseDir: `/${name}`,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetActiveAgentName.mockReset();
  mockGetActiveAgentNameFromSystemPrompt.mockReset();
  mockGetActiveAgentName.mockReturnValue(null);
  mockGetActiveAgentNameFromSystemPrompt.mockReturnValue(null);
});

describe("PermissionSession", () => {
  describe("activate and deactivate", () => {
    it("stores the context on activate", () => {
      const { session, forwarding } = createSession();
      const ctx = makeCtx();

      session.activate(ctx);

      expect(forwarding.start).toHaveBeenCalledWith(ctx);
    });

    it("clears context on deactivate", () => {
      const { session, forwarding } = createSession();
      session.activate(makeCtx());
      session.deactivate();

      expect(forwarding.stop).toHaveBeenCalled();
    });

    it("forwards activate to the gateway", () => {
      const { session, gateway } = createSession();
      const ctx = makeCtx();

      session.activate(ctx);

      expect(gateway.activate).toHaveBeenCalledWith(ctx);
    });

    it("forwards deactivate to the gateway", () => {
      const { session, gateway } = createSession();
      session.activate(makeCtx());
      session.deactivate();

      expect(gateway.deactivate).toHaveBeenCalled();
    });
  });

  describe("resetForNewSession", () => {
    it("configures the injected PermissionManager for the context cwd", () => {
      const pm = makePermissionManager();
      const { session } = createSession({ permissionManager: pm });
      const ctx = makeCtx({ cwd: "/new/project" });

      session.resetForNewSession(ctx);

      expect(pm.configureForCwd).toHaveBeenCalledWith("/new/project");
    });

    it("clears cache keys", () => {
      const { session } = createSession();
      session.activeToolsGate.runIfChanged("key-1", () => {});
      session.promptStateGate.runIfChanged("key-2", () => {});

      session.resetForNewSession(makeCtx());

      const toolsEffect = vi.fn();
      const promptEffect = vi.fn();
      session.activeToolsGate.runIfChanged("key-1", toolsEffect);
      session.promptStateGate.runIfChanged("key-2", promptEffect);
      expect(toolsEffect).toHaveBeenCalledOnce();
      expect(promptEffect).toHaveBeenCalledOnce();
    });

    it("clears skill entries", () => {
      const { session } = createSession();
      session.setActiveSkillEntries([makeSkillEntry("test")]);
      expect(session.getActiveSkillEntries()).toHaveLength(1);

      session.resetForNewSession(makeCtx());

      expect(session.getActiveSkillEntries()).toEqual([]);
    });

    it("clears the remembered agent name", () => {
      const { session } = createSession();
      mockGetActiveAgentName.mockReturnValue("first-agent");
      session.resolveAgentName(makeCtx());
      mockGetActiveAgentName.mockReturnValue(null);

      session.resetForNewSession(makeCtx());

      expect(session.resolveAgentName(makeCtx())).toBeNull();
      expect(session.lastKnownActiveAgentName).toBeNull();
    });

    it("starts forwarding with the new context", () => {
      const { session, forwarding } = createSession();
      const ctx = makeCtx();

      session.resetForNewSession(ctx);

      expect(forwarding.start).toHaveBeenCalledWith(ctx);
    });

    it("activates the new context", () => {
      const { session } = createSession();
      const ctx = makeCtx();

      session.resetForNewSession(ctx);

      mockGetActiveAgentName.mockReturnValue("test-agent");
      const name = session.resolveAgentName(ctx);
      expect(name).toBe("test-agent");
    });
  });

  describe("shutdown", () => {
    it("clears session rules", () => {
      const { session, sessionRules } = createSession();
      sessionRules.recordSessionApproval(SessionApproval.single("bash", "*"));
      expect(sessionRules.getRuleset()).toHaveLength(1);

      session.shutdown();

      expect(sessionRules.getRuleset()).toEqual([]);
    });

    it("clears cache keys", () => {
      const { session } = createSession();
      session.activeToolsGate.runIfChanged("k1", () => {});
      session.promptStateGate.runIfChanged("k2", () => {});

      session.shutdown();

      const toolsEffect = vi.fn();
      const promptEffect = vi.fn();
      session.activeToolsGate.runIfChanged("k1", toolsEffect);
      session.promptStateGate.runIfChanged("k2", promptEffect);
      expect(toolsEffect).toHaveBeenCalledOnce();
      expect(promptEffect).toHaveBeenCalledOnce();
    });

    it("clears skill entries", () => {
      const { session } = createSession();
      session.setActiveSkillEntries([makeSkillEntry("s")]);

      session.shutdown();

      expect(session.getActiveSkillEntries()).toEqual([]);
    });

    it("clears the remembered agent name", () => {
      const { session } = createSession();
      mockGetActiveAgentName.mockReturnValue("first-agent");
      session.resolveAgentName(makeCtx());
      mockGetActiveAgentName.mockReturnValue(null);

      session.shutdown();

      expect(session.resolveAgentName(makeCtx())).toBeNull();
      expect(session.lastKnownActiveAgentName).toBeNull();
    });

    it("stops forwarding and deactivates context", () => {
      const { session, forwarding } = createSession();
      session.activate(makeCtx());

      session.shutdown();

      expect(forwarding.stop).toHaveBeenCalled();
    });
  });

  describe("skill entries", () => {
    it("get/set skill entries", () => {
      const { session } = createSession();
      const entries = [makeSkillEntry("a"), makeSkillEntry("b")];
      session.setActiveSkillEntries(entries);
      expect(session.getActiveSkillEntries()).toEqual(entries);
    });
  });

  describe("resolveAgentName", () => {
    it("returns name from session context", () => {
      mockGetActiveAgentName.mockReturnValue("ctx-agent");
      const { session } = createSession();
      const ctx = makeCtx();

      expect(session.resolveAgentName(ctx)).toBe("ctx-agent");
    });

    it("falls back to system prompt", () => {
      mockGetActiveAgentName.mockReturnValue(null);
      mockGetActiveAgentNameFromSystemPrompt.mockReturnValue("prompt-agent");
      const { session } = createSession();
      const ctx = makeCtx();

      expect(session.resolveAgentName(ctx, "system prompt")).toBe("prompt-agent");
    });

    it("falls back to last known name", () => {
      const { session } = createSession();
      const ctx = makeCtx();

      mockGetActiveAgentName.mockReturnValue("first-agent");
      session.resolveAgentName(ctx);

      mockGetActiveAgentName.mockReturnValue(null);
      mockGetActiveAgentNameFromSystemPrompt.mockReturnValue(null);
      expect(session.resolveAgentName(ctx)).toBe("first-agent");
    });

    it("exposes lastKnownActiveAgentName", () => {
      const { session } = createSession();
      expect(session.lastKnownActiveAgentName).toBeNull();

      mockGetActiveAgentName.mockReturnValue("named");
      session.resolveAgentName(makeCtx());
      expect(session.lastKnownActiveAgentName).toBe("named");
    });
  });

  describe("infrastructure paths", () => {
    it("getInfrastructureReadDirs returns only piInfrastructureDirs", () => {
      const { session } = createSession();
      expect(session.getInfrastructureReadDirs()).toEqual(["/test/agent", "/test/agent/git"]);
    });
  });

  describe("config delegation", () => {
    it("refreshConfig delegates to configStore.refresh", () => {
      const { session, configStore } = createSession();
      const ctx = makeCtx();
      session.refreshConfig(ctx);
      expect(configStore.refresh).toHaveBeenCalledWith(ctx);
    });
  });

  describe("reload", () => {
    it("configures PermissionManager for current context cwd", () => {
      const pm = makePermissionManager();
      const { session } = createSession({ permissionManager: pm });
      const ctx = makeCtx({ cwd: "/project" });
      session.activate(ctx);

      session.reload();

      expect(pm.configureForCwd).toHaveBeenCalledWith("/project");
    });

    it("clears caches and skill entries", () => {
      const { session } = createSession();
      session.activeToolsGate.runIfChanged("k1", () => {});
      session.promptStateGate.runIfChanged("k2", () => {});
      session.setActiveSkillEntries([makeSkillEntry("s")]);

      session.reload();

      const toolsEffect = vi.fn();
      const promptEffect = vi.fn();
      session.activeToolsGate.runIfChanged("k1", toolsEffect);
      session.promptStateGate.runIfChanged("k2", promptEffect);
      expect(toolsEffect).toHaveBeenCalledOnce();
      expect(promptEffect).toHaveBeenCalledOnce();
      expect(session.getActiveSkillEntries()).toEqual([]);
    });
  });

  describe("getRuntimeContext", () => {
    it("returns null before activation", () => {
      const { session } = createSession();
      expect(session.getRuntimeContext()).toBeNull();
    });

    it("returns context after activation", () => {
      const { session } = createSession();
      const ctx = makeCtx();
      session.activate(ctx);
      expect(session.getRuntimeContext()).toBe(ctx);
    });

    it("returns null after deactivation", () => {
      const { session } = createSession();
      session.activate(makeCtx());
      session.deactivate();
      expect(session.getRuntimeContext()).toBeNull();
    });
  });

  describe("notify", () => {
    it("forwards the message to ctx.ui.notify with 'warning' severity after activation", () => {
      const { session } = createSession();
      const ctx = makeCtx();
      session.activate(ctx);

      session.notify("something went wrong");

      expect(ctx.ui.notify).toHaveBeenCalledOnce();
      expect(ctx.ui.notify).toHaveBeenCalledWith("something went wrong", "warning");
    });

    it("is a no-op and does not throw before activation", () => {
      const { session } = createSession();

      expect(() => session.notify("msg")).not.toThrow();
    });

    it("is a no-op and does not throw after deactivation", () => {
      const { session } = createSession();
      const ctx = makeCtx();
      session.activate(ctx);
      session.deactivate();

      expect(() => session.notify("msg")).not.toThrow();
    });
  });
});
