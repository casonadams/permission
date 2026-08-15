import { join } from "node:path";
import { emitUiPromptEvent } from "#src/integrations/permission-events";
import type { PermissionPromptDecision } from "#src/prompting/permission-dialog";
import {
  cleanupPermissionForwardingLocationIfEmpty,
  ensureDirectoryExists,
  getExistingPermissionForwardingLocation,
  safeDeleteFile,
} from "./io";
import { listRequestFiles } from "./io-list";
import { readForwardedPermissionRequest } from "./io-read";
import { formatForwardedPermissionPrompt, getSessionId } from "./permission-forwarder-helpers";
import {
  buildDeniedDecision,
  buildForwardedPromptEvent,
  writeForwardedResponse,
} from "./permission-forwarder-response";
import type {
  ForwarderContext,
  PermissionForwarderState,
  ProcessableInbox,
  ProcessForwardedRequestParams,
  RequestLocationPath,
} from "./permission-forwarder-types";
import { isForwardedPermissionRequestForSession } from "./permission-forwarding";

export async function processInbox(state: PermissionForwarderState, ctx: ForwarderContext): Promise<void> {
  const inbox = getProcessableInbox(state, ctx);
  if (!inbox) return;

  for (const fileName of inbox.requestFiles) {
    await processRequestFile({ state, ctx, inbox, fileName });
  }
  cleanupPermissionForwardingLocationIfEmpty(state.notifier, inbox.location);
}

function getProcessableInbox(state: PermissionForwarderState, ctx: ForwarderContext): ProcessableInbox | null {
  if (!ctx.hasUI) return null;
  const currentSessionId = getSessionId(ctx);
  const location = getExistingPermissionForwardingLocation(state.forwardingDir, currentSessionId);
  if (!location) return null;
  const requestFiles = listRequestFiles(state.notifier, location.requestsDir);
  if (requestFiles.length === 0) return null;
  if (!ensureDirectoryExists(state.notifier, location.responsesDir, "permission forwarding responses")) return null;
  return { currentSessionId, location, requestFiles };
}

async function processRequestFile(params: {
  state: PermissionForwarderState;
  ctx: ForwarderContext;
  inbox: ProcessableInbox;
  fileName: string;
}): Promise<void> {
  const requestPath = join(params.inbox.location.requestsDir, params.fileName);
  const request = readForwardedPermissionRequest(params.state.notifier, requestPath);
  if (!request) {
    safeDeleteFile(params.state.notifier, requestPath, `${params.inbox.location.label} forwarded permission request`);
    return;
  }
  await processSingleForwardedRequest(params.state, {
    ctx: params.ctx,
    request,
    location: params.inbox.location,
    requestPath,
    currentSessionId: params.inbox.currentSessionId,
  });
}

async function processSingleForwardedRequest(
  state: PermissionForwarderState,
  params: ProcessForwardedRequestParams,
): Promise<void> {
  const target = { request: params.request, location: params.location, path: params.requestPath };
  if (!isForwardedPermissionRequestForSession(params.request, params.currentSessionId)) {
    deleteMisdirectedRequest(state, target);
    return;
  }
  if (Date.now() - params.request.createdAt > 10 * 60 * 1000) {
    writeForwardedResponse(state, {
      location: target.location,
      responsePath: join(target.location.responsesDir, `${target.request.id}.json`),
      decision: buildDeniedDecision(),
      currentSessionId: params.currentSessionId,
    });
    safeDeleteFile(state.notifier, target.path, `${target.location.label} expired forwarded permission request`);
    return;
  }
  await respondToForwardedRequest(state, params);
}

function deleteMisdirectedRequest(state: PermissionForwarderState, target: RequestLocationPath): void {
  safeDeleteFile(state.notifier, target.path, `${target.location.label} misdirected forwarded permission request`);
}

async function respondToForwardedRequest(
  state: PermissionForwarderState,
  params: ProcessForwardedRequestParams,
): Promise<void> {
  const responsePath = join(params.location.responsesDir, `${params.request.id}.json`);
  const decision = await promptForForwardedDecision(state, params);
  writeForwardedResponse(state, {
    location: params.location,
    responsePath,
    decision,
    currentSessionId: params.currentSessionId,
  });
  safeDeleteFile(state.notifier, params.requestPath, `${params.location.label} forwarded permission request`);
}

async function promptForForwardedDecision(
  state: PermissionForwarderState,
  params: ProcessForwardedRequestParams,
): Promise<PermissionPromptDecision> {
  const message = formatForwardedPermissionPrompt(params.request);
  if (state.events) emitUiPromptEvent(state.events, buildForwardedPromptEvent(params.request, message));
  return state.requestPermissionDecisionFromUi({ ui: params.ctx.ui, title: "Permission Required", message });
}
