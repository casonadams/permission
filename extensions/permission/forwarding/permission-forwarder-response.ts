import type { ForwardedPermissionRequest } from "#src/forwarding/permission-forwarding";
import { createDeniedPermissionDecision, type PermissionPromptDecision } from "#src/prompting/permission-dialog";
import { buildForwardedUiPrompt } from "#src/prompting/permission-ui-prompt";
import { writeJsonFileAtomic } from "./io";
import { notifyPermissionForwardingError } from "./io-log";
import type { ForwardedResponseWrite, PermissionForwarderState } from "./permission-forwarder-types";

export function writeForwardedResponse(state: PermissionForwarderState, params: ForwardedResponseWrite): void {
  try {
    writeJsonFileAtomic(state.notifier, params.responsePath, {
      approved: params.decision.approved,
      state: params.decision.state,
      denialReason: params.decision.denialReason,
      responderSessionId: params.currentSessionId,
      respondedAt: Date.now(),
    });
  } catch (error) {
    notifyPermissionForwardingError(
      state.notifier,
      `Failed to write forwarded permission response '${params.responsePath}'`,
      error,
    );
  }
}

export function buildDeniedDecision(): PermissionPromptDecision {
  return createDeniedPermissionDecision();
}

export function buildForwardedPromptEvent(request: ForwardedPermissionRequest, message: string) {
  return buildForwardedUiPrompt({
    requestId: request.id,
    message,
    requesterAgentName: stringOrNull(request.requesterAgentName),
    requesterSessionId: stringOrNull(request.requesterSessionId),
    source: request.source ?? null,
    surface: request.surface ?? null,
    value: request.value ?? null,
  });
}

function stringOrNull(value: string): string | null {
  return value || null;
}
