/** `Symbol.for()` and `globalThis` allow this service to cross jiti module isolation.
 * Resolve the service per use so reloads cannot leave consumers with a stale reference. */

import type { ToolAccessExtractor } from "./integrations/tool-access-extractor-registry";
import type { ToolInputFormatter } from "./integrations/tool-input-formatter-registry";
import type { PermissionCheckResult, PermissionState } from "./policy/types";

export type {
  ForwardedPromptContext,
  PermissionDecisionEvent,
  PermissionsPromptReplyData,
  PermissionsPromptRequest,
  PermissionsReadyEvent,
  PermissionsRpcReply,
  PermissionUiPromptEvent,
  PermissionUiPromptSource,
} from "./integrations/permission-events";
export {
  PERMISSIONS_DECISION_CHANNEL,
  PERMISSIONS_PROTOCOL_VERSION,
  PERMISSIONS_READY_CHANNEL,
  PERMISSIONS_RPC_PROMPT_CHANNEL,
  PERMISSIONS_UI_PROMPT_CHANNEL,
} from "./integrations/permission-events";
export type { GatePrompter } from "./prompting/gate-prompter";
export type { PermissionCheckResult, PermissionState, ToolInputFormatter };

const SERVICE_KEY = Symbol.for("@casonadams/permission:service");

export interface PermissionsService {
  /** Query a surface policy; `value` is its command, path, skill name, or MCP target. */
  checkPermission(surface: string, value?: string, agentName?: string): PermissionCheckResult;

  /** Register one formatter per tool; `undefined` delegates to built-ins. The return value unregisters it. */
  registerToolInputFormatter(toolName: string, formatter: ToolInputFormatter): () => void;

  /** Register one non-standard path extractor per tool. The return value unregisters it. */
  registerToolAccessExtractor(toolName: string, extractor: ToolAccessExtractor): () => void;

  /** Query tool-level policy for pre-filtering; command-level rules are not considered. */
  getToolPermission(toolName: string, agentName?: string): PermissionState;
}

/** Publish the parent session's service, replacing any stale reload generation. */
export function publishPermissionsService(service: PermissionsService): void {
  (globalThis as Record<symbol, unknown>)[SERVICE_KEY] = service;
}

export function getPermissionsService(): PermissionsService | undefined {
  return (globalThis as Record<symbol, unknown>)[SERVICE_KEY] as PermissionsService | undefined;
}

/** Unpublish only when `service` still owns the slot, preserving parent and newer reload instances. */
export function unpublishPermissionsService(service: PermissionsService): void {
  if (getPermissionsService() !== service) {
    return;
  }
  Reflect.deleteProperty(globalThis, SERVICE_KEY);
}

export { setGatePrompter } from "./prompting/gate-prompter-registry";
