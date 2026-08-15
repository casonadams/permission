/** Public event fields are removed or renamed only in semver-major releases. */

export interface PermissionEventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

/**
 * RPC protocol version.
 * Bumped when the envelope shape or method contracts change in a breaking way.
 */
export const PERMISSIONS_PROTOCOL_VERSION = 1;

export const PERMISSIONS_READY_CHANNEL = "permissions:ready";

export const PERMISSIONS_UI_PROMPT_CHANNEL = "permissions:ui_prompt";

export const PERMISSIONS_DECISION_CHANNEL = "permissions:decision";

/**
 * RPC request channel — query the permission policy (no prompting).
 *
 * @deprecated Use the `Symbol.for()`-backed service accessor instead:
 * ```typescript
 * const { getPermissionsService } = await import("permission");
 * const service = getPermissionsService();
 * if (service) {
 *   const result = service.checkPermission("bash", "git push");
 * }
 * ```
 * The event-bus RPC remains available as a zero-dependency fallback.
 */
export const PERMISSIONS_RPC_CHECK_CHANNEL = "permissions:rpc:check";

export const PERMISSIONS_RPC_PROMPT_CHANNEL = "permissions:rpc:prompt";

export type PermissionsRpcReply<T = void> =
  | { success: true; protocolVersion: number; data?: T }
  | { success: false; protocolVersion: number; error: string };

/**
 * Payload emitted on `permissions:ready`.
 *
 * Intentionally empty: the channel is a readiness signal. Version negotiation
 * lives in the RPC envelope (`PermissionsRpcReply`), not in broadcast payloads —
 * the published types plus package semver define the broadcast contract.
 */
export type PermissionsReadyEvent = Record<string, never>;

/**
 * Origin of a UI prompt.
 *
 * Forwarding is orthogonal to origin: a forwarded subagent prompt keeps its
 * original source and is identified by a non-null `forwarding` field, not by a
 * dedicated source value.
 */
export type PermissionUiPromptSource = "tool_call" | "skill_input" | "skill_read" | "rpc_prompt";

export interface ForwardedPromptContext {
  requesterAgentName: string | null;
  requesterSessionId: string | null;
}

/**
 * Payload emitted on `permissions:ui_prompt`, immediately before the active
 * user-facing permission UI is shown.
 *
 * Lean by design: `surface`/`value` are the normalized display projection a
 * notification consumer reads; `source` is the origin; `forwarding` is non-null
 * only for forwarded subagent prompts. There is no `protocolVersion` — the
 * published types plus package semver define the broadcast contract, and
 * consumers should read defensively.
 */
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
  /**
   * Detailed state: "approved", "approved_for_session",
   * "denied", or "denied_with_reason".
   */
  state: string;
  denialReason?: string;
}

/**
 * Emit the `permissions:ready` broadcast.
 * Call at `session_start`, after the service is published, so a consumer
 * reacting to ready can immediately resolve `getPermissionsService()`.
 */
export function emitReadyEvent(events: PermissionEventBus): void {
  const payload: PermissionsReadyEvent = {};
  try {
    events.emit(PERMISSIONS_READY_CHANNEL, payload);
  } catch {
    // Broadcasts are best-effort. A throwing listener must not block the
    // permission system from completing session startup.
  }
}

/**
 * Emit a `permissions:ui_prompt` broadcast.
 * Call immediately before invoking the active user-facing permission UI.
 */
export function emitUiPromptEvent(events: PermissionEventBus, event: PermissionUiPromptEvent): void {
  try {
    events.emit(PERMISSIONS_UI_PROMPT_CHANNEL, event);
  } catch {
    // UI-prompt broadcasts are observational. A consumer failure must not block
    // the permission dialog itself.
  }
}

/**
 * Emit a `permissions:decision` broadcast.
 * Call after every permission gate resolution.
 */
export function emitDecisionEvent(events: PermissionEventBus, event: PermissionDecisionEvent): void {
  try {
    events.emit(PERMISSIONS_DECISION_CHANNEL, event);
  } catch {
    // Broadcasts are best-effort. A throwing listener must not block the
    // permission gate from resolving.
  }
}
