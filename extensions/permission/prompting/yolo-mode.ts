import type { PermissionSystemExtensionConfig } from "../config/extension-config";
import type { PermissionState } from "../policy/types";

export interface AskPermissionResolutionOptions {
  config: PermissionSystemExtensionConfig;
  hasUI: boolean;
  isSubagent: boolean;
}

export function isYoloModeEnabled(config: PermissionSystemExtensionConfig): boolean {
  return Boolean(config.yoloMode);
}

export function shouldAutoApprovePermissionState(
  state: PermissionState,
  config: PermissionSystemExtensionConfig,
): boolean {
  return state === "ask" && isYoloModeEnabled(config);
}

export function canResolveAskPermissionRequest(options: AskPermissionResolutionOptions): boolean {
  return options.hasUI || options.isSubagent || isYoloModeEnabled(options.config);
}
