import { join } from "node:path";
import { REVIEW_LOG_FILENAME } from "../config/config-paths";
import { ensurePermissionSystemLogsDirectory } from "../config/extension-config";
import { createPermissionSystemLogger, type PermissionSystemLogger } from "./logging";

export interface ReviewLogger {
  review(event: string, details?: Record<string, unknown>): void;
}

export interface SessionLogger extends ReviewLogger {
  warn(message: string): void;
}

export interface SessionLoggerDeps {
  globalLogsDir: string;
  notify: (message: string) => void;
}

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
