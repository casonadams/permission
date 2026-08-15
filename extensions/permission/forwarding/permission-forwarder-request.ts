import { join } from "node:path";
import {
  type ForwardedPermissionRequest,
  type PermissionForwardingLocation,
  resolvePermissionForwardingTargetSessionId,
} from "#src/forwarding/permission-forwarding";
import { isSubagentExecutionContext } from "#src/forwarding/subagents/subagent-context";
import { createPermissionRequestId } from "#src/integrations/request-id";
import { createDeniedPermissionDecision, type PermissionPromptDecision } from "#src/prompting/permission-dialog";
import { ensurePermissionForwardingLocation, writeJsonFileAtomic } from "./io";
import { notifyPermissionForwardingError } from "./io-log";
import { buildMissingForwardingTargetMessage, getSessionId, requesterAgentName } from "./permission-forwarder-helpers";
import { pollForForwardedResponse } from "./permission-forwarder-poll";
import type { PermissionForwarderState } from "./permission-forwarder-state";
import type {
  ApprovalRequest,
  ForwardedRequestBuild,
  ForwardedRequestWrite,
  ForwarderContext,
} from "./permission-forwarder-types";

export function requestApproval(
  state: PermissionForwarderState,
  request: ApprovalRequest,
): Promise<PermissionPromptDecision> {
  if (request.ctx.hasUI) return requestDirectApproval(state, request);
  if (!isSubagentExecutionContext(request.ctx, state.subagentSessionsDir, state.registry)) {
    return Promise.resolve(createDeniedPermissionDecision());
  }
  return waitForForwardedApproval(state, request);
}

function requestDirectApproval(
  state: PermissionForwarderState,
  request: ApprovalRequest,
): Promise<PermissionPromptDecision> {
  return state.requestPermissionDecisionFromUi({
    ui: request.ctx.ui,
    title: "Permission Required",
    message: request.message,
    options: request.options,
  });
}

async function waitForForwardedApproval(
  state: PermissionForwarderState,
  approval: ApprovalRequest,
): Promise<PermissionPromptDecision> {
  const requesterSessionId = getSessionId(approval.ctx);
  const targetSessionId = resolveForwardingTarget(state, approval.ctx, requesterSessionId);
  if (!targetSessionId) return createDeniedPermissionDecision();
  const location = prepareForwardingLocation(state, targetSessionId);
  if (!location) return createDeniedPermissionDecision();
  const build = { ...approval, requesterSessionId, targetSessionId };
  return writeAndPollForwardedRequest(state, build, location);
}

function resolveForwardingTarget(
  state: PermissionForwarderState,
  ctx: ForwarderContext,
  requesterSessionId: string,
): string | null {
  const targetSessionId = resolvePermissionForwardingTargetSessionId({
    hasUI: ctx.hasUI,
    isSubagent: isSubagentExecutionContext(ctx, state.subagentSessionsDir, state.registry),
    currentSessionId: requesterSessionId,
    env: process.env,
    sessionId: requesterSessionId,
    registry: state.registry,
  });
  if (targetSessionId) return targetSessionId;
  notifyPermissionForwardingError(state.notifier, buildMissingForwardingTargetMessage());
  return null;
}

function prepareForwardingLocation(
  state: PermissionForwarderState,
  targetSessionId: string,
): PermissionForwardingLocation | null {
  const location = ensurePermissionForwardingLocation(state.notifier, state.forwardingDir, targetSessionId);
  if (location) return location;
  notifyPermissionForwardingError(
    state.notifier,
    `Permission forwarding is unavailable because session-scoped directories could not be prepared for '${targetSessionId}'`,
  );
  return null;
}

function writeAndPollForwardedRequest(
  state: PermissionForwarderState,
  build: ForwardedRequestBuild,
  location: PermissionForwardingLocation,
): Promise<PermissionPromptDecision> {
  const request = buildForwardedRequest(build);
  const paths = {
    requestPath: join(location.requestsDir, `${request.id}.json`),
    responsePath: join(location.responsesDir, `${request.id}.json`),
  };
  if (!writeForwardedRequest(state, { requestPath: paths.requestPath, request }))
    return Promise.resolve(createDeniedPermissionDecision());
  return pollForForwardedResponse(state, { location, request, ...paths });
}

function buildForwardedRequest(params: ForwardedRequestBuild): ForwardedPermissionRequest {
  return {
    id: createPermissionRequestId(),
    createdAt: Date.now(),
    requesterSessionId: params.requesterSessionId,
    targetSessionId: params.targetSessionId,
    requesterAgentName: requesterAgentName(params.ctx),
    message: params.message,
    ...(params.forwarded
      ? { source: params.forwarded.source, surface: params.forwarded.surface, value: params.forwarded.value }
      : {}),
  };
}

function writeForwardedRequest(state: PermissionForwarderState, params: ForwardedRequestWrite): boolean {
  try {
    writeJsonFileAtomic(state.notifier, params.requestPath, params.request);
    return true;
  } catch (error) {
    notifyPermissionForwardingError(
      state.notifier,
      `Failed to write forwarded permission request '${params.requestPath}'`,
      error,
    );
    return false;
  }
}
