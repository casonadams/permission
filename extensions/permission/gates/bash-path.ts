import type { ScopedPermissionResolver } from "#src/policy/permission-resolver";
import { SessionApproval } from "#src/policy/session-approval";
import { deriveApprovalPattern } from "#src/policy/session-rules";
import type { PermissionCheckResult } from "#src/policy/types";
import { getNonEmptyString, toRecord } from "#src/shared/common";
import type { BashPathRuleCandidate, BashProgram } from "./bash-program";
import { pickMostRestrictive } from "./candidate-check";
import type { GateResult } from "./descriptor";
import { formatPathAskPrompt } from "./path";
import type { ToolCallContext } from "./types";

/**
 * Build a pure descriptor for the cross-cutting path permission gate (bash).
 *
 * Reads path-rule candidates from the injected `BashProgram` (the broader
 * `path`-rule filter, accepting dot-files and relative paths). Each candidate
 * pairs the raw token with cd-aware policy values; the gate evaluates those
 * values against the `path` permission surface and returns the most
 * restrictive result, while prompts, logs, and session approvals use the raw
 * token.
 *
 * Returns `null` when the gate does not apply (tool is not bash, no command,
 * no tokens extracted, or all tokens evaluate to `allow`).
 * Returns a `GateBypass` when all tokens are session-covered.
 * Returns a `GateDescriptor` for the most restrictive token needing a check.
 */
export function describeBashPathGate(
  tcc: ToolCallContext,
  bashProgram: BashProgram | null,
  resolver: ScopedPermissionResolver,
): GateResult {
  const input = getBashPathInput(tcc, bashProgram);
  if (!input) return null;

  const analysis = analyzePathCandidates(input.candidates, tcc, resolver);
  if (analysis.allSessionCovered) return buildBashPathBypass(tcc, input);

  const restriction = choosePathRestriction(analysis.uncovered);
  if (!restriction) return null;

  return buildBashPathDescriptor(tcc, input.command, restriction);
}

type BashPathInput = { command: string; candidates: BashPathRuleCandidate[]; tokens: string[] };
type PathRestriction = { token: string; check: PermissionCheckResult };

type PathCandidateAnalysis = {
  allSessionCovered: boolean;
  uncovered: PathRestriction[];
};

function getBashPathInput(tcc: ToolCallContext, bashProgram: BashProgram | null): BashPathInput | null {
  if (tcc.toolName !== "bash" || !bashProgram) return null;
  const command = getNonEmptyString(toRecord(tcc.input).command);
  if (!command) return null;
  const candidates = bashProgram.pathRuleCandidates(tcc.cwd);
  return candidates.length > 0 ? { command, candidates, tokens: candidates.map(({ token }) => token) } : null;
}

function analyzePathCandidates(
  candidates: BashPathRuleCandidate[],
  tcc: ToolCallContext,
  resolver: ScopedPermissionResolver,
): PathCandidateAnalysis {
  return candidates.reduce<PathCandidateAnalysis>(
    (analysis, candidate) => {
      if (analysis.uncovered.some(({ check }) => check.state === "deny")) return analysis;
      return updatePathCandidateAnalysis({ analysis, candidate, tcc, resolver });
    },
    { allSessionCovered: true, uncovered: [] },
  );
}

function updatePathCandidateAnalysis(args: {
  analysis: PathCandidateAnalysis;
  candidate: BashPathRuleCandidate;
  tcc: ToolCallContext;
  resolver: ScopedPermissionResolver;
}): PathCandidateAnalysis {
  const check = args.resolver.resolvePathPolicy(args.candidate.policyValues, args.tcc.agentName ?? undefined);
  if (isDefaultPathAllow(check)) return { ...args.analysis, allSessionCovered: false };
  return {
    allSessionCovered: args.analysis.allSessionCovered && check.source === "session",
    uncovered: appendUncoveredPath(args.analysis.uncovered, args.candidate.token, check),
  };
}

function appendUncoveredPath(
  uncovered: PathRestriction[],
  token: string,
  check: PermissionCheckResult,
): PathRestriction[] {
  return check.state === "deny" || check.state === "ask" ? [...uncovered, { token, check }] : uncovered;
}

function isDefaultPathAllow(check: PermissionCheckResult): boolean {
  return check.matchedPattern === undefined && check.source !== "session";
}

function choosePathRestriction(uncovered: PathRestriction[]): PathRestriction | null {
  const worstCheck = pickMostRestrictive(uncovered.map(({ check }) => check));
  if (!worstCheck) return null;
  return uncovered.find(({ check }) => check === worstCheck) ?? null;
}

function buildBashPathBypass(tcc: ToolCallContext, input: BashPathInput): GateResult {
  return {
    action: "allow",
    log: {
      event: "permission_request.session_approved",
      details: {
        source: "tool_call",
        toolCallId: tcc.toolCallId,
        toolName: tcc.toolName,
        agentName: tcc.agentName,
        command: input.command,
        tokens: input.tokens,
        resolution: "session_approved",
      },
    },
  };
}

function buildBashPathDescriptor(tcc: ToolCallContext, command: string, restriction: PathRestriction): GateResult {
  const message = formatPathAskPrompt(tcc.toolName, restriction.token, tcc.agentName ?? undefined);
  return {
    surface: "path",
    input: { path: restriction.token },
    denialContext: {
      kind: "bash_path",
      command,
      pathValue: restriction.token,
      agentName: tcc.agentName ?? undefined,
    },
    sessionApproval: SessionApproval.single("path", deriveApprovalPattern(restriction.token)),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      message,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      command,
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      command,
      path: restriction.token,
    },
    decision: {
      surface: "path",
      value: restriction.token,
    },
    preCheck: restriction.check,
  };
}
