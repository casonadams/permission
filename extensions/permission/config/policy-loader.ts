import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractFrontmatter, parseSimpleYamlMap } from "../shared/common";
import { loadUnifiedConfig } from "./config-loader";
import { normalizeUnifiedConfig } from "./config-normalize";
import { getConfiguredMcpServerNamesFromPaths } from "./mcp-config-loader";
import { resolvePolicyLoaderOptions } from "./policy-loader-options";
import type { PolicyLoader, PolicyLoaderOptions, ResolvedPolicyPaths } from "./policy-loader-types";

export type { PolicyLoader, PolicyLoaderOptions, ResolvedPolicyPaths } from "./policy-loader-types";

import type { ScopeConfig } from "../policy/types";

function getFileStamp(path: string): string {
  try {
    return String(statSync(path).mtimeMs);
  } catch {
    return "missing";
  }
}

type FileCacheEntry<TValue> = { stamp: string; value: TValue };

export class FilePolicyLoader implements PolicyLoader {
  private readonly globalConfigPath: string;
  private readonly agentsDir: string;
  private readonly projectGlobalConfigPath: string | null;
  private readonly projectAgentsDir: string | null;
  private readonly globalMcpConfigPath: string;
  private readonly configuredMcpServerNamesOverride: readonly string[] | null;

  private globalConfigCache: FileCacheEntry<ScopeConfig> | null = null;
  private projectGlobalConfigCache: FileCacheEntry<ScopeConfig> | null = null;
  private readonly agentConfigCache = new Map<string, FileCacheEntry<ScopeConfig>>();
  private readonly projectAgentConfigCache = new Map<string, FileCacheEntry<ScopeConfig>>();
  private configuredMcpServerNamesCache: FileCacheEntry<readonly string[]> | null = null;
  private readonly configIssuesBySource = new Map<string, string[]>();

  constructor(options: PolicyLoaderOptions = {}) {
    const resolved = resolvePolicyLoaderOptions(options);
    this.globalConfigPath = resolved.globalConfigPath;
    this.agentsDir = resolved.agentsDir;
    this.projectGlobalConfigPath = resolved.projectGlobalConfigPath;
    this.projectAgentsDir = resolved.projectAgentsDir;
    this.globalMcpConfigPath = resolved.globalMcpConfigPath;
    this.configuredMcpServerNamesOverride = resolved.configuredMcpServerNamesOverride;
  }

  private setConfigIssues(source: string, issues: string[]): void {
    this.configIssuesBySource.set(source, issues);
  }

  getConfigIssues(agentName?: string): string[] {
    const agentSources = agentName ? [join(this.agentsDir, `${agentName}.md`), this.projectAgentPath(agentName)] : [];
    const sources = [this.globalConfigPath, this.projectGlobalConfigPath, ...agentSources];
    return [...new Set(sources.flatMap((source) => (source ? (this.configIssuesBySource.get(source) ?? []) : [])))];
  }

  private projectAgentPath(agentName: string): string | null {
    return this.projectAgentsDir ? join(this.projectAgentsDir, `${agentName}.md`) : null;
  }

  loadGlobalConfig(): ScopeConfig {
    const stamp = getFileStamp(this.globalConfigPath);
    if (this.globalConfigCache?.stamp === stamp) {
      return this.globalConfigCache.value;
    }

    const { config, issues } = loadUnifiedConfig(this.globalConfigPath);
    this.setConfigIssues(this.globalConfigPath, issues);

    const value: ScopeConfig = { permission: config.permission };
    this.globalConfigCache = { stamp, value };
    return value;
  }

  loadProjectConfig(): ScopeConfig {
    if (!this.projectGlobalConfigPath) {
      return {};
    }

    const stamp = getFileStamp(this.projectGlobalConfigPath);
    if (this.projectGlobalConfigCache?.stamp === stamp) {
      return this.projectGlobalConfigCache.value;
    }

    const { config, issues } = loadUnifiedConfig(this.projectGlobalConfigPath);
    this.setConfigIssues(this.projectGlobalConfigPath, issues);

    const value: ScopeConfig = { permission: config.permission };
    this.projectGlobalConfigCache = { stamp, value };
    return value;
  }

  private loadScopeConfigFrom(
    dir: string | null,
    cache: Map<string, FileCacheEntry<ScopeConfig>>,
    agentName?: string,
  ): ScopeConfig {
    if (!dir || !agentName) return {};

    const filePath = join(dir, `${agentName}.md`);
    const stamp = getFileStamp(filePath);
    const cached = cache.get(agentName);
    if (cached?.stamp === stamp) return cached.value;

    const value = this.readScopeConfigFile(filePath);
    cache.set(agentName, { stamp, value });
    return value;
  }

  private readScopeConfigFile(filePath: string): ScopeConfig {
    try {
      const markdown = readFileSync(filePath, "utf-8");
      return this.parseScopeFrontmatter(filePath, extractFrontmatter(markdown));
    } catch {
      this.setConfigIssues(filePath, []);
      return {};
    }
  }

  private parseScopeFrontmatter(filePath: string, frontmatter: string): ScopeConfig {
    if (!frontmatter) {
      this.setConfigIssues(filePath, []);
      return {};
    }

    const parsed = parseSimpleYamlMap(frontmatter);
    const { config, issues } = normalizeUnifiedConfig(parsed);
    this.setConfigIssues(filePath, issues);
    return { permission: config.permission };
  }

  loadAgentConfig(agentName?: string): ScopeConfig {
    return this.loadScopeConfigFrom(this.agentsDir, this.agentConfigCache, agentName);
  }

  loadProjectAgentConfig(agentName?: string): ScopeConfig {
    return this.loadScopeConfigFrom(this.projectAgentsDir, this.projectAgentConfigCache, agentName);
  }

  getConfiguredMcpServerNames(): readonly string[] {
    if (this.configuredMcpServerNamesOverride) {
      return this.configuredMcpServerNamesOverride;
    }

    const paths = [this.globalMcpConfigPath];
    const stamp = paths.map((path) => `${path}:${getFileStamp(path)}`).join("|");
    if (this.configuredMcpServerNamesCache?.stamp === stamp) {
      return this.configuredMcpServerNamesCache.value;
    }

    const value = getConfiguredMcpServerNamesFromPaths(paths);
    this.configuredMcpServerNamesCache = { stamp, value };
    return value;
  }

  getCacheStamp(agentName?: string): string {
    const agentStamp = agentName ? getFileStamp(join(this.agentsDir, `${agentName}.md`)) : "missing";
    const projectStamp = this.projectGlobalConfigPath ? getFileStamp(this.projectGlobalConfigPath) : "none";
    const projectAgentPath = agentName ? this.projectAgentPath(agentName) : null;
    const projectAgentStamp = projectAgentPath ? getFileStamp(projectAgentPath) : "none";
    return `${getFileStamp(this.globalConfigPath)}|${projectStamp}|${agentStamp}|${projectAgentStamp}`;
  }

  getResolvedPolicyPaths(): ResolvedPolicyPaths {
    return {
      globalConfigPath: this.globalConfigPath,
      globalConfigExists: existsSync(this.globalConfigPath),
      projectConfigPath: this.projectGlobalConfigPath,
      projectConfigExists: this.projectGlobalConfigPath ? existsSync(this.projectGlobalConfigPath) : false,
      agentsDir: this.agentsDir,
      agentsDirExists: existsSync(this.agentsDir),
      projectAgentsDir: this.projectAgentsDir,
      projectAgentsDirExists: this.projectAgentsDir ? existsSync(this.projectAgentsDir) : false,
    };
  }
}
