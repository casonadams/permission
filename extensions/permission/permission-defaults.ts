import { isPermissionState } from "./common";
import type { RuleOrigin } from "./rule";
import type { FlatPermissionConfig, PermissionState } from "./types";

export const DEFAULT_UNIVERSAL_FALLBACK: PermissionState = "ask";

export function getUniversalFallback(mergedPermission: FlatPermissionConfig): PermissionState {
  return isPermissionState(mergedPermission["*"]) ? mergedPermission["*"] : DEFAULT_UNIVERSAL_FALLBACK;
}

export function getUniversalFallbackOrigin(origins: Map<string, Map<string, RuleOrigin>>): RuleOrigin {
  return origins.get("*")?.get("*") ?? "builtin";
}
