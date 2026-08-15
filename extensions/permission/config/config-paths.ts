import { join } from "node:path";

export function getGlobalConfigPath(agentDir: string): string {
  return join(agentDir, "permission.json");
}

export function getProjectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "agent", "permission.json");
}

export function getLegacyGlobalPolicyPath(agentDir: string): string {
  return join(agentDir, "pi-permissions.jsonc");
}

export function getLegacyProjectPolicyPath(cwd: string): string {
  return join(cwd, ".pi", "agent", "pi-permissions.jsonc");
}

export function getLegacyExtensionConfigPath(extensionRoot: string): string {
  return join(extensionRoot, "config.json");
}
