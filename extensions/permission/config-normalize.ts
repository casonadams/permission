import {
  isDenyWithReason,
  isPermissionState,
  normalizeOptionalPositiveInt,
  normalizeOptionalStringArray,
  toRecord,
} from "./common";
import {
  BOOLEAN_CONFIG_KEYS,
  type BooleanConfigKey,
  NUMBER_CONFIG_KEYS,
  type NumberConfigKey,
  STRING_ARRAY_CONFIG_KEYS,
  type StringArrayConfigKey,
} from "./config-keys";
import type { FlatPermissionConfig, PatternValue } from "./types";

export interface UnifiedPermissionConfig {
  debugLog?: boolean;
  permissionReviewLog?: boolean;
  yoloMode?: boolean;
  toolInputPreviewMaxLength?: number;
  toolTextSummaryMaxLength?: number;
  piInfrastructureReadPaths?: string[];
  permission?: FlatPermissionConfig;
}

export interface UnifiedConfigLoadResult {
  config: UnifiedPermissionConfig;
  issues: string[];
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function normalizeUnifiedConfig(raw: unknown): UnifiedConfigLoadResult {
  const record = toRecord(raw);
  const config: UnifiedPermissionConfig = {};
  const issues: string[] = [];
  for (const key of BOOLEAN_CONFIG_KEYS) addBooleanConfig(config, key, record[key]);
  for (const key of NUMBER_CONFIG_KEYS) addPositiveIntConfig(config, key, record[key]);
  for (const key of STRING_ARRAY_CONFIG_KEYS) addStringArrayConfig(config, key, record[key]);
  addPermissionConfig(config, record.permission, issues);
  return { config, issues };
}

function addBooleanConfig(config: UnifiedPermissionConfig, key: BooleanConfigKey, raw: unknown): void {
  const value = normalizeOptionalBoolean(raw);
  if (value !== undefined) config[key] = value;
}

function addPositiveIntConfig(config: UnifiedPermissionConfig, key: NumberConfigKey, raw: unknown): void {
  const value = normalizeOptionalPositiveInt(raw);
  if (value !== undefined) config[key] = value;
}

function addStringArrayConfig(config: UnifiedPermissionConfig, key: StringArrayConfigKey, raw: unknown): void {
  const value = normalizeOptionalStringArray(raw);
  if (value !== undefined) config[key] = value;
}

function addPermissionConfig(config: UnifiedPermissionConfig, raw: unknown, issues: string[]): void {
  const permission = normalizeFlatPermissionValue(raw, issues);
  if (permission !== undefined) config.permission = permission;
}

function normalizeFlatPermissionValue(value: unknown, issues: string[]): FlatPermissionConfig | undefined {
  if (value === undefined) return undefined;
  const record = readPermissionRecord(value);
  if (!record) return invalidPermissionRoot(issues);
  return normalizePermissionRecord(record, issues);
}

function invalidPermissionRoot(issues: string[]): undefined {
  issues.push("Invalid permission config at 'permission': expected an object");
  return undefined;
}

function normalizePermissionRecord(
  record: Record<string, unknown>,
  issues: string[],
): FlatPermissionConfig | undefined {
  const normalized: FlatPermissionConfig = {};
  for (const [surface, val] of Object.entries(record)) {
    const normalizedValue = normalizeSurfacePermissionValue(surface, val, issues);
    if (normalizedValue !== undefined) normalized[surface] = normalizedValue;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function readPermissionRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeSurfacePermissionValue(
  surface: string,
  value: unknown,
  issues: string[],
): FlatPermissionConfig[string] | undefined {
  if (typeof value === "string") return normalizeSurfaceState(surface, value, issues);
  return normalizePatternPermissionMap(surface, value, issues);
}

function normalizeSurfaceState(
  surface: string,
  value: string,
  issues: string[],
): FlatPermissionConfig[string] | undefined {
  if (isPermissionState(value)) return value;
  issues.push(`Invalid permission config at 'permission.${surface}': expected allow, deny, or ask`);
  return undefined;
}

type PatternActionContext = {
  surface: string;
  pattern: string;
  action: unknown;
  issues: string[];
};

function normalizePatternAction(ctx: PatternActionContext): PatternValue | undefined {
  if (isDenyWithReason(ctx.action)) return ctx.action;
  if (isPermissionState(ctx.action)) return ctx.action;
  ctx.issues.push(
    `Invalid permission config at 'permission.${ctx.surface}.${ctx.pattern}': expected allow, deny, ask, or deny object`,
  );
  return undefined;
}

function normalizePatternPermissionMap(
  surface: string,
  value: unknown,
  issues: string[],
): Record<string, PatternValue> | undefined {
  const record = readPermissionRecord(value);
  if (!record) {
    issues.push(`Invalid permission config at 'permission.${surface}': expected allow, deny, ask, or pattern map`);
    return undefined;
  }

  const map: Record<string, PatternValue> = {};
  for (const [pattern, action] of Object.entries(record)) {
    const normalized = normalizePatternAction({ surface, pattern, action, issues });
    if (normalized !== undefined) map[pattern] = normalized;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}
