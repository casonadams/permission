import type { ToolAccessExtractorLookup } from "#src/integrations/tool-access-extractor-registry";
import {
  canonicalNormalizePathForComparison,
  getToolInputPath,
  isPathOutsideWorkingDirectory,
  isPiInfrastructureRead,
} from "#src/paths/path-utils";
import type { ScopedPermissionResolver } from "#src/policy/permission-resolver";
import { SessionApproval } from "#src/policy/session-approval";
import { deriveApprovalPattern } from "#src/policy/session-rules";
import type { PermissionCheckResult } from "#src/policy/types";
import type { GateDescriptor, GateResult } from "./descriptor";
import type { ToolCallContext } from "./types";

// eslint-disable-next-line max-lines-per-function, max-params, complexity -- Linear checks keep policy precedence auditable.
export function describePathGate(
  tcc: ToolCallContext,
  resolver: ScopedPermissionResolver,
  extractors?: ToolAccessExtractorLookup,
  infraDirs?: readonly string[],
): GateResult {
  if (!tcc.cwd) return null;

  const filePath = getToolInputPath(tcc.toolName, tcc.input, extractors);
  if (!filePath) return null;

  const agentName = tcc.agentName ?? undefined;
  const resolvedCheck = resolver.resolve("path", { path: filePath }, agentName);
  const pathIsExternal = isPathOutsideWorkingDirectory(filePath, tcc.cwd);
  const hasExplicitRule = resolvedCheck.matchedPattern !== undefined || resolvedCheck.source === "session";
  if (!hasExplicitRule && !pathIsExternal) return null;

  const check: PermissionCheckResult =
    !hasExplicitRule && pathIsExternal ? { ...resolvedCheck, state: "ask", source: "special" } : resolvedCheck;
  if (check.state === "allow") return null;

  if (
    infraDirs &&
    pathIsExternal &&
    isPiInfrastructureRead({
      toolName: tcc.toolName,
      normalizedPath: canonicalNormalizePathForComparison(filePath, tcc.cwd),
      infrastructureDirs: [...infraDirs],
      cwd: tcc.cwd,
    })
  ) {
    return {
      action: "allow",
      log: {
        event: "permission_request.infrastructure_auto_allowed",
        details: {
          source: "tool_call",
          toolCallId: tcc.toolCallId,
          toolName: tcc.toolName,
          agentName: tcc.agentName,
          path: filePath,
        },
      },
      decision: {
        surface: tcc.toolName,
        value: filePath,
        result: "allow",
        resolution: "infrastructure_auto_allowed",
        origin: null,
        agentName: tcc.agentName ?? null,
        matchedPattern: null,
      },
    };
  }

  const pattern = deriveApprovalPattern(filePath);

  const message = pathIsExternal
    ? formatPathOutsideCwdAskPrompt({ toolName: tcc.toolName, pathValue: filePath, cwd: tcc.cwd, agentName })
    : formatPathAskPrompt(tcc.toolName, filePath, agentName);

  const descriptor: GateDescriptor = {
    surface: "path",
    input: { path: filePath },
    denialContext: {
      kind: "path",
      toolName: tcc.toolName,
      pathValue: filePath,
      cwd: pathIsExternal ? tcc.cwd : undefined,
      agentName,
    },
    sessionApproval: SessionApproval.single("path", pattern),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      message,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      path: filePath,
      promptSurface: "path",
      promptValue: filePath,
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      path: filePath,
      message,
      outsideWorkingDirectory: pathIsExternal,
    },
    decision: {
      surface: "path",
      value: filePath,
    },
    preCheck: check,
  };

  return descriptor;
}

export function formatPathAskPrompt(toolName: string, pathValue: string, agentName?: string): string {
  const subject = agentName ? `Agent '${agentName}'` : "Current agent";
  return `${subject} requested tool '${toolName}' for path '${pathValue}'. Allow this path access?`;
}

export function formatPathOutsideCwdAskPrompt(args: {
  toolName: string;
  pathValue: string;
  cwd: string;
  agentName?: string;
}): string {
  const subject = args.agentName ? `Agent '${args.agentName}'` : "Current agent";
  return `${subject} requested tool '${args.toolName}' for path '${args.pathValue}' outside working directory '${args.cwd}'. Allow this path access?`;
}
