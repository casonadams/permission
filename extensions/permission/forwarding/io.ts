import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";

import {
  createPermissionForwardingLocation,
  type PermissionForwardingLocation,
} from "#src/forwarding/permission-forwarding";
import type { DebugReviewLogger } from "#src/integrations/session-logger";
import { logPermissionForwardingError, logPermissionForwardingWarning } from "./io-log";

export { listRequestFiles, sleep } from "./io-list";
export { formatUnknownErrorMessage, logPermissionForwardingError, logPermissionForwardingWarning } from "./io-log";
export { readForwardedPermissionRequest, readForwardedPermissionResponse } from "./io-read";

export function isErrnoCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === code);
}

export function ensureDirectoryExists(logger: DebugReviewLogger | null, path: string, description: string): boolean {
  try {
    mkdirSync(path, { recursive: true });
    return true;
  } catch (error) {
    logPermissionForwardingError(logger, `Failed to create ${description} directory '${path}'`, error);
    return false;
  }
}

export function getPermissionForwardingLocationForSession(
  forwardingDir: string,
  sessionId: string,
): PermissionForwardingLocation {
  return createPermissionForwardingLocation(forwardingDir, sessionId);
}

export function ensurePermissionForwardingLocation(
  logger: DebugReviewLogger | null,
  forwardingDir: string,
  sessionId: string,
): PermissionForwardingLocation | null {
  let location: PermissionForwardingLocation;
  try {
    location = getPermissionForwardingLocationForSession(forwardingDir, sessionId);
  } catch (error) {
    logPermissionForwardingError(logger, "Failed to resolve permission forwarding location", error);
    return null;
  }

  const sessionRootReady = ensureDirectoryExists(logger, location.sessionRootDir, "permission forwarding session root");
  const requestsReady = ensureDirectoryExists(logger, location.requestsDir, "permission forwarding requests");
  const responsesReady = ensureDirectoryExists(logger, location.responsesDir, "permission forwarding responses");

  return sessionRootReady && requestsReady && responsesReady ? location : null;
}

export function getExistingPermissionForwardingLocation(
  forwardingDir: string,
  sessionId: string,
): PermissionForwardingLocation | null {
  let location: PermissionForwardingLocation;
  try {
    location = getPermissionForwardingLocationForSession(forwardingDir, sessionId);
  } catch {
    return null;
  }

  return existsSync(location.requestsDir) ? location : null;
}

/**
 * Attempt to remove a directory if it is empty.
 *
 * Returns `true` when the directory is absent after the call (successfully
 * removed, or never existed).  Returns `false` when the directory still exists
 * (non-empty, or a filesystem error prevented removal).
 */
export function tryRemoveDirectoryIfEmpty(
  logger: DebugReviewLogger | null,
  path: string,
  description: string,
): boolean {
  if (!existsSync(path)) {
    return true;
  }

  let entries: string[];
  try {
    entries = readdirSync(path);
  } catch (error) {
    logPermissionForwardingWarning(logger, `Failed to inspect ${description} directory '${path}'`, error);
    return false;
  }

  if (entries.length > 0) {
    return false;
  }

  try {
    rmdirSync(path);
    return true;
  } catch (error) {
    return handleRemoveEmptyDirectoryError({ logger, path, description, error });
  }
}

function handleRemoveEmptyDirectoryError(params: {
  logger: DebugReviewLogger | null;
  path: string;
  description: string;
  error: unknown;
}): boolean {
  if (isErrnoCode(params.error, "ENOENT")) return true;
  if (isErrnoCode(params.error, "ENOTEMPTY")) return false;

  logPermissionForwardingWarning(
    params.logger,
    `Failed to remove empty ${params.description} directory '${params.path}'`,
    params.error,
  );
  return false;
}

export function cleanupPermissionForwardingLocationIfEmpty(
  logger: DebugReviewLogger | null,
  location: PermissionForwardingLocation,
): void {
  // Only remove responses/ when requests/ is already gone — removing responses/
  // while a request is still pending causes the ENOENT write loop (issue #398).
  const requestsGone = tryRemoveDirectoryIfEmpty(
    logger,
    location.requestsDir,
    `${location.label} permission forwarding requests`,
  );
  if (requestsGone) {
    tryRemoveDirectoryIfEmpty(logger, location.responsesDir, `${location.label} permission forwarding responses`);
  }
  tryRemoveDirectoryIfEmpty(logger, location.sessionRootDir, `${location.label} permission forwarding session root`);
}

export function safeDeleteFile(logger: DebugReviewLogger | null, filePath: string, description: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return;
    }

    logPermissionForwardingWarning(logger, `Failed to delete ${description} file '${filePath}'`, error);
  }
}

export function writeJsonFileAtomic(logger: DebugReviewLogger | null, filePath: string, value: unknown): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    writeFileSync(tempPath, JSON.stringify(value), "utf-8");
    renameSync(tempPath, filePath);
  } catch (error) {
    safeDeleteFile(logger, tempPath, "temporary permission-forwarding");
    throw error;
  }
}
