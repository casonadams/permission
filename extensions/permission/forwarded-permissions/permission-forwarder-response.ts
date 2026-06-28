import { createDeniedPermissionDecision, type PermissionPromptDecision } from "#src/permission-dialog";
import type { ForwardedPermissionRequest } from "#src/permission-forwarding";
import { buildForwardedUiPrompt } from "#src/permission-ui-prompt";
import { writeJsonFileAtomic } from "./io";
import { logPermissionForwardingError } from "./io-log";
import type { PermissionForwarderState } from "./permission-forwarder-state";
import type { ForwardedResponseWrite } from "./permission-forwarder-types";

export function writeForwardedResponse(state: PermissionForwarderState, params: ForwardedResponseWrite): void {
  try {
    writeJsonFileAtomic(state.logger, params.responsePath, {
      approved: params.decision.approved,
      state: params.decision.state,
      denialReason: params.decision.denialReason,
      responderSessionId: params.currentSessionId,
      respondedAt: Date.now(),
    });
  } catch (error) {
    logPermissionForwardingError(
      state.logger,
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
