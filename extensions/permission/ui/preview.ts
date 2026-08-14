/**
 * Tool title and preview helpers, ported from the deleted `guard` extension.
 *
 * Only the helpers the local `prompter.ts` needs are kept:
 * `toolTitle` and `previewToolCall`. The webhook detection is private to
 * `toolTitle`. Decision-layer code (workspace checks, deny/allow logic)
 * is intentionally dropped -- the vendored permission system owns the
 * policy work; this file just produces the human-readable title and body
 * for the prompt.
 */

import { prefix } from "../gates/bash-arity";
import { formatBashCommandPreview } from "../prompting/bash-command-preview";

type ToolInput = Record<string, unknown> | undefined;

const WEBHOOK_KEYWORD = "webhook";

/** Longest subject rendered in a prompt title before truncation. */
const TITLE_SUBJECT_MAX_LENGTH = 60;

function readString(input: ToolInput, key: string): string {
  const value = input?.[key];
  return typeof value === "string" ? value : "";
}

function readMcpPreview(input: ToolInput): string {
  if (!input) return "";
  const parts = [input.action, input.server, input.tool].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return parts.join(" ");
}

function readSubagentPreview(input: ToolInput): string {
  const agent = readString(input, "agent");
  const task = readString(input, "task");
  if (agent && task) return `${agent}: ${truncate(task, 120)}`;
  if (agent) return agent;
  if (task) return truncate(task, 120);
  return "";
}

/**
 * Truncate `text` to at most `max` characters, appending an ellipsis if
 * the input was longer. The ellipsis is a single character so terminal
 * rendering doesn't wrap unexpectedly.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Resolve the MCP call being gated, so prompts name the target tool rather
 * than the generic `mcp` entry point.
 *
 * Prefers the `target` resolved by the permission check, then falls back to
 * composing the raw `server`/`tool` input fields. Empty when neither is known.
 */
function mcpTarget(input: ToolInput): string {
  const target = readString(input, "target");
  if (target) return target;
  const server = readString(input, "server");
  const tool = readString(input, "tool");
  return server && tool ? `${server}:${tool}` : tool;
}

/**
 * Identify a webhook-shaped call so the prompt title can call it out.
 * Matches tool names that contain "webhook" (case-insensitive) and
 * `mcp` calls whose target tool name contains "webhook".
 */
export function looksLikeWebhook(toolName: string, input: unknown): boolean {
  if (toolName.toLowerCase().includes(WEBHOOK_KEYWORD)) return true;
  if (toolName !== "mcp") return false;
  return mcpTarget(input as ToolInput)
    .toLowerCase()
    .includes(WEBHOOK_KEYWORD);
}

type TitledSubject = { label: string; subject: string };

function bashSubject(input: ToolInput): string {
  return prefix(readString(input, "command").split(/\s+/).filter(Boolean)).join(" ");
}

function skillName(toolName: string, input: ToolInput): string {
  return readString(input, "skillName") || (toolName === "skill" ? readString(input, "name") : "");
}

function isExternalDirectoryPrompt(input: ToolInput): boolean {
  return readString(input, "promptSurface") === "external_directory";
}

/**
 * Ordered most to least specific: the reason a call is gated outweighs the tool
 * it came through, so a read or bash command reaching outside the working
 * directory is titled by that boundary rather than by the tool.
 */
const SUBJECT_RESOLVERS: Array<(toolName: string, input: ToolInput) => TitledSubject | null> = [
  (toolName, input) => ({ label: "Skill", subject: skillName(toolName, input) }),
  (toolName, input) => (toolName === "mcp" ? { label: "MCP", subject: mcpTarget(input) } : null),
  (toolName, input) => (toolName === "bash" ? { label: "Bash", subject: bashSubject(input) } : null),
];

/**
 * Name the subject of a gated call and label it by what is being decided.
 * Returns `null` for calls whose identity is just their tool name.
 */
function titledSubject(toolName: string, input: ToolInput): TitledSubject | null {
  for (const resolve of SUBJECT_RESOLVERS) {
    const titled = resolve(toolName, input);
    if (titled?.subject) return titled;
  }
  return null;
}

/**
 * Build the prompt title. The category prefix ("Webhook" vs "Tool") is
 * the user's only signal that a call is webhook-shaped; calls that carry a
 * named subject are titled by it so a bare surface name like `mcp` or `bash`
 * never stands in for the real call.
 */
export function toolTitle(toolName: string, input: unknown): string {
  if (looksLikeWebhook(toolName, input)) {
    return `Webhook: ${mcpTarget(input as ToolInput) || toolName}`;
  }
  if (isExternalDirectoryPrompt(input as ToolInput)) {
    return `External ${toolName}`;
  }
  const titled = titledSubject(toolName, input as ToolInput);
  if (!titled) return `Tool: ${toolName}`;
  return `${titled.label}: ${truncate(titled.subject, TITLE_SUBJECT_MAX_LENGTH)}`;
}

const TOOL_PREVIEW_READERS: Record<string, (input: ToolInput) => string> = {
  bash: (input) => formatBashCommandPreview(readString(input, "command")),
  read: (input) => readString(input, "path"),
  write: (input) => readString(input, "path"),
  edit: (input) => readString(input, "path"),
  websearch: (input) => readString(input, "query"),
  webfetch: (input) => readString(input, "url"),
  mcp: readMcpPreview,
  subagent: readSubagentPreview,
};

/**
 * Shape a preview for display under a prompt title.
 *
 * The preview doubles as a clause in the agent-visible ask message, where it
 * needs the leading "with"; standalone in the dialog it does not. Drops the
 * body entirely when the title already states it, e.g. `Bash: pwd` over `pwd`.
 */
export function promptBody(title: string, preview: string): string {
  const body = preview.replace(/^with /, "");
  return body && title.endsWith(body) ? "" : body;
}

export function previewToolCall(toolName: string, input: unknown): string {
  const record = input as ToolInput;
  const reader = TOOL_PREVIEW_READERS[toolName];
  if (reader) return reader(record);
  return readString(record, "command") || readString(record, "path");
}
