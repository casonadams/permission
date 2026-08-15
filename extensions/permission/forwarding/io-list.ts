import { readdirSync } from "node:fs";
import type { PermissionNotifier } from "#src/integrations/notifier";
import { notifyPermissionForwardingWarning } from "./io-log";

export function listRequestFiles(notifier: PermissionNotifier | null, requestsDir: string): string[] {
  try {
    return readdirSync(requestsDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    notifyPermissionForwardingWarning(
      notifier,
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
