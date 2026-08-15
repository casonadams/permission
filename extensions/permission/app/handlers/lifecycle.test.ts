import { describe, expect, it, vi } from "vitest";

import { SessionLifecycleHandler } from "#src/app/handlers/lifecycle";
import type { ServiceLifecycle } from "#src/integrations/service-lifecycle";

import { makeCtx } from "#test/helpers/handler-fixtures";
import { makeRealResolver, makeRealSession } from "#test/helpers/session-fixtures";

vi.mock("../status", () => ({
  PERMISSION_SYSTEM_STATUS_KEY: "permission",
  syncPermissionSystemStatus: vi.fn(),
  getPermissionSystemStatus: vi.fn(),
}));

function makeSetup(opts?: { configIssues?: string[] }) {
  const { session, permissionManager, sessionRules, forwarding, configStore } = makeRealSession();
  const { resolver } = makeRealResolver(permissionManager, sessionRules);
  if (opts?.configIssues) {
    vi.mocked(permissionManager.getConfigIssues).mockReturnValue(opts.configIssues);
  }
  const serviceLifecycle: ServiceLifecycle = {
    activate: vi.fn<ServiceLifecycle["activate"]>(),
    teardown: vi.fn<ServiceLifecycle["teardown"]>(),
  };
  const notifier = { warn: vi.fn() };
  const handler = new SessionLifecycleHandler({ session, resolver, serviceLifecycle, notifier });
  return {
    handler,
    session,
    resolver,
    permissionManager,
    notifier,
    forwarding,
    configStore,
    serviceLifecycle,
  };
}

describe("handleSessionStart", () => {
  it("refreshes config with ctx", async () => {
    const ctx = makeCtx();
    const { handler, configStore } = makeSetup();
    await handler.handleSessionStart({ reason: "startup" }, ctx);
    expect(configStore.refresh).toHaveBeenCalledWith(ctx);
  });

  it("calls resetForNewSession with ctx", async () => {
    const ctx = makeCtx();
    const { handler, session } = makeSetup();
    const spy = vi.spyOn(session, "resetForNewSession");
    await handler.handleSessionStart({ reason: "startup" }, ctx);
    expect(spy).toHaveBeenCalledWith(ctx);
  });

  it("resolves agent name from ctx", async () => {
    const ctx = makeCtx();
    const { handler, session } = makeSetup();
    const spy = vi.spyOn(session, "resolveAgentName");
    await handler.handleSessionStart({ reason: "startup" }, ctx);
    expect(spy).toHaveBeenCalledWith(ctx);
  });

  it("notifies each policy issue", async () => {
    const { handler, notifier } = makeSetup({
      configIssues: ["issue A", "issue B"],
    });
    await handler.handleSessionStart({ reason: "startup" }, makeCtx());
    expect(notifier.warn).toHaveBeenCalledWith("issue A");
    expect(notifier.warn).toHaveBeenCalledWith("issue B");
  });

  it("does not warn when there are no policy issues", async () => {
    const { handler, notifier } = makeSetup();
    await handler.handleSessionStart({ reason: "startup" }, makeCtx());
    expect(notifier.warn).not.toHaveBeenCalled();
  });

  it("activates the service for the session with ctx", async () => {
    const ctx = makeCtx();
    const { handler, serviceLifecycle } = makeSetup();
    await handler.handleSessionStart({ reason: "startup" }, ctx);
    expect(serviceLifecycle.activate).toHaveBeenCalledWith(ctx);
  });

  it("configures the session before refreshing config diagnostics", async () => {
    const callOrder: string[] = [];
    const { handler, session, configStore } = makeSetup();
    vi.spyOn(configStore, "refresh").mockImplementation(() => {
      callOrder.push("refreshConfig");
    });
    vi.spyOn(session, "resetForNewSession").mockImplementation(() => {
      callOrder.push("resetForNewSession");
    });
    await handler.handleSessionStart({ reason: "startup" }, makeCtx());
    expect(callOrder).toEqual(["resetForNewSession", "refreshConfig"]);
  });
});

describe("handleResourcesDiscover", () => {
  it("does nothing when reason is not reload", async () => {
    const { handler, session } = makeSetup();
    const spy = vi.spyOn(session, "reload");
    await handler.handleResourcesDiscover({ reason: "startup" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls reload on the session on reload", async () => {
    const { handler, session } = makeSetup();
    const spy = vi.spyOn(session, "reload");
    await handler.handleResourcesDiscover({ reason: "reload" });
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("handleSessionShutdown", () => {
  it("clears UI status when runtime context is present", async () => {
    const ctx = makeCtx();
    const { handler, session } = makeSetup();
    session.activate(ctx);
    await handler.handleSessionShutdown();
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("permission", undefined);
  });

  it("does not throw when runtime context is null", async () => {
    const { handler } = makeSetup();
    await expect(handler.handleSessionShutdown()).resolves.not.toThrow();
  });

  it("calls shutdown on the session", async () => {
    const { handler, session } = makeSetup();
    const spy = vi.spyOn(session, "shutdown");
    await handler.handleSessionShutdown();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("calls serviceLifecycle.teardown", async () => {
    const { handler, serviceLifecycle } = makeSetup();
    await handler.handleSessionShutdown();
    expect(serviceLifecycle.teardown).toHaveBeenCalledOnce();
  });
});
