import { prefix } from "../gates/bash-arity";
import { formatBashCommandPreview } from "../prompting/bash-command-preview";

type ToolInput = Record<string, unknown> | undefined;

const WEBHOOK_KEYWORD = "webhook";

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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function mcpTarget(input: ToolInput): string {
  const target = readString(input, "target");
  if (target) return target;
  const server = readString(input, "server");
  const tool = readString(input, "tool");
  return server && tool ? `${server}:${tool}` : tool;
}

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

const SUBJECT_RESOLVERS: Array<(toolName: string, input: ToolInput) => TitledSubject | null> = [
  (toolName, input) => ({ label: "Skill", subject: skillName(toolName, input) }),
  (toolName, input) => (toolName === "mcp" ? { label: "MCP", subject: mcpTarget(input) } : null),
  (toolName, input) => (toolName === "bash" ? { label: "Bash", subject: bashSubject(input) } : null),
];

function pathAccessSubject(input: ToolInput): TitledSubject | null {
  const path = readString(input, "path");
  return input?.promptSurface === "path" && path ? { label: "Path access", subject: path } : null;
}

function titledSubject(toolName: string, input: ToolInput): TitledSubject | null {
  const pathSubject = pathAccessSubject(input);
  if (pathSubject) return pathSubject;

  for (const resolve of SUBJECT_RESOLVERS) {
    const titled = resolve(toolName, input);
    if (titled?.subject) return titled;
  }
  return null;
}

export function toolTitle(toolName: string, input: unknown): string {
  if (looksLikeWebhook(toolName, input)) {
    return `Webhook: ${mcpTarget(input as ToolInput) || toolName}`;
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
