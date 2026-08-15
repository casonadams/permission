import { mergeFlatPermissions } from "../policy/permission-merge";
import type { UnifiedPermissionConfig } from "./config-normalize";

export function mergeUnifiedConfigs(
  base: UnifiedPermissionConfig,
  override: UnifiedPermissionConfig,
): UnifiedPermissionConfig {
  const merged: UnifiedPermissionConfig = {};
  mergePermissionConfig(merged, base, override);
  return merged;
}

function mergePermissionConfig(
  merged: UnifiedPermissionConfig,
  base: UnifiedPermissionConfig,
  override: UnifiedPermissionConfig,
): void {
  const permission = resolvePermissionConfig(base, override);
  if (permission) merged.permission = permission;
}

function resolvePermissionConfig(base: UnifiedPermissionConfig, override: UnifiedPermissionConfig) {
  if (base.permission && override.permission) return mergeFlatPermissions(base.permission, override.permission);
  return override.permission ?? base.permission;
}
