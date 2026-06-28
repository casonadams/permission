import { normalize } from "node:path";

import { SUBAGENT_ENV_HINT_KEYS } from "./permission-forwarding";
import type { SubagentSessionRegistry } from "./subagent-registry";

/**
 * Narrow context for subagent detection — the only session-manager readers
 * {@link isSubagentExecutionContext} and {@link isRegisteredSubagentChild}
 * consume. A full `ExtensionContext` satisfies this structurally.
 */
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

/**
 * Return `true` when `ctx` belongs to an in-process subagent child registered
 * in `registry` by its session id.
 *
 * This is the only signal that identifies an **in-process** child (one sharing
 * the parent's `globalThis`); env-hint and filesystem heuristics identify
 * **process-based** subagents instead. The composition root uses this to decide
 * whether the instance owns the process-global service slot — a registered
 * child must not publish over its parent.
 */
export function isRegisteredSubagentChild(ctx: SubagentDetectionContext, registry: SubagentSessionRegistry): boolean {
  try {
    const sessionId = ctx.sessionManager.getSessionId();
    if (!sessionId) {
      return false;
    }
    return registry.has(sessionId);
  } catch {
    // getSessionId() unavailable — treat as not-a-registered-child.
    return false;
  }
}

export function isSubagentExecutionContext(
  ctx: SubagentDetectionContext,
  subagentSessionsDir: string,
  registry?: SubagentSessionRegistry,
): boolean {
  // 1. Explicit registry — in-process subagent extensions register by child
  //    session id before bindExtensions(); checked first so it takes priority
  //    over heuristics. Each concurrent sibling has a unique session id, so
  //    one sibling's disposed event cannot affect another's registration.
  if (isRegisteredSubagentContext(ctx, registry)) return true;

  const sessionDir = ctx.sessionManager.getSessionDir();

  // 2. Env vars — process-based subagent extensions (nicobailon/pi-subagents,
  //    HazAT/pi-interactive-subagents, pi-agent-router, etc.).
  if (hasSubagentEnvHint()) return true;

  // 3. Filesystem path — fallback heuristic for extensions that store sessions
  //    under a known subagent root directory.
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
