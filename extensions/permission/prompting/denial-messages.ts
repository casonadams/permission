import type { BashCommandContext, PermissionCheckResult } from "../policy/types";

export const EXTENSION_TAG = "[permission]";

type AgentNamed = { agentName?: string };
type ToolDenialContext = AgentNamed & { kind: "tool"; check: PermissionCheckResult; input?: unknown };
type PathDenialContext = AgentNamed & {
  kind: "path";
  toolName: string;
  pathValue: string;
  cwd?: string;
};
type BashPathDenialContext = AgentNamed & {
  kind: "bash_path";
  command: string;
  pathValue: string;
  cwd?: string;
};
type SkillReadDenialContext = AgentNamed & { kind: "skill_read"; skillName: string; readPath: string };
type SkillInputDenialContext = AgentNamed & { kind: "skill_input"; skillName: string };

export type DenialContext =
  | ToolDenialContext
  | PathDenialContext
  | BashPathDenialContext
  | SkillReadDenialContext
  | SkillInputDenialContext;

export function formatDenyReason(ctx: DenialContext): string {
  return withExtensionTag(buildDenyBody(ctx));
}
export function formatUnavailableReason(ctx: DenialContext): string {
  return withExtensionTag(buildUnavailableBody(ctx));
}
export function formatUserDeniedReason(ctx: DenialContext, denialReason?: string): string {
  return withExtensionTag(buildUserDeniedBody(ctx, denialReason));
}
function withExtensionTag(body: string): string {
  return `${EXTENSION_TAG} ${body}`;
}

function subject(agentName?: string): string {
  return agentName ? `Agent '${agentName}'` : "Current agent";
}

function reasonSuffix(denialReason?: string): string {
  const reason = denialReason?.trim();
  if (!reason) return "";
  return ` Reason: ${reason}${/[.!?]$/.test(reason) ? "" : "."}`;
}

type DenialBodyBuilders = {
  [K in DenialContext["kind"]]: (ctx: Extract<DenialContext, { kind: K }>) => string;
};

const denyBodyBuilders: DenialBodyBuilders = {
  tool: buildToolDenyBody,
  path: (ctx) =>
    ctx.cwd
      ? `${subject(ctx.agentName)} is not permitted to run tool '${ctx.toolName}' for path '${ctx.pathValue}' outside working directory '${ctx.cwd}'.`
      : `${subject(ctx.agentName)} is not permitted to access path '${ctx.pathValue}' via tool '${ctx.toolName}'.`,
  bash_path: (ctx) =>
    ctx.cwd
      ? `${subject(ctx.agentName)} is not permitted to run bash command '${ctx.command}' which references path '${ctx.pathValue}' outside working directory '${ctx.cwd}'.`
      : `${subject(ctx.agentName)} is not permitted to access path '${ctx.pathValue}' via tool 'bash'.`,
  skill_read: (ctx) =>
    `${subject(ctx.agentName)} is not permitted to access skill '${ctx.skillName}' via '${ctx.readPath}'.`,
  skill_input: (ctx) => `${subject(ctx.agentName)} is not permitted to access skill '${ctx.skillName}'.`,
};

function buildDenyBody(ctx: DenialContext): string {
  return buildBody(denyBodyBuilders, ctx);
}

function buildToolDenyBody(ctx: Extract<DenialContext, { kind: "tool" }>): string {
  const parts: string[] = [];
  const { check, agentName } = ctx;

  if (agentName) parts.push(`Agent '${agentName}'`);
  parts.push(
    isMcpCheck(check)
      ? `is not permitted to run MCP target '${check.target}'`
      : `is not permitted to run '${check.toolName}'`,
  );
  if (check.command) parts.push(`command '${check.command}'`);

  const qualifier = matchQualifier(check.matchedPattern, check.commandContext);
  if (qualifier) parts.push(qualifier);
  return `${parts.join(" ")}.${reasonSuffix(check.reason)}`;
}

const BASH_CONTEXT_LABELS: Partial<Record<BashCommandContext, string>> = {
  command_substitution: "command substitution",
  process_substitution: "process substitution",
  subshell: "subshell",
};

export function describeBashCommandContext(context?: BashCommandContext): string | undefined {
  return context ? BASH_CONTEXT_LABELS[context] : undefined;
}

export function matchQualifier(matchedPattern?: string, context?: BashCommandContext): string {
  const parts: string[] = [];
  if (matchedPattern) parts.push(`matched '${matchedPattern}'`);
  const label = describeBashCommandContext(context);
  if (label) parts.push(`inside ${label}`);
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

const unavailableBodyBuilders: DenialBodyBuilders = {
  tool: buildToolUnavailableBody,
  path: (ctx) =>
    ctx.cwd
      ? `Accessing '${ctx.pathValue}' outside the working directory requires approval, but no interactive UI is available.`
      : `Accessing '${ctx.pathValue}' requires approval, but no interactive UI is available.`,
  bash_path: (ctx) => {
    if (ctx.cwd) {
      return `Bash command '${ctx.command}' references path '${ctx.pathValue}' outside the working directory and requires approval, but no interactive UI is available.`;
    }
    return `Bash command '${ctx.command}' accesses path '${ctx.pathValue}' which requires approval, but no interactive UI is available.`;
  },
  skill_read: (ctx) => `Accessing skill '${ctx.skillName}' requires approval, but no interactive UI is available.`,
  skill_input: (ctx) => `Accessing skill '${ctx.skillName}' requires approval, but no interactive UI is available.`,
};

function buildUnavailableBody(ctx: DenialContext): string {
  return buildBody(unavailableBodyBuilders, ctx);
}

function buildToolUnavailableBody(ctx: Extract<DenialContext, { kind: "tool" }>): string {
  const { check } = ctx;
  if (check.toolName === "bash" && check.command) {
    return `Running bash command '${check.command}' requires approval, but no interactive UI is available.`;
  }
  if (isMcpCheck(check)) return "Using tool 'mcp' requires approval, but no interactive UI is available.";
  return `Using tool '${check.toolName}' requires approval, but no interactive UI is available.`;
}

function buildUserDeniedBody(ctx: DenialContext, denialReason?: string): string {
  return `${buildUserDeniedBodyStart(ctx)}.${reasonSuffix(denialReason)}`;
}

function buildUserDeniedBodyStart(ctx: DenialContext): string {
  return buildBody(userDeniedBodyBuilders, ctx);
}

const userDeniedBodyBuilders: DenialBodyBuilders = {
  tool: buildToolUserDeniedBodyStart,
  path: (ctx) => `User denied access to path '${ctx.pathValue}'`,
  bash_path: (ctx) =>
    ctx.cwd
      ? `User denied external path access for bash command '${ctx.command}'`
      : `User denied path access for bash command '${ctx.command}' (path '${ctx.pathValue}')`,
  skill_read: (ctx) => `User denied access to skill '${ctx.skillName}'`,
  skill_input: (ctx) => `User denied access to skill '${ctx.skillName}'`,
};

function buildToolUserDeniedBodyStart(ctx: Extract<DenialContext, { kind: "tool" }>): string {
  const { check } = ctx;
  if (isMcpCheck(check)) return `User denied MCP target '${check.target}'`;
  if (check.toolName === "bash" && check.command) return `User denied bash command '${check.command}'`;
  return `User denied tool '${check.toolName}'`;
}

function buildBody(builders: DenialBodyBuilders, ctx: DenialContext): string {
  return builders[ctx.kind](ctx as never);
}

function isMcpCheck(check: PermissionCheckResult): boolean {
  return (check.source === "mcp" || check.toolName === "mcp") && !!check.target;
}
