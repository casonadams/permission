import type { DenialContext } from "./denial-messages";

function subject(agentName?: string): string {
  return agentName ? `Agent '${agentName}'` : "Current agent";
}

function reasonSuffix(reason?: string): string {
  const normalized = reason?.trim();
  return normalized ? ` Reason: ${normalized}${/[.!?]$/.test(normalized) ? "" : "."}` : "";
}

export function formatPathDenyBody(ctx: Extract<DenialContext, { kind: "path" }>): string {
  if (ctx.matchedPattern)
    return `Path denied: '${ctx.pathValue}' (matched '${ctx.matchedPattern}').${reasonSuffix(ctx.reason)}`;
  if (ctx.cwd) return `External path denied: '${ctx.pathValue}'.`;
  return `${subject(ctx.agentName)} is not permitted to access path '${ctx.pathValue}' via tool '${ctx.toolName}'.`;
}

export function formatBashPathDenyBody(ctx: Extract<DenialContext, { kind: "bash_path" }>): string {
  if (ctx.matchedPattern)
    return `Path denied: '${ctx.pathValue}' (matched '${ctx.matchedPattern}').${reasonSuffix(ctx.reason)}`;
  if (ctx.cwd) return `External path denied: '${ctx.pathValue}'.`;
  return `${subject(ctx.agentName)} is not permitted to access path '${ctx.pathValue}' via tool 'bash'.`;
}
