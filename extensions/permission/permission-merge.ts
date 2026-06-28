import type { FlatPermissionConfig, PatternValue } from "./types";

/**
 * Deep-shallow merge two flat permission configs.
 * Both objects → shallow-merge the pattern maps.
 * Otherwise → override replaces base.
 */
export function mergeFlatPermissions(base: FlatPermissionConfig, override: FlatPermissionConfig): FlatPermissionConfig {
  const merged: FlatPermissionConfig = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseVal = merged[key];
    merged[key] = bothPatternMaps(baseVal, value)
      ? { ...(baseVal as Record<string, PatternValue>), ...(value as Record<string, PatternValue>) }
      : value;
  }
  return merged;
}

/** True when both values are non-null pattern maps (shallow-mergeable). */
function bothPatternMaps(baseVal: FlatPermissionConfig[string], value: FlatPermissionConfig[string]): boolean {
  return typeof baseVal === "object" && baseVal !== null && typeof value === "object" && value !== null;
}
