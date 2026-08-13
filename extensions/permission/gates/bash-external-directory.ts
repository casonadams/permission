import type { ScopedPermissionResolver } from "#src/policy/permission-resolver";
import { SessionApproval } from "#src/policy/session-approval";
import { deriveApprovalPattern } from "#src/policy/session-rules";
import type { PermissionCheckResult } from "#src/policy/types";
import { suggestSessionPattern } from "#src/prompting/pattern-suggest";
import { getNonEmptyString, toRecord } from "#src/shared/common";
import type { BashProgram } from "./bash-program";
import { pickMostRestrictive } from "./candidate-check";
import type { GateResult } from "./descriptor";
import { formatBashExternalDirectoryAskPrompt } from "./external-directory-messages";
import type { ToolCallContext } from "./types";

/**
 * Build a pure descriptor for the bash external-directory permission gate.
 *
 * Reads the external paths from the injected `BashProgram` and checks whether
 * any reference directories outside the working directory. Returns `null` when the gate
 * does not apply (tool is not bash, no CWD, or no external paths found).
 * Returns a `GateBypass` when all paths are allowed (by config or session rule).
 * Returns a `GateDescriptor` with multi-pattern sessionApproval for uncovered paths.
 */
export function describeBashExternalDirectoryGate(
  tcc: ToolCallContext,
  bashProgram: BashProgram | null,
  resolver: ScopedPermissionResolver,
): GateResult {
  const input = getBashExternalDirectoryInput(tcc, bashProgram);
  if (!input) return null;

  const { command, externalPaths } = input;

  const uncoveredEntries = getUncoveredExternalEntries(externalPaths, tcc, resolver);
  const uncoveredPaths = uncoveredEntries.map(({ path }) => path);

  if (uncoveredPaths.length === 0) return buildBashExternalDirectoryBypass(tcc, command, externalPaths);
  return buildBashExternalDirectoryDescriptor({ tcc, command, uncoveredEntries, uncoveredPaths });
}

type ExternalDirectoryEntry = { path: string; check: PermissionCheckResult };

type BashExternalDirectoryInput = { command: string; externalPaths: string[] };

function getBashExternalDirectoryInput(
  tcc: ToolCallContext,
  bashProgram: BashProgram | null,
): BashExternalDirectoryInput | null {
  if (tcc.toolName !== "bash") return null;
  if (!tcc.cwd) return null;
  if (!bashProgram) return null;
  return readBashExternalDirectoryInput(tcc, bashProgram, tcc.cwd);
}

function readBashExternalDirectoryInput(
  tcc: ToolCallContext,
  bashProgram: BashProgram,
  cwd: string,
): BashExternalDirectoryInput | null {
  const command = getNonEmptyString(toRecord(tcc.input).command);
  if (!command) return null;
  const externalPaths = bashProgram.externalPaths(cwd);
  return externalPaths.length > 0 ? { command, externalPaths } : null;
}

function getUncoveredExternalEntries(
  externalPaths: readonly string[],
  tcc: ToolCallContext,
  resolver: ScopedPermissionResolver,
): ExternalDirectoryEntry[] {
  return externalPaths
    .map((path) => ({ path, check: resolver.resolve("external_directory", { path }, tcc.agentName ?? undefined) }))
    .filter(({ check }) => check.state !== "allow");
}

function buildBashExternalDirectoryBypass(
  tcc: ToolCallContext,
  command: string,
  externalPaths: readonly string[],
): GateResult {
  return {
    action: "allow",
    log: {
      event: "permission_request.session_approved",
      details: {
        source: "tool_call",
        toolCallId: tcc.toolCallId,
        toolName: tcc.toolName,
        agentName: tcc.agentName,
        command,
        externalPaths,
        resolution: "session_approved",
      },
    },
  };
}

function buildDescriptorLogContext(
  args: { tcc: ToolCallContext; command: string; uncoveredPaths: string[] },
  message: string,
) {
  return {
    source: "tool_call" as const,
    toolCallId: args.tcc.toolCallId,
    toolName: args.tcc.toolName,
    agentName: args.tcc.agentName,
    command: args.command,
    externalPaths: args.uncoveredPaths,
    message,
  };
}

function buildBashExternalDirectoryDescriptor(args: {
  tcc: ToolCallContext;
  command: string;
  uncoveredEntries: ExternalDirectoryEntry[];
  uncoveredPaths: string[];
}): GateResult {
  const cwd = args.tcc.cwd ?? "";
  const message = formatBashExternalDirectoryAskPrompt({
    command: args.command,
    externalPaths: args.uncoveredPaths,
    cwd,
    agentName: args.tcc.agentName ?? undefined,
  });
  const worstCheck =
    pickMostRestrictive(args.uncoveredEntries.map(({ check }) => check)) ?? args.uncoveredEntries[0].check;

  return {
    surface: "external_directory",
    input: {},
    denialContext: {
      kind: "bash_external_directory",
      command: args.command,
      externalPaths: args.uncoveredPaths,
      cwd,
      agentName: args.tcc.agentName ?? undefined,
    },
    sessionApproval: SessionApproval.multiple(
      "external_directory",
      args.uncoveredPaths.map((p) => deriveApprovalPattern(p)),
    ),
    promptDetails: {
      source: "tool_call",
      agentName: args.tcc.agentName,
      message,
      toolCallId: args.tcc.toolCallId,
      toolName: args.tcc.toolName,
      command: args.command,
      promptSurface: "external_directory",
      promptValue: args.command,
      sessionLabel: buildExternalDirectorySessionLabel(args.uncoveredPaths),
      sessionPattern: deriveApprovalPattern(args.uncoveredPaths[0]),
    },
    logContext: buildDescriptorLogContext(args, message),
    decision: {
      surface: "external_directory",
      value: args.command,
    },
    preCheck: worstCheck,
  };
}

function buildExternalDirectorySessionLabel(paths: readonly string[]): string {
  if (paths.length === 1) {
    return suggestSessionPattern("external_directory", paths[0]).label;
  }
  return "Session: these directories";
}
