import type { SkillPromptEntry } from "../app/skill-prompt-sanitizer";
import type { PermissionCheckResult } from "../policy/types";
import { getNonEmptyString, toRecord } from "../shared/common";
import { matchQualifier } from "./denial-messages";
import type { ToolPreviewFormatter } from "./tool-preview-formatter";

// NOTE: formatDenyReason, formatUserDeniedReason, and
// formatPermissionHardStopHint have been moved to denial-messages.ts.
// This module retains only pre-check messages and user-facing ask prompts.

export function formatMissingToolNameReason(): string {
  return "Tool call was blocked because no tool name was provided. Use a registered tool name from pi.getAllTools().";
}

export function formatUnknownToolReason(toolName: string, availableToolNames: readonly string[]): string {
  const preview = availableToolNames.slice(0, 10);
  const suffix = availableToolNames.length > preview.length ? ", ..." : "";
  const availableList = preview.length > 0 ? `${preview.join(", ")}${suffix}` : "none";

  const mcpHint =
    toolName === "mcp"
      ? ""
      : ' If this was intended as an MCP server tool, call the registered \'mcp\' tool when available (for example: {"tool":"server:tool"}).';

  return `Tool '${toolName}' is not registered in this runtime and was blocked before permission checks.${mcpHint} Registered tools: ${availableList}.`;
}

export interface FormatAskPromptArgs {
  result: PermissionCheckResult;
  agentName?: string;
  input?: unknown;
  formatter?: ToolPreviewFormatter;
}

export function formatAskPrompt(args: FormatAskPromptArgs): string {
  const subject = args.agentName ? `Agent '${args.agentName}'` : "Current agent";
  if (args.result.toolName === "bash") return formatBashAskPrompt(args, subject);
  if (isMcpAsk(args.result)) return formatMcpAskPrompt(args, subject);
  return formatToolAskPrompt(args, subject);
}

function formatBashAskPrompt(args: FormatAskPromptArgs, subject: string): string {
  const subCommand = args.result.command ?? "";
  const qualifier = matchQualifier(args.result.matchedPattern, args.result.commandContext);
  const qualifierInfo = qualifier ? ` ${qualifier}` : "";
  const fullCommandInfo = formatFullCommandInfo(args.input, subCommand);
  return `${subject} requested bash command '${subCommand}'${qualifierInfo}${fullCommandInfo}. Allow this command?`;
}

function formatFullCommandInfo(input: unknown, subCommand: string): string {
  const fullCommand = getNonEmptyString(toRecord(input).command);
  return fullCommand && fullCommand !== subCommand ? ` (full command: '${fullCommand}')` : "";
}

function isMcpAsk(result: PermissionCheckResult): boolean {
  return (result.source === "mcp" || result.toolName === "mcp") && Boolean(result.target);
}

function formatMcpAskPrompt(args: FormatAskPromptArgs, subject: string): string {
  const patternInfo = formatMatchedPattern(args.result.matchedPattern);
  const previewSuffix = formatPreviewSuffix(args.formatter, "mcp", args.input);
  return `${subject} requested MCP target '${args.result.target}'${patternInfo}${previewSuffix}. Allow this call?`;
}

function formatToolAskPrompt(args: FormatAskPromptArgs, subject: string): string {
  const patternInfo = formatMatchedPattern(args.result.matchedPattern);
  const inputSuffix = formatPreviewSuffix(args.formatter, args.result.toolName, args.input);
  return `${subject} requested tool '${args.result.toolName}'${patternInfo}${inputSuffix}. Allow this call?`;
}

function formatMatchedPattern(pattern: string | undefined): string {
  return pattern ? ` (matched '${pattern}')` : "";
}

function formatPreviewSuffix(formatter: ToolPreviewFormatter | undefined, toolName: string, input: unknown): string {
  const preview = formatter ? formatter.formatToolInputForPrompt(toolName, input) : "";
  return preview ? ` ${preview}` : "";
}

export function formatSkillAskPrompt(skillName: string, agentName?: string): string {
  const subject = agentName ? `Agent '${agentName}'` : "Current agent";
  return `${subject} requested skill '${skillName}'. Allow loading this skill?`;
}

export function formatSkillPathAskPrompt(skill: SkillPromptEntry, readPath: string, agentName?: string): string {
  const subject = agentName ? `Agent '${agentName}'` : "Current agent";
  return `${subject} requested access to skill '${skill.name}' via '${readPath}'. Allow this read?`;
}

// formatSkillPathDenyReason has been moved to denial-messages.ts.
