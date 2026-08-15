import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import { PermissionGateHandler } from "#src/app/handlers/permission-gate-handler";
import { GateRunner } from "#src/gates/runner";
import { type SkillInputGateInputs, SkillInputGatePipeline } from "#src/gates/skill-input-gate-pipeline";
import { type ToolCallGateInputs, ToolCallGatePipeline } from "#src/gates/tool-call-gate-pipeline";
import type { PermissionDecisionEvent } from "#src/integrations/permission-events";
import { emitDecisionEvent, PERMISSIONS_DECISION_CHANNEL } from "#src/integrations/permission-events";
import type { ToolRegistry } from "#src/integrations/tool-registry";
import type { Rule } from "#src/policy/rule";
import { SessionRules } from "#src/policy/session-rules";
import type { PermissionCheckResult, PermissionState } from "#src/policy/types";
import type { GatePrompter } from "#src/prompting/gate-prompter";
import { makeRealResolver, makeRealSession } from "#test/helpers/session-fixtures";

export type MockGateHandlerSession = ToolCallGateInputs &
  SkillInputGateInputs & {
    checkPermission(surface: string, input: unknown, agentName?: string, rules?: Rule[]): PermissionCheckResult;
  };

export function makeEvents() {
  return {
    emit: vi.fn(),
    on: vi.fn().mockReturnValue(() => undefined),
  };
}

export function makeCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return {
    cwd: "/test/project",
    hasUI: true,
    ui: {
      setStatus: vi.fn(),
      notify: vi.fn(),
      select: vi.fn(),
      input: vi.fn(),
    },
    sessionManager: {
      getEntries: vi.fn().mockReturnValue([]),
      getSessionDir: vi.fn().mockReturnValue("/sessions/test"),
      addEntry: vi.fn(),
    },
    ...overrides,
  } as unknown as ExtensionContext;
}

export function makeToolCallEvent(toolName: string, extraFields: Record<string, unknown> = {}) {
  return {
    type: "tool_call",
    toolCallId: "tc-1",
    name: toolName,
    input: {},
    ...extraFields,
  };
}

export function makeCheckResult(overrides: Partial<PermissionCheckResult> = {}): PermissionCheckResult {
  return {
    state: "allow",
    toolName: "read",
    source: "tool",
    origin: "builtin",
    ...overrides,
  };
}

export function makeToolRegistry(overrides: Partial<ToolRegistry> = {}): ToolRegistry {
  return {
    getAll: vi.fn().mockReturnValue([{ name: "read" }, { name: "bash" }]),
    getActive: vi.fn().mockReturnValue(["read", "bash"]),
    setActive: vi.fn(),
    ...overrides,
  };
}

export function makeSurfaceCheck(
  bySurface: Record<string, Partial<PermissionCheckResult> & { state: PermissionState }>,
  defaultResult: Partial<PermissionCheckResult> & { state: PermissionState } = {
    state: "allow",
  },
) {
  return vi.fn<MockGateHandlerSession["checkPermission"]>().mockImplementation((surface): PermissionCheckResult => {
    const base = bySurface[surface] ?? defaultResult;
    return {
      toolName: surface,
      source: "tool",
      origin: "builtin",
      ...base,
    };
  });
}

export function makeBashCommandCheck(opts: { deny: RegExp; denyMatched: string; allowMatched?: string }) {
  return vi
    .fn<MockGateHandlerSession["checkPermission"]>()
    .mockImplementation((surface, input): PermissionCheckResult => {
      if (surface === "bash") {
        const command = (input as { command?: string }).command ?? "";
        return opts.deny.test(command)
          ? makeCheckResult({
              state: "deny",
              source: "bash",
              command,
              matchedPattern: opts.denyMatched,
            })
          : makeCheckResult({
              state: "allow",
              source: "bash",
              command,
              matchedPattern: opts.allowMatched,
            });
      }
      return makeCheckResult({ state: "allow" });
    });
}

export function makeHandler(overrides?: {
  session?: Partial<MockGateHandlerSession> & {
    resolveAgentName?: (ctx: ExtensionContext, systemPrompt?: string) => string | null;
  };
  prompter?: GatePrompter;
  toolRegistry?: Partial<ToolRegistry>;
  tools?: string[];
}) {
  const { session, permissionManager, sessionRules, forwarding } = makeRealSession();
  const { resolver } = makeRealResolver(permissionManager, sessionRules);

  applySessionOverrides(session, permissionManager, overrides?.session);

  const events = makeEvents();
  const toolRegistry = makeHandlerToolRegistry(overrides);

  const recorder = new SessionRules();
  const pipeline = new ToolCallGatePipeline({ resolver, inputs: session });
  const skillInputPipeline = new SkillInputGatePipeline(resolver);
  const reporter = { emitDecision: (event: PermissionDecisionEvent) => emitDecisionEvent(events, event) };
  const prompter = makeHandlerPrompter(overrides);
  const runner = new GateRunner({ resolver, recorder, defaultPrompter: prompter, reporter });
  const handler = new PermissionGateHandler({ session, toolRegistry, pipeline, skillInputPipeline, runner });
  return {
    handler,
    events,
    session,
    toolRegistry,
    prompter,
    recorder,
    permissionManager,
    forwarding,
  };
}

function applySessionOverrides(
  session: ReturnType<typeof makeRealSession>["session"],
  permissionManager: ReturnType<typeof makeRealSession>["permissionManager"],
  overrides:
    | (Partial<MockGateHandlerSession> & {
        resolveAgentName?: (ctx: ExtensionContext, systemPrompt?: string) => string | null;
      })
    | undefined,
): void {
  if (!overrides) return;
  applyPermissionCheckOverride(permissionManager, overrides.checkPermission);
  applySessionSpyOverrides(session, overrides);
}

function applySessionSpyOverrides(
  session: ReturnType<typeof makeRealSession>["session"],
  overrides: NonNullable<Parameters<typeof applySessionOverrides>[2]>,
): void {
  applyOptionalSpy(session, "getActiveSkillEntries", overrides.getActiveSkillEntries);
  applyOptionalSpy(session, "getInfrastructureReadDirs", overrides.getInfrastructureReadDirs);
  applyOptionalSpy(session, "resolveAgentName", overrides.resolveAgentName);
}

type SessionSpyMethod = "getActiveSkillEntries" | "getInfrastructureReadDirs" | "resolveAgentName";

function applyOptionalSpy<TMethod extends SessionSpyMethod>(
  session: ReturnType<typeof makeRealSession>["session"],
  method: TMethod,
  implementation: ReturnType<typeof makeRealSession>["session"][TMethod] | undefined,
): void {
  if (implementation) vi.spyOn(session, method).mockImplementation(implementation as never);
}

function applyPermissionCheckOverride(
  permissionManager: ReturnType<typeof makeRealSession>["permissionManager"],
  surfaceCheck: MockGateHandlerSession["checkPermission"] | undefined,
): void {
  if (!surfaceCheck) return;
  vi.mocked(permissionManager.checkPermission).mockImplementation(surfaceCheck);
  vi.mocked(permissionManager.checkPathPolicy).mockImplementation((values, agentName, sessionRules) =>
    surfaceCheck("path", { path: values[0] ?? "*" }, agentName, sessionRules),
  );
}

function makeHandlerToolRegistry(overrides: Parameters<typeof makeHandler>[0] | undefined): ToolRegistry {
  if (overrides?.tools === undefined) return makeToolRegistry(overrides?.toolRegistry);
  return makeToolRegistry({ getAll: vi.fn().mockReturnValue(overrides.tools.map((name) => ({ name }))) });
}

function makeHandlerPrompter(overrides: Parameters<typeof makeHandler>[0] | undefined): GatePrompter {
  return (
    overrides?.prompter ?? {
      canConfirm: vi.fn().mockReturnValue(true),
      prompt: vi.fn<GatePrompter["prompt"]>().mockResolvedValue({ approved: true, state: "approved" }),
    }
  );
}

export function getDecisionEvents(events: ReturnType<typeof makeEvents>): PermissionDecisionEvent[] {
  return events.emit.mock.calls
    .filter(([channel]) => channel === PERMISSIONS_DECISION_CHANNEL)
    .map(([, payload]) => payload as PermissionDecisionEvent);
}
