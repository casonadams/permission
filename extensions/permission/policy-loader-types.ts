import type { ScopeConfig } from "./types";

export interface ResolvedPolicyPaths {
  globalConfigPath: string;
  globalConfigExists: boolean;
  projectConfigPath: string | null;
  projectConfigExists: boolean;
  agentsDir: string;
  agentsDirExists: boolean;
  projectAgentsDir: string | null;
  projectAgentsDirExists: boolean;
}

export interface PolicyLoader {
  loadGlobalConfig(): ScopeConfig;
  loadProjectConfig(): ScopeConfig;
  loadAgentConfig(agentName?: string): ScopeConfig;
  loadProjectAgentConfig(agentName?: string): ScopeConfig;
  getConfiguredMcpServerNames(): readonly string[];
  getCacheStamp(agentName?: string): string;
  getConfigIssues(agentName?: string): string[];
  getResolvedPolicyPaths(): ResolvedPolicyPaths;
}

export interface PolicyLoaderOptions {
  globalConfigPath?: string;
  agentsDir?: string;
  projectGlobalConfigPath?: string;
  projectAgentsDir?: string;
  globalMcpConfigPath?: string;
  mcpServerNames?: readonly string[];
}
