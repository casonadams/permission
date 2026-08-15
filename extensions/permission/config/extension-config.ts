import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const EXTENSION_ID = "pi-permission-system";

export type PermissionSystemExtensionConfig = Record<string, never>;

export const DEFAULT_EXTENSION_CONFIG: PermissionSystemExtensionConfig = {};

function resolveExtensionRoot(moduleUrl = import.meta.url): string {
  return join(dirname(fileURLToPath(moduleUrl)), "..");
}

export const EXTENSION_ROOT = resolveExtensionRoot();

const PERMISSION_POLICY_KEYS: ReadonlySet<string> = new Set([
  "defaultPolicy",
  "tools",
  "bash",
  "mcp",
  "skills",
  "special",
]);

export function detectMisplacedPermissionKeys(raw: Record<string, unknown>): string[] {
  return Object.keys(raw).filter((key) => PERMISSION_POLICY_KEYS.has(key));
}

export function normalizePermissionSystemConfig(raw: Record<string, unknown>): PermissionSystemExtensionConfig {
  void raw;
  return {};
}

export function ensurePermissionSystemLogsDirectory(logsDir: string): string | undefined {
  try {
    mkdirSync(logsDir, { recursive: true });
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to create permission-system log directory '${logsDir}': ${message}`;
  }
}
