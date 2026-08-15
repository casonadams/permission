import { canonicalNormalizePathForComparison } from "#src/paths/path-utils";
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

// eslint-disable-next-line complexity -- Linear checks keep candidate precedence auditable.
export function describeBashPathGate(
  tcc: ToolCallContext,
  bashProgram: BashProgram | null,
  resolver: ScopedPermissionResolver,
): GateResult {
  const input = getBashPathInput(tcc, bashProgram);
  if (!input) return null;

  const analysis = analyzePathCandidates(input.candidates, tcc, resolver);
  if (analysis.allSessionCovered) return buildBashPathBypass();

  const restriction = choosePathRestriction(analysis.uncovered);
  if (!restriction) return null;

  if (restriction.check.matchedPattern === undefined && tcc.cwd) {
    const cwd = tcc.cwd;
    const externalPaths = bashProgram?.externalPaths(cwd) ?? [];
    const candidate = input.candidates.find(({ token }) => token === restriction.token);
    const isExternal = candidate?.policyValues.some((value) =>
      externalPaths.includes(canonicalNormalizePathForComparison(value, cwd)),
    );
    if (!isExternal) return null;
  }

  return buildBashPathDescriptor({ tcc, command: input.command, restriction, cwd: tcc.cwd });
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
  const resolvedCheck = args.resolver.resolvePathPolicy(args.candidate.policyValues, args.tcc.agentName ?? undefined);
  const check: PermissionCheckResult =
    resolvedCheck.matchedPattern === undefined && resolvedCheck.source !== "session"
      ? { ...resolvedCheck, state: "ask", source: "special" }
      : resolvedCheck;
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

function choosePathRestriction(uncovered: PathRestriction[]): PathRestriction | null {
  const worstCheck = pickMostRestrictive(uncovered.map(({ check }) => check));
  if (!worstCheck) return null;
  return uncovered.find(({ check }) => check === worstCheck) ?? null;
}

function buildBashPathBypass(): GateResult {
  return { action: "allow" };
}

function buildBashPathDescriptor(args: {
  tcc: ToolCallContext;
  command: string;
  restriction: PathRestriction;
  cwd: string | undefined;
}): GateResult {
  const { tcc, command, restriction, cwd } = args;
  const message = formatPathAskPrompt(tcc.toolName, restriction.token, tcc.agentName ?? undefined);
  return {
    surface: "path",
    input: { path: restriction.token },
    denialContext: {
      kind: "bash_path",
      command,
      pathValue: restriction.token,
      cwd,
      matchedPattern: restriction.check.matchedPattern,
      reason: restriction.check.reason,
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
      path: restriction.token,
      promptSurface: "path",
      promptValue: restriction.token,
    },
    decision: {
      surface: "path",
      value: restriction.token,
    },
    preCheck: restriction.check,
  };
}
