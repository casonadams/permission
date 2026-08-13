import { getActiveAgentName, getActiveAgentNameFromSystemPrompt } from "#src/app/active-agent";
import type { ForwardedPermissionRequest, ForwardedPermissionResponse } from "#src/forwarding/permission-forwarding";
import { SUBAGENT_PARENT_SESSION_ENV_CANDIDATES } from "#src/forwarding/permission-forwarding";
import { toRecord } from "#src/shared/common";
import type { ForwardedResponsePoll, ForwarderContext } from "./permission-forwarder-types";

export function getSessionId(ctx: ForwarderContext): string {
  try {
    const sessionId = ctx.sessionManager.getSessionId();
    if (typeof sessionId === "string" && sessionId.trim()) return sessionId.trim();
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function getContextSystemPrompt(ctx: ForwarderContext): string | undefined {
  const getSystemPrompt = toRecord(ctx).getSystemPrompt;
  if (typeof getSystemPrompt !== "function") return undefined;
  try {
    const systemPrompt = getSystemPrompt.call(ctx);
    return typeof systemPrompt === "string" ? systemPrompt : undefined;
  } catch {
    return undefined;
  }
}

export function requesterAgentName(ctx: ForwarderContext): string {
  return getActiveAgentName(ctx) ?? getActiveAgentNameFromSystemPrompt(getContextSystemPrompt(ctx)) ?? "unknown";
}

export function formatForwardedPermissionPrompt(request: ForwardedPermissionRequest): string {
  const agentName = request.requesterAgentName || "unknown";
  const sessionId = request.requesterSessionId || "unknown";
  return [`Subagent '${agentName}' requested permission.`, `Session ID: ${sessionId}`, "", request.message].join("\n");
}

export function buildForwardedPermissionLogDetails(
  request: ForwardedPermissionRequest,
  requestPath: string,
  source: string,
): Record<string, unknown> {
  return {
    requestId: request.id,
    source,
    requesterAgentName: request.requesterAgentName,
    requesterSessionId: request.requesterSessionId,
    targetSessionId: request.targetSessionId,
    requestPath,
  };
}

export function buildForwardedResponseLog(
  params: ForwardedResponsePoll,
  response: ForwardedPermissionResponse | null,
): Record<string, unknown> {
  return response ? responseLog(params, response) : emptyResponseLog(params);
}

function emptyResponseLog(params: ForwardedResponsePoll): Record<string, unknown> {
  return {
    requestId: params.request.id,
    approved: null,
    state: null,
    denialReason: null,
    responderSessionId: null,
    targetSessionId: params.request.targetSessionId,
    responsePath: params.responsePath,
  };
}

function responseLog(params: ForwardedResponsePoll, response: ForwardedPermissionResponse): Record<string, unknown> {
  return {
    requestId: params.request.id,
    approved: response.approved,
    state: response.state,
    denialReason: response.denialReason ?? null,
    responderSessionId: response.responderSessionId,
    targetSessionId: params.request.targetSessionId,
    responsePath: params.responsePath,
  };
}

export function buildMissingForwardingTargetMessage(): string {
  return (
    `Permission forwarding target session could not be resolved. ` +
    `Checked env vars: ${SUBAGENT_PARENT_SESSION_ENV_CANDIDATES.join(", ")}. ` +
    `If you are using a subagent extension (nicobailon/pi-subagents, HazAT/pi-interactive-subagents, etc.), ` +
    `ask its maintainer to set PI_SUBAGENT_PARENT_SESSION in the child process environment ` +
    `(see https://github.com/casonadams/permission/issues).`
  );
}
