import type { ToolAccessExtractorLookup } from "#src/integrations/tool-access-extractor-registry";
import {
  canonicalNormalizePathForComparison,
  getToolInputPath,
  isPathOutsideWorkingDirectory,
  isPiInfrastructureRead,
} from "#src/paths/path-utils";
import { SessionApproval } from "#src/policy/session-approval";
import { suggestSessionPattern } from "#src/prompting/pattern-suggest";
import type { GateResult } from "./descriptor";
import { formatExternalDirectoryAskPrompt } from "./external-directory-messages";
import type { ToolCallContext } from "./types";

/**
 * Build a pure descriptor for the external-directory permission gate.
 *
 * Returns `null` when the gate does not apply (no CWD, tool is not
 * path-bearing, or path is inside the working directory).
 * Returns a `GateBypass` for Pi infrastructure reads.
 * Returns a `GateDescriptor` for external paths needing a permission check.
 */
export function describeExternalDirectoryGate(
  tcc: ToolCallContext,
  infraDirs: string[],
  extractors?: ToolAccessExtractorLookup,
): GateResult {
  if (!tcc.cwd) return null;

  const externalDirectoryPath = getToolInputPath(tcc.toolName, tcc.input, extractors);
  if (!externalDirectoryPath) return null;

  if (!isPathOutsideWorkingDirectory(externalDirectoryPath, tcc.cwd)) {
    return null;
  }

  const normalizedExtPath = canonicalNormalizePathForComparison(externalDirectoryPath, tcc.cwd);

  if (
    isPiInfrastructureRead({
      toolName: tcc.toolName,
      normalizedPath: normalizedExtPath,
      infrastructureDirs: infraDirs,
      cwd: tcc.cwd,
    })
  ) {
    return buildInfrastructureBypass(tcc, externalDirectoryPath);
  }

  return buildExternalDirectoryDescriptor(tcc, externalDirectoryPath, normalizedExtPath);
}

function buildInfrastructureBypass(tcc: ToolCallContext, path: string): GateResult {
  return {
    action: "allow",
    log: {
      event: "permission_request.infrastructure_auto_allowed",
      details: {
        source: "tool_call",
        toolCallId: tcc.toolCallId,
        toolName: tcc.toolName,
        agentName: tcc.agentName,
        path,
      },
    },
    decision: {
      surface: tcc.toolName,
      value: path,
      result: "allow",
      resolution: "infrastructure_auto_allowed",
      origin: null,
      agentName: tcc.agentName ?? null,
      matchedPattern: null,
    },
  };
}

function buildExternalDirectoryDescriptor(
  tcc: ToolCallContext,
  externalDirectoryPath: string,
  normalizedExtPath: string,
): GateResult {
  const cwd = tcc.cwd ?? "";
  const message = formatExternalDirectoryAskPrompt({
    toolName: tcc.toolName,
    pathValue: externalDirectoryPath,
    cwd,
    agentName: tcc.agentName ?? undefined,
  });

  const approval = suggestSessionPattern("external_directory", normalizedExtPath);

  return {
    surface: "external_directory",
    input: { path: normalizedExtPath },
    denialContext: {
      kind: "external_directory",
      toolName: tcc.toolName,
      pathValue: externalDirectoryPath,
      cwd,
      agentName: tcc.agentName ?? undefined,
    },
    sessionApproval: SessionApproval.single("external_directory", approval.pattern),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      message,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      path: externalDirectoryPath,
      promptSurface: "external_directory",
      promptValue: externalDirectoryPath,
      sessionLabel: approval.label,
      sessionPattern: approval.pattern,
    },
    logContext: {
      source: "tool_call",
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      agentName: tcc.agentName,
      path: externalDirectoryPath,
      message,
    },
    decision: {
      surface: "external_directory",
      value: externalDirectoryPath,
    },
  };
}
