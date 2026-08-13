import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, normalize } from "node:path";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { syncPermissionSystemStatus } from "../app/status";
import type { DebugReviewLogger } from "../integrations/session-logger";
import { MODAL_BOOLEAN_CONFIG_KEYS } from "./config-keys";
import { loadAndMergeConfigs, loadUnifiedConfig } from "./config-loader";
import type { UnifiedPermissionConfig } from "./config-normalize";
import {
  getGlobalConfigPath,
  getLegacyExtensionConfigPath,
  getLegacyGlobalPolicyPath,
  getLegacyProjectPolicyPath,
} from "./config-paths";
import { buildResolvedConfigLogEntry } from "./config-reporter";
import {
  DEFAULT_EXTENSION_CONFIG,
  EXTENSION_ROOT,
  normalizePermissionSystemConfig,
  type PermissionSystemExtensionConfig,
} from "./extension-config";
import type { ResolvedPolicyPaths } from "./policy-loader";

export interface ConfigReader {
  current(): PermissionSystemExtensionConfig;
}

export interface SessionConfigStore extends ConfigReader {
  refresh(ctx?: ExtensionContext): void;
  logResolvedPaths(cwd?: string): void;
}

export interface CommandConfigStore extends ConfigReader {
  save(next: PermissionSystemExtensionConfig, ctx: ExtensionCommandContext): void;
}

export interface ResolvedPolicyPathProvider {
  getResolvedPolicyPaths(): ResolvedPolicyPaths;
}

export interface ConfigStoreDeps {
  agentDir: string;
  policyPaths: ResolvedPolicyPathProvider;
  logger: DebugReviewLogger;
}

function syncStatusIfAvailable(ctx: ExtensionContext | undefined, config: PermissionSystemExtensionConfig): void {
  if (ctx?.hasUI) syncPermissionSystemStatus(ctx, config);
}

function modalBooleanConfigDetails(config: PermissionSystemExtensionConfig): Record<string, boolean> {
  const details: Record<string, boolean> = {};
  for (const key of MODAL_BOOLEAN_CONFIG_KEYS) {
    details[key] = config[key];
  }
  return details;
}

export class ConfigStore implements SessionConfigStore, CommandConfigStore {
  private config: PermissionSystemExtensionConfig = { ...DEFAULT_EXTENSION_CONFIG };
  private lastConfigWarning: string | null = null;

  constructor(private readonly deps: ConfigStoreDeps) {}

  current(): PermissionSystemExtensionConfig {
    return this.config;
  }

  refresh(ctx?: ExtensionContext): void {
    const cwd = ctx?.cwd ?? null;
    const mergeResult = loadAndMergeConfigs(this.deps.agentDir, cwd ?? "", EXTENSION_ROOT);
    const runtimeConfig = normalizePermissionSystemConfig(mergeResult.merged);
    this.config = runtimeConfig;

    syncStatusIfAvailable(ctx, runtimeConfig);
    const warning = this.updateConfigWarning(mergeResult.issues, ctx);
    this.logLoadedConfig(runtimeConfig, warning);
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

  private logLoadedConfig(runtimeConfig: PermissionSystemExtensionConfig, warning: string | undefined): void {
    this.deps.logger.debug("config.loaded", {
      warning: warning ?? null,
      ...modalBooleanConfigDetails(runtimeConfig),
    });
  }

  // Called via the CommandConfigStore interface from config-modal.ts — fallow cannot trace through interfaces.
  // fallow-ignore-next-line unused-class-member
  save(next: PermissionSystemExtensionConfig, ctx: ExtensionCommandContext): void {
    const normalized = normalizePermissionSystemConfig(next);
    const globalPath = getGlobalConfigPath(this.deps.agentDir);

    const existing = loadUnifiedConfig(globalPath);
    const merged: UnifiedPermissionConfig = { ...existing.config, ...modalBooleanConfigDetails(normalized) };

    const tmpPath = `${globalPath}.tmp`;
    try {
      mkdirSync(dirname(globalPath), { recursive: true });
      writeFileSync(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
      renameSync(tmpPath, globalPath);
    } catch (error) {
      try {
        if (existsSync(tmpPath)) {
          unlinkSync(tmpPath);
        }
      } catch {
        // Ignore cleanup failures.
      }
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Failed to save permission-system config at '${globalPath}': ${message}`, "error");
      return;
    }

    this.config = normalized;
    syncPermissionSystemStatus(ctx, normalized);
    this.lastConfigWarning = null;

    this.deps.logger.debug("config.saved", modalBooleanConfigDetails(normalized));
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
    this.deps.logger.debug("config.resolved", entry as unknown as Record<string, unknown>);
  }
}
