import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createPermissionSystemLogger } from "#src/integrations/logging";

test("Permission-system logger writes the review log", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "pi-permission-system-logs-"));
  const logsDir = join(baseDir, "logs");
  const reviewLogPath = join(logsDir, "review.jsonl");

  const logger = createPermissionSystemLogger({
    reviewLogPath,
    ensureLogsDirectory: () => {
      mkdirSync(logsDir, { recursive: true });
      return undefined;
    },
  });

  try {
    const reviewWarning = logger.review("permission_request.waiting", { toolName: "write" });

    expect(reviewWarning).toBeUndefined();
    expect(existsSync(reviewLogPath)).toBe(true);
    expect(readFileSync(reviewLogPath, "utf8")).toMatch(/permission_request\.waiting/);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});
