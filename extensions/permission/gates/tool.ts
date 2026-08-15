import { getPathBearingToolPath } from "#src/paths/path-utils";
import { SessionApproval } from "#src/policy/session-approval";
import type { PermissionCheckResult } from "#src/policy/types";
import { suggestSessionPattern } from "#src/prompting/pattern-suggest";
import { formatAskPrompt } from "#src/prompting/permission-prompts";
import type { ToolPreviewFormatter } from "#src/prompting/tool-preview-formatter";
import type { GateDescriptor } from "./descriptor";
import { deriveDecisionValue } from "./helpers";
import type { ToolCallContext } from "./types";

function deriveSuggestionValue(tcc: ToolCallContext, check: PermissionCheckResult): string {
  if (tcc.toolName === "bash") return check.command ?? "";
  if (tcc.toolName === "mcp") return check.target ?? "mcp";
  return pathBearingOrDefault(tcc);
}

function pathBearingOrDefault(tcc: ToolCallContext): string {
  return getPathBearingToolPath(tcc.toolName, tcc.input) ?? "*";
}

export function describeToolGate(
  tcc: ToolCallContext,
  check: PermissionCheckResult,
  formatter: ToolPreviewFormatter,
): GateDescriptor {
  const suggestion = suggestSessionPattern(tcc.toolName, deriveSuggestionValue(tcc, check));

  const askMessage = formatAskPrompt({
    result: check,
    agentName: tcc.agentName ?? undefined,
    input: tcc.input,
    formatter,
  });

  return {
    surface: tcc.toolName,
    input: tcc.input,
    preCheck: check,
    denialContext: {
      kind: "tool",
      check,
      agentName: tcc.agentName ?? undefined,
      input: tcc.input,
    },
    sessionApproval: SessionApproval.single(suggestion.surface, suggestion.pattern),
    promptDetails: {
      source: "tool_call",
      agentName: tcc.agentName,
      message: askMessage,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      sessionLabel: suggestion.label,
      sessionPattern: suggestion.pattern,
      command: check.command,
      target: check.target,
      toolInputPreview: formatter.formatToolInputForPrompt(tcc.toolName, tcc.input),
    },
    decision: {
      surface: tcc.toolName,
      value: deriveDecisionValue(tcc.toolName, check, getPathBearingToolPath(tcc.toolName, tcc.input) ?? undefined),
    },
  };
}
