import { readdirSync } from "node:fs";
import type { ReviewLogger } from "#src/integrations/session-logger";
import { logPermissionForwardingWarning } from "./io-log";

export function listRequestFiles(logger: ReviewLogger | null, requestsDir: string): string[] {
  try {
    return readdirSync(requestsDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    logPermissionForwardingWarning(
      logger,
      `Failed to read permission forwarding requests from '${requestsDir}'`,
      error,
    );
    return [];
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
