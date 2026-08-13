import type { ScopedPermissionManager } from "./permission-manager";
import type { Rule } from "./rule";
import type { SessionRules } from "./session-rules";
import type { PermissionCheckResult, PermissionState } from "./types";

export interface ScopedPermissionResolver {
  resolve(surface: string, input: unknown, agentName?: string): PermissionCheckResult;
  resolvePathPolicy(values: readonly string[], agentName?: string): PermissionCheckResult;
}

export class PermissionResolver implements ScopedPermissionResolver {
  constructor(
    private readonly permissionManager: ScopedPermissionManager,
    private readonly sessionRules: Pick<SessionRules, "getRuleset">,
  ) {}

  resolve(surface: string, input: unknown, agentName?: string): PermissionCheckResult {
    return this.permissionManager.checkPermission(surface, input, agentName, this.sessionRules.getRuleset());
  }

  resolvePathPolicy(values: readonly string[], agentName?: string): PermissionCheckResult {
    return this.permissionManager.checkPathPolicy(values, agentName, this.sessionRules.getRuleset());
  }

  checkPermission(
    ...args: [surface: string, input: unknown, agentName?: string, sessionRules?: Rule[]]
  ): PermissionCheckResult {
    const [surface, input, agentName, sessionRules] = args;
    return this.permissionManager.checkPermission(surface, input, agentName, sessionRules);
  }

  getToolPermission(toolName: string, agentName?: string): PermissionState {
    return this.permissionManager.getToolPermission(toolName, agentName);
  }

  getConfigIssues(agentName?: string): string[] {
    return this.permissionManager.getConfigIssues(agentName);
  }

  getPolicyCacheStamp(agentName?: string): string {
    return this.permissionManager.getPolicyCacheStamp(agentName);
  }
}
