import { join } from "node:path";
import { REVIEW_LOG_FILENAME } from "../config/config-paths";
import { ensurePermissionSystemLogsDirectory } from "../config/extension-config";
import { createPermissionSystemLogger, type PermissionSystemLogger } from "./logging";

/** Narrowest logging seam — consumers that only write review-log entries. */
export interface ReviewLogger {
  review(event: string, details?: Record<string, unknown>): void;
}

/** Logging seam. */
export type DebugReviewLogger = ReviewLogger;

export interface SessionLogger extends ReviewLogger {
  warn(message: string): void;
}

export interface SessionLoggerDeps {
  /** Root logs directory; the review log file path derives from it. */
  globalLogsDir: string;
  /** Surfaces a warning message to the user. */
  notify: (message: string) => void;
}

/**
 * Concrete `SessionLogger` implementation.
 *
 * Composes the JSONL log writer, privately owns the IO-failure warning
 * dedup Set, and routes both IO-failure warnings and explicit warn() calls
 * through the injected notify sink.
 */
export class PermissionSessionLogger implements SessionLogger {
  private readonly writer: PermissionSystemLogger;
  private readonly reported = new Set<string>();
  private readonly notify: (message: string) => void;

  constructor(deps: SessionLoggerDeps) {
    this.writer = createPermissionSystemLogger({
      reviewLogPath: join(deps.globalLogsDir, REVIEW_LOG_FILENAME),
      ensureLogsDirectory: () => ensurePermissionSystemLogsDirectory(deps.globalLogsDir),
    });
    this.notify = deps.notify;
  }

  review(event: string, details?: Record<string, unknown>): void {
    const warning = this.writer.review(event, details);
    if (warning) this.reportOnce(warning);
  }

  warn(message: string): void {
    this.notify(message);
  }

  private reportOnce(warning: string): void {
    if (this.reported.has(warning)) return;
    this.reported.add(warning);
    this.notify(warning);
  }
}