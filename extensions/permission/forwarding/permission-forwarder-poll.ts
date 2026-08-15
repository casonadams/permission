import { existsSync } from "node:fs";
import {
  PERMISSION_FORWARDING_POLL_INTERVAL_MS,
  PERMISSION_FORWARDING_TIMEOUT_MS,
} from "#src/forwarding/permission-forwarding";
import { createDeniedPermissionDecision, type PermissionPromptDecision } from "#src/prompting/permission-dialog";
import { cleanupPermissionForwardingLocationIfEmpty, safeDeleteFile } from "./io";
import { sleep } from "./io-list";
import { notifyPermissionForwardingWarning } from "./io-log";
import { readForwardedPermissionResponse } from "./io-read";
import type { ForwardedResponsePoll, PermissionForwarderState } from "./permission-forwarder-types";

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
  const response = readForwardedPermissionResponse(state.notifier, params.responsePath);
  cleanupForwardedResponseFiles(state, params);
  return response ?? createDeniedPermissionDecision();
}

function cleanupForwardedResponseFiles(state: PermissionForwarderState, params: ForwardedResponsePoll): void {
  safeDeleteFile(state.notifier, params.responsePath, "forwarded permission response");
  safeDeleteFile(state.notifier, params.requestPath, "forwarded permission request");
  cleanupPermissionForwardingLocationIfEmpty(state.notifier, params.location);
}

function handleForwardedResponseTimeout(
  state: PermissionForwarderState,
  params: ForwardedResponsePoll,
): PermissionPromptDecision {
  notifyPermissionForwardingWarning(
    state.notifier,
    `Timed out waiting for forwarded permission response '${params.responsePath}'`,
  );
  safeDeleteFile(state.notifier, params.requestPath, "forwarded permission request");
  cleanupPermissionForwardingLocationIfEmpty(state.notifier, params.location);
  return createDeniedPermissionDecision();
}
