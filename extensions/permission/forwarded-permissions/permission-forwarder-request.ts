import { join } from "node:path";
import { createDeniedPermissionDecision, type PermissionPromptDecision } from "#src/permission-dialog";
import {
  type ForwardedPermissionRequest,
  type PermissionForwardingLocation,
  resolvePermissionForwardingTargetSessionId,
} from "#src/permission-forwarding";
import { createPermissionRequestId } from "#src/request-id";
import { isSubagentExecutionContext } from "#src/subagent-context";
import { ensurePermissionForwardingLocation, writeJsonFileAtomic } from "./io";
import { logPermissionForwardingError } from "./io-log";
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
  logPermissionForwardingError(state.logger, buildMissingForwardingTargetMessage());
  return null;
}

function prepareForwardingLocation(
  state: PermissionForwarderState,
  targetSessionId: string,
): PermissionForwardingLocation | null {
  const location = ensurePermissionForwardingLocation(state.logger, state.forwardingDir, targetSessionId);
  if (location) return location;
  logPermissionForwardingError(
    state.logger,
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
  logRequestCreated({ state, request, ...paths });
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

function logRequestCreated(params: {
  state: PermissionForwarderState;
  request: ForwardedPermissionRequest;
  requestPath: string;
  responsePath: string;
}): void {
  params.state.logger.review("forwarded_permission.request_created", {
    requestId: params.request.id,
    requesterAgentName: params.request.requesterAgentName,
    requesterSessionId: params.request.requesterSessionId,
    targetSessionId: params.request.targetSessionId,
    requestPath: params.requestPath,
    responsePath: params.responsePath,
  });
}

function writeForwardedRequest(state: PermissionForwarderState, params: ForwardedRequestWrite): boolean {
  try {
    writeJsonFileAtomic(state.logger, params.requestPath, params.request);
    return true;
  } catch (error) {
    logPermissionForwardingError(
      state.logger,
      `Failed to write forwarded permission request '${params.requestPath}'`,
      error,
    );
    return false;
  }
}
