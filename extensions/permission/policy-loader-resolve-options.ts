import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getGlobalConfigPath } from "./config-paths";
import type { PolicyLoaderOptions } from "./policy-loader-types";

type ResolvedPolicyLoaderOptions = {
  globalConfigPath: string;
  agentsDir: string;
  projectGlobalConfigPath: string | null;
  projectAgentsDir: string | null;
  globalMcpConfigPath: string;
  configuredMcpServerNamesOverride: readonly string[] | null;
};

export function resolvePolicyLoaderOptions(options: PolicyLoaderOptions): ResolvedPolicyLoaderOptions {
  const defaults = defaultPolicyLoaderOptions();
  return {
    globalConfigPath: resolveOption(options.globalConfigPath, defaults.globalConfigPath),
    agentsDir: resolveOption(options.agentsDir, defaults.agentsDir),
    projectGlobalConfigPath: options.projectGlobalConfigPath ?? null,
    projectAgentsDir: options.projectAgentsDir ?? null,
    globalMcpConfigPath: resolveOption(options.globalMcpConfigPath, defaults.globalMcpConfigPath),
    configuredMcpServerNamesOverride: normalizeMcpServerNameOverride(options.mcpServerNames),
  };
}

function resolveOption(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

function defaultPolicyLoaderOptions() {
  return {
    globalConfigPath: getGlobalConfigPath(getAgentDir()),
    agentsDir: join(getAgentDir(), "agents"),
    globalMcpConfigPath: join(getAgentDir(), "mcp.json"),
  };
}

function normalizeMcpServerNameOverride(names: readonly string[] | undefined): readonly string[] | null {
  if (!names) return null;
  return [...new Set(names.map((name) => name.trim()).filter((name) => name.length > 0))];
}
