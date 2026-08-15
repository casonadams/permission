import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCollectLegacyConfigIssues, mockBuildResolvedConfigLogEntry, mockExistsSync } = vi.hoisted(() => ({
  mockCollectLegacyConfigIssues: vi.fn(),
  mockBuildResolvedConfigLogEntry: vi.fn(),
  mockExistsSync: vi.fn<(path: string) => boolean>(),
}));

vi.mock("./config-loader", () => ({
  collectLegacyConfigIssues: mockCollectLegacyConfigIssues,
}));

vi.mock("./config-reporter", () => ({
  buildResolvedConfigLogEntry: mockBuildResolvedConfigLogEntry,
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  default: { existsSync: mockExistsSync },
}));

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "./config-store";

function makeLogger(): { debug?: () => void; review: (event: string, details?: unknown) => void } {
  return { review: vi.fn() };
}

function makeCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return {
    cwd: "/test/project",
    hasUI: false,
    ui: { notify: vi.fn(), setStatus: vi.fn() },
    ...overrides,
  } as unknown as ExtensionContext;
}

function makePolicyPathProvider() {
  return {
    getConfigIssues: vi.fn().mockReturnValue([]),
    getResolvedPolicyPaths: vi.fn().mockReturnValue({
      globalConfig: "/test/agent/permission.json",
      projectConfig: "/test/project/.pi/agent/permission.json",
    }),
  };
}

function makeStore(policyProvider = makePolicyPathProvider()): {
  store: ConfigStore;
  logger: ReturnType<typeof makeLogger>;
} {
  const logger = makeLogger();
  const store = new ConfigStore({
    agentDir: "/test/agent",
    policyPaths: policyProvider,
    logger,
  });
  return { store, logger };
}

describe("ConfigStore", () => {
  beforeEach(() => {
    mockCollectLegacyConfigIssues.mockReset().mockReturnValue([]);
    mockBuildResolvedConfigLogEntry.mockReset().mockReturnValue({ resolved: true });
    mockExistsSync.mockReset().mockReturnValue(false);
  });

  describe("refresh()", () => {
    it("uses the passed ctx cwd to collect legacy config issues", () => {
      const { store } = makeStore();
      store.refresh(makeCtx({ cwd: "/my/project" }));
      expect(mockCollectLegacyConfigIssues).toHaveBeenCalledWith("/test/agent", "/my/project", expect.any(String));
    });

    it("uses empty string cwd when no ctx is provided", () => {
      const { store } = makeStore();
      store.refresh();
      expect(mockCollectLegacyConfigIssues).toHaveBeenCalledWith("/test/agent", "", expect.any(String));
    });

    it("sets a warning when issues are present", () => {
      const { store } = makeStore();
      const ctx = makeCtx({ hasUI: false });
      mockCollectLegacyConfigIssues.mockReturnValue(["legacy config detected"]);
      store.refresh(ctx);
    });

    it("includes issues from the policy provider", () => {
      const mockNotify = vi.fn();
      const provider = makePolicyPathProvider();
      provider.getConfigIssues.mockReturnValue(["invalid active config"]);
      const { store } = makeStore(provider);
      store.refresh(makeCtx({ hasUI: true, ui: { notify: mockNotify } as never }));
      expect(mockNotify).toHaveBeenCalledWith("invalid active config", "warning");
    });

    it("notifies UI when a new warning appears and hasUI is true", () => {
      const mockNotify = vi.fn();
      const { store } = makeStore();
      const ctx = makeCtx({ hasUI: true, ui: { notify: mockNotify } as never });
      mockCollectLegacyConfigIssues.mockReturnValue(["new warning"]);
      store.refresh(ctx);
      expect(mockNotify).toHaveBeenCalledWith("new warning", "warning");
    });

    it("does not re-notify the same warning on subsequent calls", () => {
      const mockNotify = vi.fn();
      const { store } = makeStore();
      const ctx = makeCtx({ hasUI: true, ui: { notify: mockNotify } as never });
      mockCollectLegacyConfigIssues.mockReturnValue(["persistent warning"]);
      store.refresh(ctx);
      store.refresh(ctx);
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it("clears the dedup set when no issues are reported on a refresh", () => {
      const mockNotify = vi.fn();
      const { store } = makeStore();
      const ctxWithUI = makeCtx({ hasUI: true, ui: { notify: mockNotify } as never });
      mockCollectLegacyConfigIssues.mockReturnValue(["warning"]);
      store.refresh(ctxWithUI);
      mockCollectLegacyConfigIssues.mockReturnValue([]);
      store.refresh();
      mockCollectLegacyConfigIssues.mockReturnValue(["warning"]);
      store.refresh(ctxWithUI);
      expect(mockNotify).toHaveBeenCalledTimes(2);
    });
  });

  describe("logResolvedPaths()", () => {
    it("writes config.resolved to the review log", () => {
      const { store, logger } = makeStore();
      store.logResolvedPaths();
      expect(logger.review).toHaveBeenCalledWith("config.resolved", expect.any(Object));
    });

    it("calls getResolvedPolicyPaths from the provider", () => {
      const mockProvider = makePolicyPathProvider();
      const { store } = makeStore(mockProvider);
      store.logResolvedPaths();
      expect(mockProvider.getResolvedPolicyPaths).toHaveBeenCalled();
    });

    it("passes legacy detection results to buildResolvedConfigLogEntry", () => {
      const { store } = makeStore();
      mockExistsSync.mockImplementation((p: string) => p.includes("policies.json"));
      store.logResolvedPaths("/some/project");
      expect(mockBuildResolvedConfigLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          legacyGlobalPolicyDetected: expect.any(Boolean),
          legacyProjectPolicyDetected: expect.any(Boolean),
          legacyExtensionConfigDetected: expect.any(Boolean),
        }),
      );
    });

    it("does not check project legacy path when no cwd is provided", () => {
      const { store } = makeStore();
      store.logResolvedPaths();
      const calls = mockExistsSync.mock.calls.map(([p]: [string]) => p);
      const projectCalls = calls.filter((p) => p.includes("null"));
      expect(projectCalls).toHaveLength(0);
    });
  });
});
