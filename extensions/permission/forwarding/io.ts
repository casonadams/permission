import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";

import {
  createPermissionForwardingLocation,
  type PermissionForwardingLocation,
} from "#src/forwarding/permission-forwarding";
import type { PermissionNotifier } from "#src/integrations/notifier";
import { notifyPermissionForwardingError, notifyPermissionForwardingWarning } from "./io-log";

export { listRequestFiles, sleep } from "./io-list";
export {
  formatUnknownErrorMessage,
  notifyPermissionForwardingError,
  notifyPermissionForwardingWarning,
} from "./io-log";
export { readForwardedPermissionRequest, readForwardedPermissionResponse } from "./io-read";

export function isErrnoCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === code);
}

export function ensureDirectoryExists(notifier: PermissionNotifier | null, path: string, description: string): boolean {
  try {
    mkdirSync(path, { recursive: true });
    return true;
  } catch (error) {
    notifyPermissionForwardingError(notifier, `Failed to create ${description} directory '${path}'`, error);
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
  notifier: PermissionNotifier | null,
  forwardingDir: string,
  sessionId: string,
): PermissionForwardingLocation | null {
  let location: PermissionForwardingLocation;
  try {
    location = getPermissionForwardingLocationForSession(forwardingDir, sessionId);
  } catch (error) {
    notifyPermissionForwardingError(notifier, "Failed to resolve permission forwarding location", error);
    return null;
  }

  const sessionRootReady = ensureDirectoryExists(
    notifier,
    location.sessionRootDir,
    "permission forwarding session root",
  );
  const requestsReady = ensureDirectoryExists(notifier, location.requestsDir, "permission forwarding requests");
  const responsesReady = ensureDirectoryExists(notifier, location.responsesDir, "permission forwarding responses");

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

export function tryRemoveDirectoryIfEmpty(
  notifier: PermissionNotifier | null,
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
    notifyPermissionForwardingWarning(notifier, `Failed to inspect ${description} directory '${path}'`, error);
    return false;
  }

  if (entries.length > 0) {
    return false;
  }

  try {
    rmdirSync(path);
    return true;
  } catch (error) {
    return handleRemoveEmptyDirectoryError({ notifier, path, description, error });
  }
}

function handleRemoveEmptyDirectoryError(params: {
  notifier: PermissionNotifier | null;
  path: string;
  description: string;
  error: unknown;
}): boolean {
  if (isErrnoCode(params.error, "ENOENT")) return true;
  if (isErrnoCode(params.error, "ENOTEMPTY")) return false;

  notifyPermissionForwardingWarning(
    params.notifier,
    `Failed to remove empty ${params.description} directory '${params.path}'`,
    params.error,
  );
  return false;
}

export function cleanupPermissionForwardingLocationIfEmpty(
  notifier: PermissionNotifier | null,
  location: PermissionForwardingLocation,
): void {
  // Requests must be gone first; concurrent response writes otherwise hit the ENOENT loop tracked in #398.
  const requestsGone = tryRemoveDirectoryIfEmpty(
    notifier,
    location.requestsDir,
    `${location.label} permission forwarding requests`,
  );
  if (requestsGone) {
    tryRemoveDirectoryIfEmpty(notifier, location.responsesDir, `${location.label} permission forwarding responses`);
  }
  tryRemoveDirectoryIfEmpty(notifier, location.sessionRootDir, `${location.label} permission forwarding session root`);
}

export function safeDeleteFile(notifier: PermissionNotifier | null, filePath: string, description: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return;
    }

    notifyPermissionForwardingWarning(notifier, `Failed to delete ${description} file '${filePath}'`, error);
  }
}

export function writeJsonFileAtomic(notifier: PermissionNotifier | null, filePath: string, value: unknown): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    writeFileSync(tempPath, JSON.stringify(value), "utf-8");
    renameSync(tempPath, filePath);
  } catch (error) {
    safeDeleteFile(notifier, tempPath, "temporary permission-forwarding");
    throw error;
  }
}
