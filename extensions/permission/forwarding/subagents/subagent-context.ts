import { normalize } from "node:path";

import { SUBAGENT_ENV_HINT_KEYS } from "../permission-forwarding";
import type { SubagentSessionRegistry } from "./subagent-registry";

export interface SubagentDetectionContext {
  sessionManager: {
    getSessionId(): string;
    getSessionDir(): string;
  };
}

export function normalizeFilesystemPath(pathValue: string): string {
  const normalizedPath = normalize(pathValue);
  return process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
}

function isPathWithinDirectoryForSubagent(pathValue: string, directory: string): boolean {
  if (!pathValue || !directory) {
    return false;
  }

  if (pathValue === directory) {
    return true;
  }

  return pathValue.startsWith(withTrailingSeparator(directory));
}

function withTrailingSeparator(directory: string): string {
  const sep = subagentPathSeparator();
  return directory.endsWith(sep) ? directory : `${directory}${sep}`;
}

function subagentPathSeparator(): string {
  return process.platform === "win32" ? "\\" : "/";
}

export function isRegisteredSubagentChild(ctx: SubagentDetectionContext, registry: SubagentSessionRegistry): boolean {
  try {
    const sessionId = ctx.sessionManager.getSessionId();
    if (!sessionId) {
      return false;
    }
    return registry.has(sessionId);
  } catch {
    return false;
  }
}

export function isSubagentExecutionContext(
  ctx: SubagentDetectionContext,
  subagentSessionsDir: string,
  registry?: SubagentSessionRegistry,
): boolean {
  if (isRegisteredSubagentContext(ctx, registry)) return true;

  const sessionDir = ctx.sessionManager.getSessionDir();

  if (hasSubagentEnvHint()) return true;

  if (!sessionDir) {
    return false;
  }

  const normalizedSessionDir = normalizeFilesystemPath(sessionDir);
  const normalizedSubagentRoot = normalizeFilesystemPath(subagentSessionsDir);
  return isPathWithinDirectoryForSubagent(normalizedSessionDir, normalizedSubagentRoot);
}

function isRegisteredSubagentContext(
  ctx: SubagentDetectionContext,
  registry: SubagentSessionRegistry | undefined,
): boolean {
  return Boolean(registry && isRegisteredSubagentChild(ctx, registry));
}

function hasSubagentEnvHint(): boolean {
  for (const key of SUBAGENT_ENV_HINT_KEYS) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return true;
  }
  return false;
}
