import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import type { ExtensionPaths } from "#src/app/extension-paths";
import { PermissionSession } from "#src/app/permission-session";
import type { ForwardingController } from "#src/forwarding/forwarding-manager";
import type { SessionLogger } from "#src/integrations/session-logger";
import type { ScopedPermissionManager } from "#src/policy/permission-manager";
import { PermissionResolver } from "#src/policy/permission-resolver";
import type { Ruleset } from "#src/policy/rule";
import { SessionRules } from "#src/policy/session-rules";
import type { PermissionCheckResult, PermissionState } from "#src/policy/types";
import type { PromptingGatewayLifecycle } from "#src/prompting/prompting-gateway";
import type { SessionConfigStore } from "../../config/config-store";

export function makePaths(overrides: Partial<ExtensionPaths> = {}): ExtensionPaths {
  return {
    agentDir: "/test/agent",
    sessionsDir: "/test/agent/sessions",
    subagentSessionsDir: "/test/agent/subagent-sessions",
    forwardingDir: "/test/agent/sessions/permission-forwarding",
    globalLogsDir: "/test/agent/logs",
    piInfrastructureDirs: ["/test/agent", "/test/agent/git"],
    ...overrides,
  };
}

export function makeLogger(): SessionLogger {
  return {
    review: vi.fn(),
    warn: vi.fn(),
  };
}

export function makeConfigStore(overrides: Partial<SessionConfigStore> = {}): SessionConfigStore {
  return {
    refresh: overrides.refresh ?? vi.fn<(ctx?: ExtensionContext) => void>(),
    logResolvedPaths: overrides.logResolvedPaths ?? vi.fn<() => void>(),
  };
}

export function makeGateway(): PromptingGatewayLifecycle {
  return {
    activate: vi.fn<PromptingGatewayLifecycle["activate"]>(),
    deactivate: vi.fn<PromptingGatewayLifecycle["deactivate"]>(),
  };
}

export function makeForwarding(): ForwardingController {
  return {
    start: vi.fn(),
    stop: vi.fn(),
  };
}

export function makeFakePermissionManager() {
  return {
    configureForCwd: vi.fn<(cwd: string | undefined | null) => void>(),
    checkPermission: vi.fn<ScopedPermissionManager["checkPermission"]>().mockReturnValue({
      state: "allow",
      toolName: "read",
      source: "tool",
      origin: "builtin",
    }),
    checkPathPolicy: vi
      .fn<(values: readonly string[], agentName?: string, sessionRules?: Ruleset) => PermissionCheckResult>()
      .mockReturnValue({
        state: "allow",
        toolName: "path",
        source: "special",
        origin: "builtin",
      }),
    getToolPermission: vi.fn<(toolName: string, agentName?: string) => PermissionState>().mockReturnValue("allow"),
    getConfigIssues: vi.fn((): string[] => []),
    getPolicyCacheStamp: vi.fn((): string => "stamp-1"),
  };
}

export interface RealSessionOverrides {
  paths?: Partial<ExtensionPaths>;
  logger?: SessionLogger;
  forwarding?: ForwardingController;
  permissionManager?: ScopedPermissionManager;
  sessionRules?: SessionRules;
  configStore?: SessionConfigStore;
  gateway?: PromptingGatewayLifecycle;
}

export interface RealSessionHarness {
  session: PermissionSession;
  paths: ExtensionPaths;
  logger: SessionLogger;
  forwarding: ForwardingController;
  permissionManager: ReturnType<typeof makeFakePermissionManager>;
  sessionRules: SessionRules;
  configStore: SessionConfigStore;
  gateway: PromptingGatewayLifecycle;
}

export function makeRealSession(overrides: RealSessionOverrides = {}): RealSessionHarness {
  const deps = makeRealSessionDeps(overrides);
  const session = new PermissionSession(deps);
  return { session, ...deps };
}

function makeRealSessionDeps(overrides: RealSessionOverrides) {
  return {
    paths: makePaths(overrides.paths),
    logger: resolveLogger(overrides),
    forwarding: resolveForwarding(overrides),
    permissionManager: resolvePermissionManager(overrides),
    sessionRules: resolveSessionRules(overrides),
    configStore: resolveConfigStore(overrides),
    gateway: resolveGateway(overrides),
  };
}

function resolveLogger(overrides: RealSessionOverrides): SessionLogger {
  return overrides.logger ?? makeLogger();
}

function resolveForwarding(overrides: RealSessionOverrides): ForwardingController {
  return overrides.forwarding ?? makeForwarding();
}

function resolvePermissionManager(overrides: RealSessionOverrides): ReturnType<typeof makeFakePermissionManager> {
  return (
    (overrides.permissionManager as ReturnType<typeof makeFakePermissionManager> | undefined) ??
    makeFakePermissionManager()
  );
}

function resolveSessionRules(overrides: RealSessionOverrides): SessionRules {
  return overrides.sessionRules ?? new SessionRules();
}

function resolveConfigStore(overrides: RealSessionOverrides): SessionConfigStore {
  return overrides.configStore ?? makeConfigStore();
}

function resolveGateway(overrides: RealSessionOverrides): PromptingGatewayLifecycle {
  return overrides.gateway ?? makeGateway();
}

export function makeRealResolver(
  manager?: ReturnType<typeof makeFakePermissionManager>,
  sessionRules?: SessionRules,
): {
  resolver: PermissionResolver;
  manager: ReturnType<typeof makeFakePermissionManager>;
  sessionRules: SessionRules;
} {
  const resolvedManager = manager ?? makeFakePermissionManager();
  const resolvedRules = sessionRules ?? new SessionRules();
  const resolver = new PermissionResolver(resolvedManager, resolvedRules);
  return { resolver, manager: resolvedManager, sessionRules: resolvedRules };
}
