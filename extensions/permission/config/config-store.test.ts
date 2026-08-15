import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigStore } from "./config-store";

const { mockCollectLegacyConfigIssues } = vi.hoisted(() => ({
  mockCollectLegacyConfigIssues: vi.fn(),
}));

vi.mock("./config-loader", () => ({
  collectLegacyConfigIssues: mockCollectLegacyConfigIssues,
}));

function makeCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return {
    cwd: "/test/project",
    hasUI: false,
    ui: { notify: vi.fn(), setStatus: vi.fn() },
    ...overrides,
  } as unknown as ExtensionContext;
}

function makePolicyProvider() {
  return { getConfigIssues: vi.fn().mockReturnValue([]) };
}

function makeStore(policyPaths = makePolicyProvider()): ConfigStore {
  return new ConfigStore({ agentDir: "/test/agent", policyPaths });
}

describe("ConfigStore", () => {
  beforeEach(() => {
    mockCollectLegacyConfigIssues.mockReset().mockReturnValue([]);
  });

  it("uses the current cwd to collect legacy config issues", () => {
    const store = makeStore();
    store.refresh(makeCtx({ cwd: "/my/project" }));
    expect(mockCollectLegacyConfigIssues).toHaveBeenCalledWith("/test/agent", "/my/project", expect.any(String));
  });

  it("uses an empty cwd when no context is available", () => {
    const store = makeStore();
    store.refresh();
    expect(mockCollectLegacyConfigIssues).toHaveBeenCalledWith("/test/agent", "", expect.any(String));
  });

  it("notifies policy issues", () => {
    const notify = vi.fn();
    const provider = makePolicyProvider();
    provider.getConfigIssues.mockReturnValue(["invalid active config"]);
    makeStore(provider).refresh(makeCtx({ hasUI: true, ui: { notify } as never }));
    expect(notify).toHaveBeenCalledWith("invalid active config", "warning");
  });

  it("does not repeat an unchanged warning", () => {
    const notify = vi.fn();
    const store = makeStore();
    const ctx = makeCtx({ hasUI: true, ui: { notify } as never });
    mockCollectLegacyConfigIssues.mockReturnValue(["persistent warning"]);
    store.refresh(ctx);
    store.refresh(ctx);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("allows a cleared warning to be reported again", () => {
    const notify = vi.fn();
    const store = makeStore();
    const ctx = makeCtx({ hasUI: true, ui: { notify } as never });
    mockCollectLegacyConfigIssues.mockReturnValue(["warning"]);
    store.refresh(ctx);
    mockCollectLegacyConfigIssues.mockReturnValue([]);
    store.refresh(ctx);
    mockCollectLegacyConfigIssues.mockReturnValue(["warning"]);
    store.refresh(ctx);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
