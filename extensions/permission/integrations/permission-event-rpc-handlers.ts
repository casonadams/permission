import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildInputForSurface } from "../policy/input-normalizer";
import type { PermissionPromptDecision } from "../prompting/permission-dialog";
import { buildRpcUiPrompt } from "../prompting/permission-ui-prompt";
import type { PermissionRpcDeps } from "./permission-event-rpc";
import type {
  PermissionEventBus,
  PermissionsCheckReplyData,
  PermissionsCheckRequest,
  PermissionsPromptReplyData,
  PermissionsPromptRequest,
  PermissionsRpcReply,
} from "./permission-events";
import {
  emitUiPromptEvent,
  PERMISSIONS_PROTOCOL_VERSION,
  PERMISSIONS_RPC_CHECK_CHANNEL,
  PERMISSIONS_RPC_PROMPT_CHANNEL,
} from "./permission-events";

function successReply<T>(data?: T): PermissionsRpcReply<T> {
  if (data !== undefined) return { success: true, protocolVersion: PERMISSIONS_PROTOCOL_VERSION, data };
  return { success: true, protocolVersion: PERMISSIONS_PROTOCOL_VERSION };
}

function errorReply(error: string): PermissionsRpcReply {
  return { success: false, protocolVersion: PERMISSIONS_PROTOCOL_VERSION, error };
}

function hasRequestId(req: Partial<{ requestId: unknown }>): req is { requestId: string } {
  return typeof req.requestId === "string" && req.requestId.length > 0;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function handleCheckRpc(raw: unknown, events: PermissionEventBus, deps: PermissionRpcDeps): void {
  const req = raw as Partial<PermissionsCheckRequest>;
  if (!hasRequestId(req)) return;

  const replyChannel = `${PERMISSIONS_RPC_CHECK_CHANNEL}:reply:${req.requestId}`;
  try {
    emitCheckReply({ req, replyChannel, events, deps });
  } catch (err) {
    events.emit(replyChannel, errorReply(getErrorMessage(err)));
  }
}

function emitCheckReply(args: {
  req: Partial<PermissionsCheckRequest>;
  replyChannel: string;
  events: PermissionEventBus;
  deps: PermissionRpcDeps;
}): void {
  if (typeof args.req.surface !== "string" || !args.req.surface) {
    args.events.emit(args.replyChannel, errorReply("surface is required"));
    return;
  }
  args.events.emit(args.replyChannel, successReply(buildCheckReplyData(args.req, args.deps)));
}

function buildCheckReplyData(
  req: Partial<PermissionsCheckRequest>,
  deps: PermissionRpcDeps,
): PermissionsCheckReplyData {
  const surface = req.surface ?? "";
  const input = buildInputForSurface(surface, req.value);
  const result = deps.permissionManager.checkPermission(
    surface,
    input,
    req.agentName ?? undefined,
    deps.sessionRules.getRuleset(),
  );
  return { result: result.state, matchedPattern: result.matchedPattern ?? null, origin: result.origin ?? null };
}

export async function handlePromptRpc(
  raw: unknown,
  events: PermissionEventBus,
  deps: PermissionRpcDeps,
): Promise<void> {
  const req = raw as Partial<PermissionsPromptRequest>;
  if (!hasRequestId(req)) return;

  const replyChannel = `${PERMISSIONS_RPC_PROMPT_CHANNEL}:reply:${req.requestId}`;
  const validation = validatePromptRequest(req, deps);
  if (!validation.ok) {
    events.emit(replyChannel, errorReply(validation.error));
    return;
  }

  try {
    const data = await resolvePromptRequest({ req, events, deps, ui: validation.ctx.ui });
    events.emit(replyChannel, successReply(data));
  } catch (err) {
    events.emit(replyChannel, errorReply(getErrorMessage(err)));
  }
}

function validatePromptRequest(
  req: Partial<PermissionsPromptRequest>,
  deps: PermissionRpcDeps,
): { ok: true; ctx: ExtensionContext } | { ok: false; error: string } {
  const ctx = deps.session.getRuntimeContext();
  if (!ctx?.hasUI) return { ok: false, error: "no_ui" };
  if (typeof req.message !== "string" || !req.message) return { ok: false, error: "message is required" };
  return { ok: true, ctx };
}

async function resolvePromptRequest(args: {
  req: Partial<PermissionsPromptRequest> & { requestId: string };
  events: PermissionEventBus;
  deps: PermissionRpcDeps;
  ui: ExtensionContext["ui"];
}): Promise<PermissionsPromptReplyData> {
  const message = args.req.message ?? "";
  emitUiPromptEvent(args.events, buildRpcUiPrompt({ ...args.req, message }));
  const decision = await args.deps.requestPermissionDecisionFromUi(
    args.ui,
    buildPromptTitle(args.req),
    message,
    promptOptions(args.req),
  );
  args.deps.logger.review("permission_request.rpc_prompt", buildPromptReview(args.req, message, decision));
  return buildPromptReplyData(decision);
}

function buildPromptTitle(req: Partial<PermissionsPromptRequest>): string {
  if (!req.surface) return "Permission request";
  return `Permission request${req.agentName ? ` from ${req.agentName}` : ""}`;
}

function promptOptions(req: Partial<PermissionsPromptRequest>): { sessionLabel: string } | undefined {
  return req.sessionLabel ? { sessionLabel: req.sessionLabel } : undefined;
}

function buildPromptReview(
  req: Partial<PermissionsPromptRequest> & { requestId: string },
  message: string,
  decision: PermissionPromptDecision,
) {
  return {
    requestId: req.requestId,
    surface: req.surface ?? null,
    value: req.value ?? null,
    agentName: req.agentName ?? null,
    message,
    approved: decision.approved,
    resolution: decision.state,
    denialReason: decision.denialReason ?? null,
  };
}

function buildPromptReplyData(decision: PermissionPromptDecision): PermissionsPromptReplyData {
  return {
    approved: decision.approved,
    state: decision.state,
    ...(decision.denialReason !== undefined ? { denialReason: decision.denialReason } : {}),
  };
}
