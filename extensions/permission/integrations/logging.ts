import { appendFileSync } from "node:fs";

import { EXTENSION_ID } from "../config/extension-config";

export function safeJsonStringify(value: unknown): string | undefined {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, currentValue) => {
    if (currentValue instanceof Error) {
      return {
        name: currentValue.name,
        message: currentValue.message,
        stack: currentValue.stack,
      };
    }

    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }

    const circular = circularMarker(currentValue, seen);
    return circular ?? currentValue;
  });
}

function circularMarker(value: unknown, seen: WeakSet<object>): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  return undefined;
}

export interface PermissionSystemLogger {
  debug?: (event: string, details?: Record<string, unknown>) => string | undefined;
  review: (event: string, details?: Record<string, unknown>) => string | undefined;
}

interface PermissionSystemLoggerOptions {
  reviewLogPath: string;
  ensureLogsDirectory: () => string | undefined;
}

type LogLine = {
  path: string;
  event: string;
  details: Record<string, unknown>;
};

/**
 * Build a logger that always writes the audit-trail stream to JSONL.
 *
 * The optional `debug` slot stays in the interface for compatibility but is
 * a no-op; only `review` writes to disk.
 */
export function createPermissionSystemLogger(options: PermissionSystemLoggerOptions): PermissionSystemLogger {
  const { reviewLogPath, ensureLogsDirectory } = options;

  const writeLine = (entry: LogLine): string | undefined => {
    const directoryError = ensureLogsDirectory();
    if (directoryError) {
      return directoryError;
    }

    try {
      const line = safeJsonStringify({
        timestamp: new Date().toISOString(),
        extension: EXTENSION_ID,
        event: entry.event,
        ...entry.details,
      });
      if (!line) {
        return `Failed to write permission-system review log '${entry.path}': event could not be serialized.`;
      }
      appendFileSync(entry.path, `${line}\n`, "utf-8");
      return undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Failed to write permission-system review log '${entry.path}': ${message}`;
    }
  };

  return {
    debug: () => undefined,
    review: (event, details = {}) => writeLine({ path: reviewLogPath, event, details }),
  };
}