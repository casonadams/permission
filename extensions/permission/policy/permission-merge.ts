import type { FlatPermissionConfig, PatternValue } from "./types";

export function mergeFlatPermissions(base: FlatPermissionConfig, override: FlatPermissionConfig): FlatPermissionConfig {
  const merged: FlatPermissionConfig = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const patternMaps = getPatternMaps(merged[key], value);
    merged[key] = patternMaps ? { ...patternMaps[0], ...patternMaps[1] } : value;
  }
  return merged;
}

export function isPatternMap(value: FlatPermissionConfig[string]): value is Record<string, PatternValue> {
  return typeof value === "object" && value !== null;
}

export function getPatternMaps(
  base: FlatPermissionConfig[string],
  override: FlatPermissionConfig[string],
): [Record<string, PatternValue>, Record<string, PatternValue>] | null {
  return isPatternMap(base) && isPatternMap(override) ? [base, override] : null;
}
