/** Public event fields are removed or renamed only in semver-major releases. */

export interface PermissionEventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

/** Incremented when RPC envelopes or method contracts change incompatibly. */
export const PERMISSIONS_PROTOCOL_VERSION = 1;

export const PERMISSIONS_READY_CHANNEL = "permissions:ready";

export const PERMISSIONS_UI_PROMPT_CHANNEL = "permissions:ui_prompt";

export const PERMISSIONS_DECISION_CHANNEL = "permissions:decision";

/** @deprecated Prefer `getPermissionsService()`; retained as an event-bus fallback. */
export const PERMISSIONS_RPC_CHECK_CHANNEL = "permissions:rpc:check";

export const PERMISSIONS_RPC_PROMPT_CHANNEL = "permissions:rpc:prompt";

export type PermissionsRpcReply<T = void> =
  | { success: true; protocolVersion: number; data?: T }
  | { success: false; protocolVersion: number; error: string };

export type PermissionsReadyEvent = Record<string, never>;

export type PermissionUiPromptSource = "tool_call" | "skill_input" | "skill_read" | "rpc_prompt";

export interface ForwardedPromptContext {
  requesterAgentName: string | null;
  requesterSessionId: string | null;
}

export interface PermissionUiPromptEvent {
  requestId: string;
  source: PermissionUiPromptSource;
  surface: string | null;
  value: string | null;
  agentName: string | null;
  message: string;
  forwarding: ForwardedPromptContext | null;
}

export type PermissionDecisionResolution =
  | "policy_allow"
  | "policy_deny"
  | "session_approved"
  | "infrastructure_auto_allowed"
  | "user_approved"
  | "user_approved_for_session"
  | "user_denied"
  | "confirmation_unavailable";

export interface PermissionDecisionEvent {
  surface: string;
  value: string;
  result: "allow" | "deny";
  resolution: PermissionDecisionResolution;
  origin: string | null;
  agentName: string | null;
  matchedPattern: string | null;
}

/** @deprecated Prefer `getPermissionsService().checkPermission()`. */
export interface PermissionsCheckRequest {
  requestId: string;
  surface: string;
  value?: string;
  agentName?: string;
}

/** @deprecated Prefer `getPermissionsService().checkPermission()`. */
export interface PermissionsCheckReplyData {
  result: "allow" | "deny" | "ask";
  matchedPattern: string | null;
  origin: string | null;
}

export interface PermissionsPromptRequest {
  requestId: string;
  surface: string;
  value: string;
  agentName?: string;
  message: string;
  sessionLabel?: string;
}

export interface PermissionsPromptReplyData {
  approved: boolean;
  /** One of "approved", "approved_for_session", "denied", or "denied_with_reason". */
  state: string;
  denialReason?: string;
}

export function emitReadyEvent(events: PermissionEventBus): void {
  const payload: PermissionsReadyEvent = {};
  try {
    events.emit(PERMISSIONS_READY_CHANNEL, payload);
  } catch {
    // Ready broadcasts are best-effort and must not block session startup.
  }
}

export function emitUiPromptEvent(events: PermissionEventBus, event: PermissionUiPromptEvent): void {
  try {
    events.emit(PERMISSIONS_UI_PROMPT_CHANNEL, event);
  } catch {
    // Prompt broadcasts are observational and must not block the dialog.
  }
}

export function emitDecisionEvent(events: PermissionEventBus, event: PermissionDecisionEvent): void {
  try {
    events.emit(PERMISSIONS_DECISION_CHANNEL, event);
  } catch {
    // Decision broadcasts are best-effort and must not block gate resolution.
  }
}
