import { existsSync } from "node:fs";
import { createDeniedPermissionDecision, type PermissionPromptDecision } from "#src/permission-dialog";
import { PERMISSION_FORWARDING_POLL_INTERVAL_MS, PERMISSION_FORWARDING_TIMEOUT_MS } from "#src/permission-forwarding";
import { cleanupPermissionForwardingLocationIfEmpty, safeDeleteFile } from "./io";
import { sleep } from "./io-list";
import { logPermissionForwardingWarning } from "./io-log";
import { readForwardedPermissionResponse } from "./io-read";
import { buildForwardedResponseLog } from "./permission-forwarder-helpers";
import type { PermissionForwarderState } from "./permission-forwarder-state";
import type { ForwardedResponsePoll } from "./permission-forwarder-types";

export async function pollForForwardedResponse(
  state: PermissionForwarderState,
  params: ForwardedResponsePoll,
): Promise<PermissionPromptDecision> {
  const deadline = Date.now() + PERMISSION_FORWARDING_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const decision = readForwardedResponseIfAvailable(state, params);
    if (decision) return decision;
    await sleep(PERMISSION_FORWARDING_POLL_INTERVAL_MS);
  }
  return handleForwardedResponseTimeout(state, params);
}

function readForwardedResponseIfAvailable(
  state: PermissionForwarderState,
  params: ForwardedResponsePoll,
): PermissionPromptDecision | null {
  if (!existsSync(params.responsePath)) return null;
  const response = readForwardedPermissionResponse(state.logger, params.responsePath);
  state.logger.review("forwarded_permission.response_received", buildForwardedResponseLog(params, response));
  cleanupForwardedResponseFiles(state, params);
  return response ?? createDeniedPermissionDecision();
}

function cleanupForwardedResponseFiles(state: PermissionForwarderState, params: ForwardedResponsePoll): void {
  safeDeleteFile(state.logger, params.responsePath, "forwarded permission response");
  safeDeleteFile(state.logger, params.requestPath, "forwarded permission request");
  cleanupPermissionForwardingLocationIfEmpty(state.logger, params.location);
}

function handleForwardedResponseTimeout(
  state: PermissionForwarderState,
  params: ForwardedResponsePoll,
): PermissionPromptDecision {
  logPermissionForwardingWarning(
    state.logger,
    `Timed out waiting for forwarded permission response '${params.responsePath}'`,
  );
  state.logger.review("forwarded_permission.response_timed_out", {
    requestId: params.request.id,
    requesterAgentName: params.request.requesterAgentName,
    targetSessionId: params.request.targetSessionId,
    responsePath: params.responsePath,
  });
  safeDeleteFile(state.logger, params.requestPath, "forwarded permission request");
  cleanupPermissionForwardingLocationIfEmpty(state.logger, params.location);
  return createDeniedPermissionDecision();
}
