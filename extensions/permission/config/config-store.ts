import { existsSync } from "node:fs";
import { normalize } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ReviewLogger } from "../integrations/session-logger";
import { collectLegacyConfigIssues } from "./config-loader";
import {
  getGlobalConfigPath,
  getLegacyExtensionConfigPath,
  getLegacyGlobalPolicyPath,
  getLegacyProjectPolicyPath,
} from "./config-paths";
import { buildResolvedConfigLogEntry } from "./config-reporter";
import { EXTENSION_ROOT } from "./extension-config";
import type { ResolvedPolicyPaths } from "./policy-loader";

export interface SessionConfigStore {
  refresh(ctx?: ExtensionContext): void;
  logResolvedPaths(cwd?: string): void;
}

export interface ConfigPolicyProvider {
  getConfigIssues(): string[];
  getResolvedPolicyPaths(): ResolvedPolicyPaths;
}

export interface ConfigStoreDeps {
  agentDir: string;
  policyPaths: ConfigPolicyProvider;
  logger: ReviewLogger;
}

export class ConfigStore implements SessionConfigStore {
  private lastConfigWarning: string | null = null;

  constructor(private readonly deps: ConfigStoreDeps) {}

  refresh(ctx?: ExtensionContext): void {
    const issues = [
      ...collectLegacyConfigIssues(this.deps.agentDir, ctx?.cwd ?? "", EXTENSION_ROOT),
      ...this.deps.policyPaths.getConfigIssues(),
    ];
    const warning = this.updateConfigWarning(issues, ctx);
    if (warning === undefined) {
      this.deps.logger.review("config.loaded", { warning: null });
    }
  }

  private updateConfigWarning(issues: readonly string[], ctx?: ExtensionContext): string | undefined {
    const warning = issues.length > 0 ? issues.join("\n") : undefined;
    if (warning) return this.notifyNewWarning(warning, ctx);
    this.lastConfigWarning = null;
    return undefined;
  }

  private notifyNewWarning(warning: string, ctx?: ExtensionContext): string {
    if (warning !== this.lastConfigWarning) {
      this.lastConfigWarning = warning;
      ctx?.ui.notify(warning, "warning");
    }
    return warning;
  }

  logResolvedPaths(cwd?: string): void {
    const policyPaths = this.deps.policyPaths.getResolvedPolicyPaths();
    const { agentDir } = this.deps;
    const legacyGlobalPolicyDetected = existsSync(getLegacyGlobalPolicyPath(agentDir));
    const legacyProjectPolicyDetected = cwd ? existsSync(getLegacyProjectPolicyPath(cwd)) : false;
    const legacyExtConfigPath = getLegacyExtensionConfigPath(EXTENSION_ROOT);
    const newGlobalPath = getGlobalConfigPath(agentDir);
    const legacyExtensionConfigDetected =
      normalize(legacyExtConfigPath) !== normalize(newGlobalPath) && existsSync(legacyExtConfigPath);
    const entry = buildResolvedConfigLogEntry({
      policyPaths,
      legacyGlobalPolicyDetected,
      legacyProjectPolicyDetected,
      legacyExtensionConfigDetected,
    });
    this.deps.logger.review("config.resolved", entry as unknown as Record<string, unknown>);
  }
}
