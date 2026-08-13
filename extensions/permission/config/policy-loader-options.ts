import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getGlobalConfigPath, getProjectConfigPath } from "./config-paths";
import type { PolicyLoaderOptions } from "./policy-loader-types";

type ResolvedPolicyLoaderOptions = {
  globalConfigPath: string;
  agentsDir: string;
  projectGlobalConfigPath: string | null;
  projectAgentsDir: string | null;
  globalMcpConfigPath: string;
  configuredMcpServerNamesOverride: readonly string[] | null;
};

export function derivePolicyLoaderOptions(agentDir: string, cwd: string | undefined | null): PolicyLoaderOptions {
  return {
    globalConfigPath: getGlobalConfigPath(agentDir),
    agentsDir: join(agentDir, "agents"),
    projectGlobalConfigPath: cwd ? getProjectConfigPath(cwd) : undefined,
    projectAgentsDir: cwd ? join(cwd, ".pi", "agent", "agents") : undefined,
  };
}

export function resolvePolicyLoaderOptions(options: PolicyLoaderOptions): ResolvedPolicyLoaderOptions {
  const agentDir = getAgentDir();
  return {
    globalConfigPath: resolveOption(options.globalConfigPath, getGlobalConfigPath(agentDir)),
    agentsDir: resolveOption(options.agentsDir, join(agentDir, "agents")),
    projectGlobalConfigPath: options.projectGlobalConfigPath ?? null,
    projectAgentsDir: options.projectAgentsDir ?? null,
    globalMcpConfigPath: resolveOption(options.globalMcpConfigPath, join(agentDir, "mcp.json")),
    configuredMcpServerNamesOverride: normalizeMcpServerNames(options.mcpServerNames),
  };
}

function resolveOption(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

function normalizeMcpServerNames(names: readonly string[] | undefined): readonly string[] | null {
  if (!names) return null;
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}
