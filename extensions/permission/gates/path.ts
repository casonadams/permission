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
import type { GateDescriptor, GateResult } from "./descriptor";
import type { ToolCallContext } from "./types";

/**
 * Build a pure descriptor for the cross-cutting path permission gate (tools).
 *
 * Returns `null` when the gate does not apply (tool is not path-bearing,
 * no extractable path, the `path` surface evaluates to `allow`, no
 * explicit `path` rule matched and the path is inside the working
 * directory, or the path is a read against a Pi infrastructure
 * directory and the user has opted into the infrastructure bypass).
 *
 * For paths outside the working directory with no matching explicit
 * rule, the gate returns a `GateDescriptor` so the user is prompted by
 * default. This is the collapse of the former separate
 * `external_directory` gate.
 */
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
  const check = resolver.resolve("path", { path: filePath }, agentName);

  if (check.state === "allow") return null;

  // No explicit path rule matched — only the synthesized default fired.
  // Inside the working directory the default is "allow" (no prompt).
  // Outside the working directory the default still prompts, so fall
  // through and produce a GateDescriptor below.
  const pathIsExternal = isPathOutsideWorkingDirectory(filePath, tcc.cwd);
  if (check.matchedPattern === undefined && !pathIsExternal) return null;

  // Read against a known Pi infrastructure directory bypasses the
  // gate so the agent can read Pi's own bundled files (#issue 11).
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
    ? formatPathOutsideCwdAskPrompt(tcc.toolName, filePath, tcc.cwd, agentName)
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

export function formatPathOutsideCwdAskPrompt(
  toolName: string,
  pathValue: string,
  cwd: string,
  agentName?: string,
): string {
  const subject = agentName ? `Agent '${agentName}'` : "Current agent";
  return `${subject} requested tool '${toolName}' for path '${pathValue}' outside working directory '${cwd}'. Allow this path access?`;
}
