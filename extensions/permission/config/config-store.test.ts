import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadAndMergeConfigs, mockBuildResolvedConfigLogEntry, mockExistsSync } = vi.hoisted(() => ({
  mockLoadAndMergeConfigs: vi.fn(),
  mockBuildResolvedConfigLogEntry: vi.fn(),
  mockExistsSync: vi.fn<(path: string) => boolean>(),
}));

vi.mock("./config-loader", () => ({
  loadAndMergeConfigs: mockLoadAndMergeConfigs,
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
    mockLoadAndMergeConfigs.mockReset().mockReturnValue({ merged: {}, issues: [] });
    mockBuildResolvedConfigLogEntry.mockReset().mockReturnValue({ resolved: true });
    mockExistsSync.mockReset().mockReturnValue(false);
  });

  describe("current()", () => {
    it("returns an empty object before any refresh", () => {
      const { store } = makeStore();
      expect(store.current()).toEqual({});
    });
  });

  describe("refresh()", () => {
    it("uses the passed ctx cwd for loadAndMergeConfigs", () => {
      const { store } = makeStore();
      store.refresh(makeCtx({ cwd: "/my/project" }));
      expect(mockLoadAndMergeConfigs).toHaveBeenCalledWith("/test/agent", "/my/project", expect.any(String));
    });

    it("uses empty string cwd when no ctx is provided", () => {
      const { store } = makeStore();
      store.refresh();
      expect(mockLoadAndMergeConfigs).toHaveBeenCalledWith("/test/agent", "", expect.any(String));
    });

    it("sets a warning when issues are present", () => {
      const { store } = makeStore();
      const ctx = makeCtx({ hasUI: false });
      mockLoadAndMergeConfigs.mockReturnValue({
        merged: {},
        issues: ["legacy config detected"],
      });
      store.refresh(ctx);
    });

    it("notifies UI when a new warning appears and hasUI is true", () => {
      const mockNotify = vi.fn();
      const { store } = makeStore();
      const ctx = makeCtx({ hasUI: true, ui: { notify: mockNotify } as never });
      mockLoadAndMergeConfigs.mockReturnValue({
        merged: {},
        issues: ["new warning"],
      });
      store.refresh(ctx);
      expect(mockNotify).toHaveBeenCalledWith("new warning", "warning");
    });

    it("does not re-notify the same warning on subsequent calls", () => {
      const mockNotify = vi.fn();
      const { store } = makeStore();
      const ctx = makeCtx({ hasUI: true, ui: { notify: mockNotify } as never });
      mockLoadAndMergeConfigs.mockReturnValue({
        merged: {},
        issues: ["persistent warning"],
      });
      store.refresh(ctx);
      store.refresh(ctx);
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it("clears the dedup set when no issues are reported on a refresh", () => {
      const mockNotify = vi.fn();
      const { store } = makeStore();
      const ctxWithUI = makeCtx({ hasUI: true, ui: { notify: mockNotify } as never });
      mockLoadAndMergeConfigs.mockReturnValue({ merged: {}, issues: ["warning"] });
      store.refresh(ctxWithUI);
      mockLoadAndMergeConfigs.mockReturnValue({ merged: {}, issues: [] });
      store.refresh();
      mockLoadAndMergeConfigs.mockReturnValue({ merged: {}, issues: ["warning"] });
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
