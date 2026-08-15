import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionLoggerDeps } from "#src/integrations/session-logger";
import { PermissionSessionLogger } from "#src/integrations/session-logger";
import { REVIEW_LOG_FILENAME } from "../config/config-paths";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ps-session-logger-"));
});

function makeDeps(overrides: { globalLogsDir?: string } = {}): SessionLoggerDeps {
  return {
    globalLogsDir: overrides.globalLogsDir ?? tempDir,
    notify: vi.fn<(message: string) => void>(),
  };
}

function makeBlockedLogsDir(): string {
  const barrier = join(tempDir, "barrier");
  writeFileSync(barrier, "");
  return join(barrier, "logs");
}

describe("PermissionSessionLogger", () => {
  describe("review", () => {
    it("writes a JSONL line to the review log file", () => {
      const deps = makeDeps();
      const logger = new PermissionSessionLogger(deps);

      logger.review("permission.granted", { agentName: "coder" });

      expect(existsSync(join(tempDir, REVIEW_LOG_FILENAME))).toBe(true);
      expect(deps.notify).not.toHaveBeenCalled();
    });
  });

  describe("IO-failure warnings", () => {
    it("calls notify with the error message when the logs directory cannot be created", () => {
      const deps = makeDeps({ globalLogsDir: makeBlockedLogsDir() });
      const logger = new PermissionSessionLogger(deps);

      logger.review("test.event");

      expect(deps.notify).toHaveBeenCalledOnce();
      expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("Failed to"));
    });

    it("deduplicates the same IO-failure warning across multiple writes", () => {
      const deps = makeDeps({ globalLogsDir: makeBlockedLogsDir() });
      const logger = new PermissionSessionLogger(deps);

      logger.review("event.one");
      logger.review("event.two");

      expect(deps.notify).toHaveBeenCalledOnce();
    });
  });

  describe("warn", () => {
    it("calls notify with the message directly", () => {
      const deps = makeDeps();
      const logger = new PermissionSessionLogger(deps);

      logger.warn("Something went wrong");

      expect(deps.notify).toHaveBeenCalledWith("Something went wrong");
    });

    it("calls notify for every warn — not deduplicated", () => {
      const deps = makeDeps();
      const logger = new PermissionSessionLogger(deps);

      logger.warn("same message");
      logger.warn("same message");

      expect(deps.notify).toHaveBeenCalledTimes(2);
    });

    it("does not throw when notify is a no-op", () => {
      const deps: SessionLoggerDeps = {
        globalLogsDir: tempDir,
        notify: () => {},
      };
      const logger = new PermissionSessionLogger(deps);

      expect(() => logger.warn("test")).not.toThrow();
    });
  });
});
