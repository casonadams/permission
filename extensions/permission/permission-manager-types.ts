import type { PolicyLoader, PolicyLoaderOptions } from "./policy-loader";
import type { Ruleset } from "./rule";
import type { PermissionCheckResult, PermissionState } from "./types";

export interface ScopedPermissionManager {
  configureForCwd(cwd: string | undefined | null): void;
  checkPermission(toolName: string, input: unknown, agentName?: string, sessionRules?: Ruleset): PermissionCheckResult;
  checkPathPolicy(values: readonly string[], agentName?: string, sessionRules?: Ruleset): PermissionCheckResult;
  getToolPermission(toolName: string, agentName?: string): PermissionState;
  getConfigIssues(agentName?: string): string[];
  getPolicyCacheStamp(agentName?: string): string;
}

export interface PermissionManagerOptions extends PolicyLoaderOptions {
  policyLoader?: PolicyLoader;
  agentDir?: string;
}
