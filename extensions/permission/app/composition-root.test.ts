import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createEventBus, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPermissionForwardingLocation,
  type ForwardedPermissionRequest,
} from "#src/forwarding/permission-forwarding";
import { SUBAGENT_CHILD_SESSION_CREATED } from "#src/forwarding/subagents/subagent-lifecycle-events";
import { getSubagentSessionRegistry } from "#src/forwarding/subagents/subagent-registry";
import piPermissionSystemExtension from "#src/index";
import { PERMISSIONS_READY_CHANNEL, PERMISSIONS_RPC_CHECK_CHANNEL } from "#src/integrations/permission-events";
import { getPermissionsService } from "#src/service";
import { makeFakePi } from "#test/helpers/make-fake-pi";
import { getGlobalConfigPath } from "../config/config-paths";
import { DEFAULT_EXTENSION_CONFIG } from "../config/extension-config";

const SERVICE_KEY = Symbol.for("@casonadams/permission:service");
const SUBAGENT_REGISTRY_KEY = Symbol.for("@casonadams/permission:subagent-registry");

const EXPECTED_HANDLERS = [
  "before_agent_start",
  "input",
  "resources_discover",
  "session_shutdown",
  "session_start",
  "tool_call",
];

let agentDir: string;

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "pi-perm-comp-root-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
});

afterEach(() => {
  const store = globalThis as Record<symbol, unknown>;

  Reflect.deleteProperty(store, SERVICE_KEY);
  Reflect.deleteProperty(store, SUBAGENT_REGISTRY_KEY);
  vi.unstubAllEnvs();
  rmSync(agentDir, { recursive: true, force: true });
});

function writeGlobalConfig(config: Record<string, unknown>): void {
  const globalConfigPath = getGlobalConfigPath(agentDir);
  mkdirSync(dirname(globalConfigPath), { recursive: true });
  writeFileSync(globalConfigPath, `${JSON.stringify({ ...DEFAULT_EXTENSION_CONFIG, ...config }, null, 2)}\n`, "utf8");
}

function makeChildCtx(cwd: string, sessionId: string): unknown {
  return {
    cwd,
    hasUI: false,
    sessionManager: {
      getEntries: (): unknown[] => [],
      getSessionId: (): string => sessionId,
      getSessionDir: (): string => cwd,
    },
    ui: {
      notify: (): void => {},
      setStatus: (): void => {},
      select: async (): Promise<string | undefined> => undefined,
      input: async (): Promise<string | undefined> => undefined,
    },
  };
}

type CustomPromptFactory = (...args: [tui: unknown, theme: unknown, kb: unknown, done: (value: unknown) => void]) => {
  render(width: number): string[];
};

function makeUiCtx(cwd: string, capturedTitles: string[]): { ctx: unknown } {
  const ctx = {
    cwd,
    hasUI: true,
    sessionManager: {
      getEntries: (): unknown[] => [],
      getSessionId: (): string => "ui-session",
      getSessionDir: (): string => cwd,
    },
    ui: {
      notify: (): void => {},
      setStatus: (): void => {},
      custom: async (factory: CustomPromptFactory, _opts: unknown): Promise<string> => {
        const component = factory(
          { requestRender(): void {} },
          {
            fg: (_c: unknown, t: string) => t,
            bg: (_c: unknown, t: string) => t,
            bold: (t: string) => t,
          },
          {},
          () => {},
        );
        capturedTitles.push(component.render(80).join("\n"));
        return "allow";
      },
      input: async (): Promise<string | undefined> => undefined,
    },
  };
  return { ctx };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function readFirstRequestFile(requestsDir: string): string | undefined {
  try {
    return readdirSync(requestsDir).find((file) => file.endsWith(".json"));
  } catch {
    return undefined;
  }
}

function fireSessionStart(pi: ReturnType<typeof makeFakePi>, ctx: unknown): Promise<unknown> {
  return pi.fire("session_start", { reason: "start" }, ctx);
}

async function approveForwardedRequest(
  forwardingDir: string,
  parentSessionId: string,
): Promise<ForwardedPermissionRequest> {
  const location = createPermissionForwardingLocation(forwardingDir, parentSessionId);
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const requestFile = readFirstRequestFile(location.requestsDir);
    if (requestFile) {
      const request = JSON.parse(
        readFileSync(join(location.requestsDir, requestFile), "utf8"),
      ) as ForwardedPermissionRequest;
      mkdirSync(location.responsesDir, { recursive: true });
      writeFileSync(
        join(location.responsesDir, `${request.id}.json`),
        JSON.stringify({
          approved: true,
          state: "approved",
          responderSessionId: parentSessionId,
          respondedAt: Date.now(),
        }),
        "utf8",
      );
      return request;
    }
    await sleep(5);
  }
  throw new Error("Timed out waiting for the forwarded permission request");
}

describe("event-handler registration completeness", () => {
  it("registers a handler for every required event exactly once", () => {
    const pi = makeFakePi();
    piPermissionSystemExtension(pi as unknown as ExtensionAPI);

    expect([...pi.handlers.keys()].sort()).toEqual(EXPECTED_HANDLERS);
  });
});

describe("subagent registry sharing across factory instances", () => {
  it("lets a child instance forward an ask it received via the parent's bus", async () => {
    writeGlobalConfig({
      permission: { "*": "allow", path: "ask" },
    });

    const childCwd = mkdtempSync(join(tmpdir(), "pi-perm-child-cwd-"));
    const externalDir = mkdtempSync(join(tmpdir(), "pi-perm-external-"));
    const forwardingDir = join(agentDir, "sessions", "permission-forwarding");
    const parentSessionId = "parent-session-1";
    const childSessionId = "child-session-1";

    const parentBus = createEventBus();
    const childBus = createEventBus();
    piPermissionSystemExtension(makeFakePi({ events: parentBus }) as unknown as ExtensionAPI);
    const childPi = makeFakePi({
      events: childBus,
      toolNames: ["read"],
    });
    piPermissionSystemExtension(childPi as unknown as ExtensionAPI);

    parentBus.emit(SUBAGENT_CHILD_SESSION_CREATED, {
      sessionId: childSessionId,
      parentSessionId,
    });

    await childPi.fire("session_start", { reason: "start" }, makeChildCtx(childCwd, childSessionId));
    const firePromise = childPi.fire(
      "tool_call",
      {
        toolName: "read",
        toolCallId: "child-external-read",
        input: { path: join(externalDir, "secret.txt") },
      },
      makeChildCtx(childCwd, childSessionId),
    );

    const request = await approveForwardedRequest(forwardingDir, parentSessionId);
    expect(request.targetSessionId).toBe(parentSessionId);
    expect(request.requesterSessionId).toBe(childSessionId);
    expect(request.source).toBe("tool_call");
    expect(request.surface).toBe("path");
    expect(request.value).toBe(join(externalDir, "secret.txt"));

    const result = (await firePromise) as { block?: true };
    expect(result.block).toBeUndefined();

    rmSync(childCwd, { recursive: true, force: true });
    rmSync(externalDir, { recursive: true, force: true });
  });
});

describe("shutdown teardown chain", () => {
  it("unpublishes the service and unsubscribes the lifecycle on shutdown", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-perm-teardown-cwd-"));
    const pi = makeFakePi();
    piPermissionSystemExtension(pi as unknown as ExtensionAPI);

    await fireSessionStart(pi, makeChildCtx(cwd, "top-session"));
    expect(getPermissionsService()).toBeDefined();

    await pi.fire("session_shutdown");

    expect(getPermissionsService()).toBeUndefined();

    pi.events.emit(SUBAGENT_CHILD_SESSION_CREATED, {
      sessionId: "late-child",
      parentSessionId: "p-late",
    });
    expect(getSubagentSessionRegistry().has("late-child")).toBe(false);

    rmSync(cwd, { recursive: true, force: true });
  });
});

describe("service and gate share one formatter registry", () => {
  it("surfaces a service-registered formatter in the gate's ask prompt", async () => {
    writeGlobalConfig({
      permission: { "*": "allow", demo: "ask" },
    });

    const cwd = mkdtempSync(join(tmpdir(), "pi-perm-ui-cwd-"));
    const pi = makeFakePi({ toolNames: ["demo"] });
    piPermissionSystemExtension(pi as unknown as ExtensionAPI);

    const capturedTitles: string[] = [];
    const { ctx } = makeUiCtx(cwd, capturedTitles);
    await fireSessionStart(pi, ctx);

    const previewMarker = "PREVIEW::shared-registry-proof";
    getPermissionsService()!.registerToolInputFormatter("demo", () => previewMarker);
    const result = (await pi.fire(
      "tool_call",
      { toolName: "demo", toolCallId: "demo-ask", input: { foo: "bar" } },
      ctx,
    )) as { block?: true };

    expect(result.block).toBeUndefined();
    expect(capturedTitles.some((t) => t.includes(previewMarker))).toBe(true);

    rmSync(cwd, { recursive: true, force: true });
  });
});

describe("service and gate share one access extractor registry", () => {
  it("path-gates a custom-shaped tool via a service-registered extractor", async () => {
    writeGlobalConfig({
      permission: { "*": "allow", path: { "*.env": "deny" } },
    });

    const cwd = mkdtempSync(join(tmpdir(), "pi-perm-ext-cwd-"));
    const pi = makeFakePi({ toolNames: ["ffgrep"] });
    piPermissionSystemExtension(pi as unknown as ExtensionAPI);

    const { ctx } = makeUiCtx(cwd, []);
    await fireSessionStart(pi, ctx);

    getPermissionsService()!.registerToolAccessExtractor("ffgrep", (input) =>
      typeof input.target === "string" ? input.target : undefined,
    );

    const result = (await pi.fire(
      "tool_call",
      { toolName: "ffgrep", toolCallId: "ff-1", input: { target: ".env" } },
      ctx,
    )) as { block?: true };

    expect(result.block).toBe(true);

    rmSync(cwd, { recursive: true, force: true });
  });
});

describe("ready emitted after service publication", () => {
  it("publishes the service before emitting permissions:ready", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-perm-ready-cwd-"));
    const seen: string[] = [];
    const pi = makeFakePi();
    pi.events.on(PERMISSIONS_READY_CHANNEL, () => {
      seen.push(getPermissionsService() ? "present" : "missing");
    });

    piPermissionSystemExtension(pi as unknown as ExtensionAPI);

    expect(seen).toEqual([]);

    await fireSessionStart(pi, makeChildCtx(cwd, "top-session"));

    expect(seen).toEqual(["present"]);

    rmSync(cwd, { recursive: true, force: true });
  });
});

describe("single source of truth for session state", () => {
  it("gate session-approval is visible to the RPC check and the service", async () => {
    writeGlobalConfig({
      permission: { "*": "allow", demo: "ask" },
    });

    const cwd = mkdtempSync(join(tmpdir(), "pi-perm-sot-cwd-"));
    const pi = makeFakePi({ toolNames: ["demo"] });
    piPermissionSystemExtension(pi as unknown as ExtensionAPI);

    const ctx = {
      cwd,
      hasUI: true,
      sessionManager: {
        getEntries: (): unknown[] => [],
        getSessionId: (): string => "sot-session",
        getSessionDir: (): string => cwd,
      },
      ui: {
        notify: (): void => {},
        setStatus: (): void => {},
        custom: async (): Promise<string> => "allow_session",
        input: async (): Promise<string | undefined> => undefined,
      },
    };

    await fireSessionStart(pi, ctx);

    await pi.fire(
      "tool_call",
      {
        toolName: "demo",
        toolCallId: "demo-for-session",
        input: { foo: "bar" },
      },
      ctx,
    );

    const rpcCheckChannel: string = PERMISSIONS_RPC_CHECK_CHANNEL;
    const requestId = "sot-rpc-1";
    const replyPromise = new Promise<unknown>((resolve) => {
      const unsub = pi.events.on(`${rpcCheckChannel}:reply:${requestId}`, (data) => {
        unsub();
        resolve(data);
      });
    });
    pi.events.emit(rpcCheckChannel, { requestId, surface: "demo" });
    const reply = (await replyPromise) as {
      success: boolean;
      data?: { result: string };
    };

    expect(reply.success).toBe(true);
    expect(reply.data?.result).toBe("allow");

    const serviceResult = getPermissionsService()!.checkPermission("demo");
    expect(serviceResult.state).toBe("allow");

    rmSync(cwd, { recursive: true, force: true });
  });
});

describe("multi-instance global service interplay", () => {
  it("keeps the parent's service published across the child's lifecycle", async () => {
    const parentCwd = mkdtempSync(join(tmpdir(), "pi-perm-parent-cwd-"));
    const childCwd = mkdtempSync(join(tmpdir(), "pi-perm-child-cwd-"));
    const childSessionId = "child-session-mi";

    const parentPi = makeFakePi({ events: createEventBus() });
    piPermissionSystemExtension(parentPi as unknown as ExtensionAPI);
    const childPi = makeFakePi({ events: createEventBus() });
    piPermissionSystemExtension(childPi as unknown as ExtensionAPI);

    await fireSessionStart(parentPi, makeChildCtx(parentCwd, "parent-session-mi"));
    const parentService = getPermissionsService();
    expect(parentService).toBeDefined();

    getSubagentSessionRegistry().register(childSessionId, {
      parentSessionId: "parent-session-mi",
    });
    await fireSessionStart(childPi, makeChildCtx(childCwd, childSessionId));

    expect(getPermissionsService()).toBe(parentService);

    await childPi.fire("session_shutdown");
    expect(getPermissionsService()).toBe(parentService);

    rmSync(parentCwd, { recursive: true, force: true });
    rmSync(childCwd, { recursive: true, force: true });
  });
});
