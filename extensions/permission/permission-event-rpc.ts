/**
 * Permission event bus RPC handlers.
 *
 * Registers `permissions:rpc:check` and `permissions:rpc:prompt` handlers on
 * the Pi event bus so other extensions can query our policy and forward
 * permission prompts without importing this package.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PermissionPromptDecision, RequestPermissionOptions } from "./permission-dialog";
import { handleCheckRpc, handlePromptRpc } from "./permission-event-rpc-handlers";
import type { PermissionEventBus } from "./permission-events";
import { PERMISSIONS_RPC_CHECK_CHANNEL, PERMISSIONS_RPC_PROMPT_CHANNEL } from "./permission-events";
import type { PermissionManager } from "./permission-manager";
import type { ReviewLogger } from "./session-logger";
import type { SessionRules } from "./session-rules";

/** Dependencies injected into the RPC handler registry. */
export interface PermissionRpcDeps {
  /** The shared PermissionManager instance. */
  permissionManager: Pick<PermissionManager, "checkPermission">;
  /** The shared SessionRules instance. */
  sessionRules: Pick<SessionRules, "getRuleset">;
  /** Runtime context view used by the prompt handler. */
  session: { getRuntimeContext(): ExtensionContext | null };
  /** Show the interactive permission dialog in the parent session UI. */
  requestPermissionDecisionFromUi(
    ui: ExtensionContext["ui"],
    title: string,
    message: string,
    options?: RequestPermissionOptions,
  ): Promise<PermissionPromptDecision>;
  /** Write review-log entries for prompted decisions. */
  logger: ReviewLogger;
}

/** Unsubscribe handles returned from registerPermissionRpcHandlers. */
export interface PermissionRpcHandles {
  /** Stop the permissions:rpc:check handler. */
  unsubCheck: () => void;
  /** Stop the permissions:rpc:prompt handler. */
  unsubPrompt: () => void;
}

export function registerPermissionRpcHandlers(
  events: PermissionEventBus,
  deps: PermissionRpcDeps,
): PermissionRpcHandles {
  const unsubCheck = events.on(PERMISSIONS_RPC_CHECK_CHANNEL, (raw) => {
    handleCheckRpc(raw, events, deps);
  });

  const unsubPrompt = events.on(PERMISSIONS_RPC_PROMPT_CHANNEL, (raw) => {
    void handlePromptRpc(raw, events, deps);
  });

  return { unsubCheck, unsubPrompt };
}
