import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PermissionManager } from "../policy/permission-manager";
import type { SessionRules } from "../policy/session-rules";
import type { PermissionPromptDecision, RequestPermissionOptions } from "../prompting/permission-dialog";
import { handleCheckRpc, handlePromptRpc } from "./permission-event-rpc-handlers";
import type { PermissionEventBus } from "./permission-events";
import { PERMISSIONS_RPC_CHECK_CHANNEL, PERMISSIONS_RPC_PROMPT_CHANNEL } from "./permission-events";

export interface PermissionRpcDeps {
  permissionManager: Pick<PermissionManager, "checkPermission">;
  sessionRules: Pick<SessionRules, "getRuleset">;
  session: { getRuntimeContext(): ExtensionContext | null };
  requestPermissionDecisionFromUi(
    ui: ExtensionContext["ui"],
    title: string,
    message: string,
    options?: RequestPermissionOptions,
  ): Promise<PermissionPromptDecision>;
}

export interface PermissionRpcHandles {
  unsubCheck: () => void;
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
