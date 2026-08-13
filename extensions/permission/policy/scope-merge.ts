import { mergeFlatPermissions } from "#src/policy/permission-merge";
import type { RuleOrigin } from "#src/policy/rule";
import type { FlatPermissionConfig, PatternValue, ScopeConfig } from "#src/policy/types";

/** Surface → (pattern → originating scope). */
type OriginMap = Map<string, Map<string, RuleOrigin>>;

/** Result of merging permission objects across scopes with provenance tracking. */
export interface MergedScopes {
  /** Fully merged flat permission config (lowest → highest precedence). */
  mergedPermission: FlatPermissionConfig;
  /** Maps each surface to a per-pattern origin (which scope contributed it). */
  origins: OriginMap;
}

/**
 * Merge permission objects across scopes (lowest → highest precedence) while
 * tracking which scope contributed each (surface, pattern) entry.
 *
 * Mirrors mergeFlatPermissions() semantics for origin attribution:
 * - Both base and incoming are objects → shallow-merge: each incoming pattern
 *   is attributed to this scope; patterns the higher scope does not redefine
 *   keep their earlier origin.
 * - Otherwise → full replacement: this scope takes over the entire surface
 *   entry, discarding all lower-scope attribution.
 */
export function mergeScopesWithOrigins(scopes: readonly (readonly [RuleOrigin, ScopeConfig])[]): MergedScopes {
  const origins: OriginMap = new Map();
  let mergedPermission: FlatPermissionConfig = {};

  for (const [scopeName, scope] of scopes) {
    if (!scope.permission) continue;

    for (const [surface, value] of Object.entries(scope.permission)) {
      const baseVal = mergedPermission[surface];

      if (bothPatternMaps(baseVal, value))
        recordShallowMerge({ origins, surface, value: value as Record<string, PatternValue>, scopeName });
      else origins.set(surface, replacementOrigins(value, scopeName));
    }

    mergedPermission = mergeFlatPermissions(mergedPermission, scope.permission);
  }

  return { mergedPermission, origins };
}

/** True when both values are non-null pattern maps (shallow-mergeable). */
function bothPatternMaps(baseVal: FlatPermissionConfig[string], value: FlatPermissionConfig[string]): boolean {
  return typeof baseVal === "object" && baseVal !== null && typeof value === "object" && value !== null;
}

/** Attribute each incoming pattern to this scope, preserving lower-scope origins. */
function recordShallowMerge(args: {
  origins: OriginMap;
  surface: string;
  value: Record<string, PatternValue>;
  scopeName: RuleOrigin;
}): void {
  if (!args.origins.has(args.surface)) args.origins.set(args.surface, new Map());
  for (const pattern of Object.keys(args.value)) args.origins.get(args.surface)?.set(pattern, args.scopeName);
}

/** Build the origin map for a full-replacement surface entry from this scope. */
function replacementOrigins(value: FlatPermissionConfig[string], scopeName: RuleOrigin): Map<string, RuleOrigin> {
  const surfaceOrigins = new Map<string, RuleOrigin>();
  if (typeof value === "string") {
    surfaceOrigins.set("*", scopeName);
  } else if (typeof value === "object" && value !== null) {
    for (const pattern of Object.keys(value)) surfaceOrigins.set(pattern, scopeName);
  }
  return surfaceOrigins;
}
