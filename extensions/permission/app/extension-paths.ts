import { join } from "node:path";
import { discoverGlobalNodeModulesRoot } from "../paths/node-modules-discovery";

export interface ExtensionPaths {
  readonly agentDir: string;
  readonly sessionsDir: string;
  readonly subagentSessionsDir: string;
  readonly forwardingDir: string;
  readonly piInfrastructureDirs: readonly string[];
}

export function computeExtensionPaths(agentDir: string, piPackageDir?: string): ExtensionPaths {
  const sessionsDir = join(agentDir, "sessions");
  const subagentSessionsDir = join(agentDir, "subagent-sessions");
  const forwardingDir = join(sessionsDir, "permission-forwarding");

  const globalNodeModulesRoot = discoverGlobalNodeModulesRoot();
  const piInfrastructureDirs: string[] = [
    agentDir,
    join(agentDir, "git"),
    ...(globalNodeModulesRoot ? [globalNodeModulesRoot] : []),
    ...(piPackageDir ? [piPackageDir] : []),
  ];

  return {
    agentDir,
    sessionsDir,
    subagentSessionsDir,
    forwardingDir,
    piInfrastructureDirs,
  };
}
