import { FilePolicyLoader, type PolicyLoader, type ResolvedPolicyPaths } from "../config/policy-loader";
import { derivePolicyLoaderOptions } from "../config/policy-loader-options";
import { normalizeInput } from "./input-normalizer";
import { normalizeFlatConfig } from "./normalize";
import { buildCheckResult } from "./permission-check-result";
import { getUniversalFallback, getUniversalFallbackOrigin } from "./permission-defaults";
import type { PermissionManagerOptions, ScopedPermissionManager } from "./permission-manager-types";
import type { Rule, RuleOrigin, Ruleset } from "./rule";
import { evaluate } from "./rule";
import { mergeScopesWithOrigins } from "./scope-merge";
import { composeRuleset, synthesizeBaseline, synthesizeDefaults } from "./synthesize";
import type { FlatPermissionConfig, PermissionCheckResult, PermissionState } from "./types";

type FileCacheEntry<TValue> = {
  stamp: string;
  value: TValue;
};

type ResolvedPermissions = {
  composedRules: Ruleset;
};

export class PermissionManager implements ScopedPermissionManager {
  private readonly agentDir: string | undefined;
  private currentCwd: string | undefined;
  private loader: PolicyLoader;
  private readonly resolvedPermissionsCache = new Map<string, FileCacheEntry<ResolvedPermissions>>();

  constructor(options: PermissionManagerOptions = {}) {
    this.agentDir = options.agentDir;
    this.loader =
      options.policyLoader ??
      new FilePolicyLoader(
        options.agentDir !== undefined ? derivePolicyLoaderOptions(options.agentDir, undefined) : options,
      );
  }

  configureForCwd(cwd: string | undefined | null): void {
    this.currentCwd = typeof cwd === "string" && cwd.trim().length > 0 ? cwd : undefined;
    if (this.agentDir !== undefined) {
      this.loader = new FilePolicyLoader(derivePolicyLoaderOptions(this.agentDir, cwd));
    }
    this.resolvedPermissionsCache.clear();
  }

  getConfigIssues(agentName?: string): string[] {
    this.resolvePermissions(agentName);
    return [...this.loader.getConfigIssues(agentName)];
  }

  getResolvedPolicyPaths(): ResolvedPolicyPaths {
    return this.loader.getResolvedPolicyPaths();
  }

  getPolicyCacheStamp(agentName?: string): string {
    return this.loader.getCacheStamp(agentName);
  }

  private resolvePermissions(agentName?: string): ResolvedPermissions {
    const cacheKey = agentName ?? "__global__";
    const stamp = this.loader.getCacheStamp(agentName);
    const cached = this.readResolvedPermissionsCache(cacheKey, stamp);
    if (cached) return cached;

    const { mergedPermission, origins } = this.loadMergedPermissions(agentName);
    const configRules = this.buildConfigRules(mergedPermission, origins);
    const composedRules = composeRuleset(
      synthesizeDefaults(getUniversalFallback(mergedPermission), getUniversalFallbackOrigin(origins)),
      synthesizeBaseline(configRules),
      configRules,
    );

    const value: ResolvedPermissions = { composedRules };
    this.resolvedPermissionsCache.set(cacheKey, { stamp, value });
    return value;
  }

  private readResolvedPermissionsCache(cacheKey: string, stamp: string): ResolvedPermissions | null {
    const cached = this.resolvedPermissionsCache.get(cacheKey);
    return cached?.stamp === stamp ? cached.value : null;
  }

  private loadMergedPermissions(agentName: string | undefined) {
    const globalConfig = this.loader.loadGlobalConfig();
    const projectConfig = this.loader.loadProjectConfig();
    const agentConfig = this.loader.loadAgentConfig(agentName);
    const projectAgentConfig = this.loader.loadProjectAgentConfig(agentName);

    return mergeScopesWithOrigins([
      ["global", globalConfig],
      ["project", projectConfig],
      ["agent", agentConfig],
      ["project-agent", projectAgentConfig],
    ]);
  }

  private buildConfigRules(
    mergedPermission: FlatPermissionConfig,
    origins: Map<string, Map<string, RuleOrigin>>,
  ): Ruleset {
    const permissionWithoutUniversal: FlatPermissionConfig = Object.fromEntries(
      Object.entries(mergedPermission).filter(([k]) => k !== "*"),
    );

    return normalizeFlatConfig(permissionWithoutUniversal).map(
      (r): Rule => ({
        ...r,
        layer: "config",
        origin: origins.get(r.surface)?.get(r.pattern) ?? "builtin",
      }),
    );
  }

  getComposedConfigRules(agentName?: string): Ruleset {
    const { composedRules } = this.resolvePermissions(agentName);
    return composedRules.filter((r) => r.layer === "config");
  }

  getToolPermission(toolName: string, agentName?: string): PermissionState {
    const { composedRules } = this.resolvePermissions(agentName);
    const normalizedToolName = toolName.trim();

    if (normalizedToolName === "bash") {
      return evaluate("bash", "*", composedRules).action;
    }
    if (normalizedToolName === "mcp") {
      return evaluate("mcp", "*", composedRules).action;
    }
    if (normalizedToolName === "skill") {
      return evaluate("skill", "*", composedRules).action;
    }

    return evaluate(normalizedToolName, "*", composedRules).action;
  }

  checkPermission(
    ...args: [toolName: string, input: unknown, agentName?: string, sessionRules?: Ruleset]
  ): PermissionCheckResult {
    const [toolName, input, agentName, sessionRules] = args;
    const { composedRules } = this.resolvePermissions(agentName);
    const normalizedToolName = toolName.trim();

    const fullRules: Ruleset = sessionRules?.length ? [...composedRules, ...sessionRules] : composedRules;

    const { surface, values, resultExtras } = normalizeInput(
      normalizedToolName,
      input,
      this.loader.getConfiguredMcpServerNames(),
      this.currentCwd,
    );

    return buildCheckResult({ surface, values, resultExtras, normalizedToolName, toolName, fullRules });
  }

  checkPathPolicy(values: readonly string[], agentName?: string, sessionRules?: Ruleset): PermissionCheckResult {
    const { composedRules } = this.resolvePermissions(agentName);
    const fullRules: Ruleset = sessionRules?.length ? [...composedRules, ...sessionRules] : composedRules;

    const lookupValues = values.length > 0 ? [...values] : ["*"];
    return buildCheckResult({
      surface: "path",
      values: lookupValues,
      resultExtras: {},
      normalizedToolName: "path",
      toolName: "path",
      fullRules,
    });
  }
}

export type { PolicyLoader, ResolvedPolicyPaths } from "../config/policy-loader";
export type { PermissionManagerOptions, ScopedPermissionManager } from "./permission-manager-types";
