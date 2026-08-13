import { mergeFlatPermissions } from "../policy/permission-merge";
import { BOOLEAN_CONFIG_KEYS, NUMBER_CONFIG_KEYS } from "./config-keys";
import type { UnifiedPermissionConfig } from "./config-normalize";

export function mergeUnifiedConfigs(
  base: UnifiedPermissionConfig,
  override: UnifiedPermissionConfig,
): UnifiedPermissionConfig {
  const merged: UnifiedPermissionConfig = {};
  mergeScalarKeys({ merged, base, override, keys: BOOLEAN_CONFIG_KEYS });
  mergeScalarKeys({ merged, base, override, keys: NUMBER_CONFIG_KEYS });
  mergeInfrastructurePaths(merged, base, override);
  mergePermissionConfig(merged, base, override);
  return merged;
}

function mergeScalarKeys<TKey extends keyof UnifiedPermissionConfig>(args: {
  merged: UnifiedPermissionConfig;
  base: UnifiedPermissionConfig;
  override: UnifiedPermissionConfig;
  keys: readonly TKey[];
}): void {
  for (const key of args.keys) {
    const value = args.override[key] ?? args.base[key];
    if (value !== undefined) assignConfigValue(args.merged, key, value);
  }
}

function assignConfigValue<TKey extends keyof UnifiedPermissionConfig>(
  config: UnifiedPermissionConfig,
  key: TKey,
  value: UnifiedPermissionConfig[TKey],
): void {
  config[key] = value;
}

function mergeInfrastructurePaths(
  merged: UnifiedPermissionConfig,
  base: UnifiedPermissionConfig,
  override: UnifiedPermissionConfig,
): void {
  const value = override.piInfrastructureReadPaths ?? base.piInfrastructureReadPaths;
  if (value !== undefined) merged.piInfrastructureReadPaths = value;
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
