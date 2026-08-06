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

type ToolInput = Record<string, unknown> | undefined;

const WEBHOOK_KEYWORD = "webhook";

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

/**
 * Build the prompt title. The category prefix ("Webhook" vs "Tool") is
 * the user's only signal that a call is webhook-shaped; MCP calls are named
 * by their target so `mcp` alone never stands in for the real call.
 */
export function toolTitle(toolName: string, input: unknown): string {
  const target = toolName === "mcp" ? mcpTarget(input as ToolInput) : "";
  if (looksLikeWebhook(toolName, input)) {
    return `Webhook: ${target || toolName}`;
  }
  return target ? `MCP: ${target}` : `Tool: ${toolName}`;
}

const TOOL_PREVIEW_READERS: Record<string, (input: ToolInput) => string> = {
  bash: (input) => readString(input, "command"),
  read: (input) => readString(input, "path"),
  write: (input) => readString(input, "path"),
  edit: (input) => readString(input, "path"),
  websearch: (input) => readString(input, "query"),
  webfetch: (input) => readString(input, "url"),
  mcp: readMcpPreview,
  subagent: readSubagentPreview,
};

export function previewToolCall(toolName: string, input: unknown): string {
  const record = input as ToolInput;
  const reader = TOOL_PREVIEW_READERS[toolName];
  return reader ? reader(record) : readString(record, "command") || "";
}
