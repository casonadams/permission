import { vi } from "vitest";
import type { SkillPromptEntry } from "#src/app/skill-prompt-sanitizer";
import type { GateDescriptor } from "#src/gates/descriptor";
import { type DecisionReporter, GateRunner } from "#src/gates/runner";
import type { SkillInputGateInputs } from "#src/gates/skill-input-gate-pipeline";
import type { ToolCallGateInputs } from "#src/gates/tool-call-gate-pipeline";
import type { ToolCallContext } from "#src/gates/types";
import type { ScopedPermissionResolver } from "#src/policy/permission-resolver";
import type { SessionApprovalRecorder } from "#src/policy/session-rules";
import type { PermissionCheckResult } from "#src/policy/types";
import type { DenialContext } from "#src/prompting/denial-messages";
import type { GatePrompter } from "#src/prompting/gate-prompter";

import { makeCheckResult } from "#test/helpers/handler-fixtures";

export function makeResolver(defaultCheck?: PermissionCheckResult) {
  const resolve = vi.fn<ScopedPermissionResolver["resolve"]>();
  const resolvePathPolicy = vi.fn<ScopedPermissionResolver["resolvePathPolicy"]>();
  if (defaultCheck) {
    resolve.mockReturnValue(defaultCheck);
    resolvePathPolicy.mockReturnValue(defaultCheck);
  }
  return { resolve, resolvePathPolicy };
}

export function makeDescriptor(overrides: Partial<GateDescriptor> = {}): GateDescriptor {
  return {
    surface: "read",
    input: {},
    denialContext: {
      kind: "tool",
      check: makeCheckResult({ state: "deny", matchedPattern: "*" }),
    },
    promptDetails: {
      source: "tool_call",
      agentName: null,
      message: "Allow tool 'read'?",
      toolCallId: "tc-1",
      toolName: "read",
    },
    decision: {
      surface: "read",
      value: "read",
    },
    ...overrides,
  };
}

export function makeReporter(overrides: Partial<DecisionReporter> = {}): DecisionReporter {
  return {
    emitDecision: vi.fn(),
    ...overrides,
  };
}

interface GateRunnerOverrides {
  resolveResult?: PermissionCheckResult;
  resolve?: ScopedPermissionResolver["resolve"];
  resolvePathPolicy?: ScopedPermissionResolver["resolvePathPolicy"];
  recordSessionApproval?: SessionApprovalRecorder["recordSessionApproval"];
  canConfirm?: GatePrompter["canConfirm"];
  prompt?: GatePrompter["prompt"];
  reporter?: Partial<DecisionReporter>;
}

export function makeGateRunner(overrides: GateRunnerOverrides = {}) {
  const reporter = makeReporter(overrides.reporter);
  const resolve = resolvePermissionMock(overrides);
  const resolvePathPolicy = resolvePathPolicyMock(overrides);
  const recordSessionApproval = resolveRecorderMock(overrides);
  const canConfirm = resolveCanConfirmMock(overrides);
  const prompt = resolvePromptMock(overrides);
  const runner = new GateRunner({
    resolver: { resolve, resolvePathPolicy },
    recorder: { recordSessionApproval },
    defaultPrompter: { canConfirm, prompt },
    reporter,
  });
  return {
    runner,
    deps: {
      resolve,
      resolvePathPolicy,
      recordSessionApproval,
      canConfirm,
      prompt,
      reporter,
    },
  };
}

function defaultResolveResult(overrides: GateRunnerOverrides): PermissionCheckResult {
  return overrides.resolveResult ?? makeCheckResult({ matchedPattern: "*" });
}

function resolvePermissionMock(overrides: GateRunnerOverrides): ScopedPermissionResolver["resolve"] {
  return (
    overrides.resolve ?? vi.fn<ScopedPermissionResolver["resolve"]>().mockReturnValue(defaultResolveResult(overrides))
  );
}

function resolvePathPolicyMock(overrides: GateRunnerOverrides): ScopedPermissionResolver["resolvePathPolicy"] {
  return (
    overrides.resolvePathPolicy ??
    vi.fn<ScopedPermissionResolver["resolvePathPolicy"]>().mockReturnValue(defaultResolveResult(overrides))
  );
}

function resolveRecorderMock(overrides: GateRunnerOverrides): SessionApprovalRecorder["recordSessionApproval"] {
  return overrides.recordSessionApproval ?? (vi.fn() as SessionApprovalRecorder["recordSessionApproval"]);
}

function resolveCanConfirmMock(overrides: GateRunnerOverrides): GatePrompter["canConfirm"] {
  return overrides.canConfirm ?? (vi.fn().mockReturnValue(true) as GatePrompter["canConfirm"]);
}

function resolvePromptMock(overrides: GateRunnerOverrides): GatePrompter["prompt"] {
  return overrides.prompt ?? vi.fn<GatePrompter["prompt"]>().mockResolvedValue({ approved: true, state: "approved" });
}

export function makeDenialDescriptor(
  denialContext: DenialContext,
  overrides: Partial<GateDescriptor> = {},
): GateDescriptor {
  return {
    surface: "write",
    input: {},
    denialContext,
    promptDetails: {
      source: "tool_call",
      agentName: null,
      message: "Allow tool 'write'?",
      toolCallId: "tc-1",
      toolName: "write",
    },
    decision: {
      surface: "write",
      value: "write",
    },
    ...overrides,
  };
}

export function makeTcc(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    toolName: "bash",
    agentName: null,
    input: { command: "cat .env" },
    toolCallId: "tc-1",
    cwd: "/test/project",
    ...overrides,
  };
}

export function makePathDispatchResolver(
  byPath: Record<string, PermissionCheckResult>,
  defaultResult: PermissionCheckResult,
) {
  const resolve = vi.fn<ScopedPermissionResolver["resolve"]>();
  resolve.mockImplementation((_surface, input) => {
    const path = (input as Record<string, unknown>).path;
    if (typeof path === "string" && path in byPath) {
      return byPath[path];
    }
    return defaultResult;
  });
  const resolvePathPolicy = vi.fn<ScopedPermissionResolver["resolvePathPolicy"]>();
  resolvePathPolicy.mockImplementation((values) => {
    for (const value of values) {
      if (value in byPath) return byPath[value];
    }
    return defaultResult;
  });
  return { resolve, resolvePathPolicy };
}

export function makeGateCheckResult(overrides: Partial<PermissionCheckResult> = {}): PermissionCheckResult {
  return {
    toolName: "path",
    state: "allow",
    source: "special",
    origin: "global",
    ...overrides,
  };
}

export function makeGateInputs(
  overrides: { getActiveSkillEntries?: () => SkillPromptEntry[]; getInfrastructureReadDirs?: () => string[] } = {},
): ToolCallGateInputs {
  return {
    getActiveSkillEntries: overrides.getActiveSkillEntries ?? vi.fn<() => SkillPromptEntry[]>(() => []),
    getInfrastructureReadDirs: overrides.getInfrastructureReadDirs ?? vi.fn<() => string[]>(() => []),
  };
}

export function makeSkillInputInputs(
  overrides: { checkPermission?: SkillInputGateInputs["checkPermission"] } = {},
): SkillInputGateInputs {
  return {
    checkPermission:
      overrides.checkPermission ?? vi.fn<SkillInputGateInputs["checkPermission"]>().mockReturnValue(makeCheckResult()),
  };
}

export function makeNotifier() {
  return {
    warn: vi.fn<(message: string) => void>(),
  };
}
