import { readFileSync } from "node:fs";
import type { ForwardedPermissionRequest, ForwardedPermissionResponse } from "#src/forwarding/permission-forwarding";
import type { PermissionNotifier } from "#src/integrations/notifier";
import type { PermissionUiPromptSource } from "#src/integrations/permission-events";
import { isPermissionDecisionState } from "#src/prompting/permission-dialog";
import { notifyPermissionForwardingWarning } from "./io-log";

const UI_PROMPT_SOURCES = [
  "tool_call",
  "skill_input",
  "skill_read",
  "rpc_prompt",
] as const satisfies readonly PermissionUiPromptSource[];

function asUiPromptSource(value: unknown): PermissionUiPromptSource | undefined {
  return UI_PROMPT_SOURCES.find((source) => source === value);
}

function asNullableDisplayString(value: unknown): string | null | undefined {
  if (value === null || typeof value === "string") return value;
  return undefined;
}

export function readForwardedPermissionRequest(
  notifier: PermissionNotifier | null,
  filePath: string,
): ForwardedPermissionRequest | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<ForwardedPermissionRequest>;
    if (!isValidRequest(parsed)) {
      notifyPermissionForwardingWarning(
        notifier,
        `Ignoring invalid forwarded permission request format in '${filePath}'`,
      );
      return null;
    }
    return buildRequest(parsed);
  } catch (error) {
    notifyPermissionForwardingWarning(notifier, `Failed to read forwarded permission request '${filePath}'`, error);
    return null;
  }
}

function isValidRequest(parsed: Partial<ForwardedPermissionRequest>): parsed is ForwardedPermissionRequest {
  return [
    typeof parsed.id === "string",
    typeof parsed.createdAt === "number",
    typeof parsed.requesterSessionId === "string",
    typeof parsed.targetSessionId === "string",
    typeof parsed.requesterAgentName === "string",
    typeof parsed.message === "string",
  ].every(Boolean);
}

function buildRequest(parsed: ForwardedPermissionRequest): ForwardedPermissionRequest {
  return {
    id: parsed.id,
    createdAt: parsed.createdAt,
    requesterSessionId: parsed.requesterSessionId,
    targetSessionId: parsed.targetSessionId,
    requesterAgentName: parsed.requesterAgentName,
    message: parsed.message,
    source: asUiPromptSource(parsed.source),
    surface: asNullableDisplayString(parsed.surface),
    value: asNullableDisplayString(parsed.value),
  };
}

export function readForwardedPermissionResponse(
  notifier: PermissionNotifier | null,
  filePath: string,
): ForwardedPermissionResponse | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<ForwardedPermissionResponse>;
    if (!isValidResponse(parsed)) {
      notifyPermissionForwardingWarning(
        notifier,
        `Ignoring invalid forwarded permission response format in '${filePath}'`,
      );
      return null;
    }
    return buildResponse(parsed);
  } catch (error) {
    notifyPermissionForwardingWarning(notifier, `Failed to read forwarded permission response '${filePath}'`, error);
    return null;
  }
}

function isValidResponse(parsed: Partial<ForwardedPermissionResponse>): parsed is ForwardedPermissionResponse {
  return [
    typeof parsed.approved === "boolean",
    isPermissionDecisionState(parsed.state),
    typeof parsed.responderSessionId === "string",
  ].every(Boolean);
}

function buildResponse(parsed: ForwardedPermissionResponse): ForwardedPermissionResponse {
  return {
    approved: parsed.approved,
    state: parsed.state,
    denialReason: typeof parsed.denialReason === "string" ? parsed.denialReason : undefined,
    responderSessionId: parsed.responderSessionId,
    respondedAt: typeof parsed.respondedAt === "number" ? parsed.respondedAt : Date.now(),
  };
}
