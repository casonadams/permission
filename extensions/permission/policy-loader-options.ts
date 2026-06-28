import { join } from "node:path";
import { getGlobalConfigPath, getProjectConfigPath } from "./config-paths";
import type { PolicyLoaderOptions } from "./policy-loader";

export function derivePolicyLoaderOptions(agentDir: string, cwd: string | undefined | null): PolicyLoaderOptions {
  return {
    globalConfigPath: getGlobalConfigPath(agentDir),
    agentsDir: join(agentDir, "agents"),
    projectGlobalConfigPath: cwd ? getProjectConfigPath(cwd) : undefined,
    projectAgentsDir: cwd ? join(cwd, ".pi", "agent", "agents") : undefined,
  };
}
