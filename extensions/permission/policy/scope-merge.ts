import { getPatternMaps, mergeFlatPermissions } from "#src/policy/permission-merge";
import type { RuleOrigin } from "#src/policy/rule";
import type { FlatPermissionConfig, PatternValue, ScopeConfig } from "#src/policy/types";

type OriginMap = Map<string, Map<string, RuleOrigin>>;

export interface MergedScopes {
  mergedPermission: FlatPermissionConfig;
  origins: OriginMap;
}

export function mergeScopesWithOrigins(scopes: readonly (readonly [RuleOrigin, ScopeConfig])[]): MergedScopes {
  const origins: OriginMap = new Map();
  let mergedPermission: FlatPermissionConfig = {};

  for (const [scopeName, scope] of scopes) {
    if (!scope.permission) continue;

    for (const [surface, value] of Object.entries(scope.permission)) {
      const patternMaps = getPatternMaps(mergedPermission[surface], value);

      if (patternMaps) recordShallowMerge({ origins, surface, value: patternMaps[1], scopeName });
      else origins.set(surface, replacementOrigins(value, scopeName));
    }

    mergedPermission = mergeFlatPermissions(mergedPermission, scope.permission);
  }

  return { mergedPermission, origins };
}

function recordShallowMerge(args: {
  origins: OriginMap;
  surface: string;
  value: Record<string, PatternValue>;
  scopeName: RuleOrigin;
}): void {
  if (!args.origins.has(args.surface)) args.origins.set(args.surface, new Map());
  for (const pattern of Object.keys(args.value)) args.origins.get(args.surface)?.set(pattern, args.scopeName);
}

function replacementOrigins(value: FlatPermissionConfig[string], scopeName: RuleOrigin): Map<string, RuleOrigin> {
  const surfaceOrigins = new Map<string, RuleOrigin>();
  if (typeof value === "string") {
    surfaceOrigins.set("*", scopeName);
  } else if (typeof value === "object" && value !== null) {
    for (const pattern of Object.keys(value)) surfaceOrigins.set(pattern, scopeName);
  }
  return surfaceOrigins;
}
