import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupPermissionForwardingLocationIfEmpty,
  formatUnknownErrorMessage,
  isErrnoCode,
  logPermissionForwardingError,
  logPermissionForwardingWarning,
  tryRemoveDirectoryIfEmpty,
} from "#src/forwarding/io";
import { createPermissionForwardingLocation } from "#src/forwarding/permission-forwarding";
import type { ReviewLogger } from "#src/integrations/session-logger";

function makeLogger(): ReviewLogger {
  return {
    review: vi.fn(),
  };
}

describe("formatUnknownErrorMessage", () => {
  it("returns the error message for Error instances", () => {
    expect(formatUnknownErrorMessage(new Error("oops"))).toBe("oops");
  });

  it("converts non-Error values to string", () => {
    expect(formatUnknownErrorMessage("raw string")).toBe("raw string");
    expect(formatUnknownErrorMessage(42)).toBe("42");
  });

  it("falls back to String(error) for Error with empty message", () => {
    const e = new Error("");
    expect(formatUnknownErrorMessage(e)).toBe("Error");
  });
});

describe("isErrnoCode", () => {
  it("returns true when code matches", () => {
    expect(isErrnoCode({ code: "ENOENT" }, "ENOENT")).toBe(true);
  });

  it("returns false when code does not match", () => {
    expect(isErrnoCode({ code: "EACCES" }, "ENOENT")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isErrnoCode(null, "ENOENT")).toBe(false);
  });

  it("returns false when no code property", () => {
    expect(isErrnoCode({}, "ENOENT")).toBe(false);
  });
});

describe("logPermissionForwardingWarning", () => {
  it("calls logger.review with the warning event", () => {
    const logger = makeLogger();
    logPermissionForwardingWarning(logger, "something went wrong");
    expect(logger.review).toHaveBeenCalledWith("permission_forwarding.warning", { message: "something went wrong" });
  });

  it("only writes to review (debug stream removed)", () => {
    const logger = makeLogger();
    logPermissionForwardingWarning(logger, "something went wrong");
    expect(logger.review).toHaveBeenCalledWith("permission_forwarding.warning", { message: "something went wrong" });
  });

  it("includes formatted error when an error is provided", () => {
    const logger = makeLogger();
    logPermissionForwardingWarning(logger, "bad thing", new Error("fs fail"));
    expect(logger.review).toHaveBeenCalledWith("permission_forwarding.warning", {
      message: "bad thing",
      error: "fs fail",
    });
  });

  it("does not throw when logger is null", () => {
    expect(() => logPermissionForwardingWarning(null, "ignored")).not.toThrow();
  });

  it("does not call anything when logger is null", () => {
    expect(() => logPermissionForwardingWarning(null, "msg", new Error("err"))).not.toThrow();
  });
});

describe("logPermissionForwardingError", () => {
  it("calls logger.review with the error event", () => {
    const logger = makeLogger();
    logPermissionForwardingError(logger, "critical failure");
    expect(logger.review).toHaveBeenCalledWith("permission_forwarding.error", {
      message: "critical failure",
    });
  });

  it("only writes to review (debug stream removed)", () => {
    const logger = makeLogger();
    logPermissionForwardingError(logger, "critical failure");
    expect(logger.review).toHaveBeenCalledWith("permission_forwarding.error", {
      message: "critical failure",
    });
  });

  it("includes formatted error when an error is provided", () => {
    const logger = makeLogger();
    logPermissionForwardingError(logger, "io error", new Error("ENOENT"));
    expect(logger.review).toHaveBeenCalledWith("permission_forwarding.error", {
      message: "io error",
      error: "ENOENT",
    });
  });

  it("does not throw when logger is null", () => {
    expect(() => logPermissionForwardingError(null, "ignored")).not.toThrow();
  });
});

describe("tryRemoveDirectoryIfEmpty", () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns true when the directory does not exist", () => {
    root = mkdtempSync(join(tmpdir(), "io-test-"));
    const absent = join(root, "nonexistent");
    expect(tryRemoveDirectoryIfEmpty(null, absent, "test")).toBe(true);
  });

  it("returns true and removes an empty directory", () => {
    root = mkdtempSync(join(tmpdir(), "io-test-"));
    const dir = join(root, "empty");
    mkdirSync(dir);
    expect(tryRemoveDirectoryIfEmpty(null, dir, "test")).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it("returns false and leaves a non-empty directory in place", () => {
    root = mkdtempSync(join(tmpdir(), "io-test-"));
    const dir = join(root, "nonempty");
    mkdirSync(dir);
    writeFileSync(join(dir, "file.json"), "{}", "utf-8");
    expect(tryRemoveDirectoryIfEmpty(null, dir, "test")).toBe(false);
    expect(existsSync(dir)).toBe(true);
  });
});

describe("cleanupPermissionForwardingLocationIfEmpty", () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("preserves responses/ when requests/ is non-empty (the concurrent-request race)", () => {
    root = mkdtempSync(join(tmpdir(), "io-cleanup-"));
    const forwardingDir = join(root, "forwarding");
    const location = createPermissionForwardingLocation(forwardingDir, "parent-session");
    mkdirSync(location.requestsDir, { recursive: true });
    mkdirSync(location.responsesDir, { recursive: true });
    writeFileSync(join(location.requestsDir, "req-b.json"), "{}", "utf-8");

    cleanupPermissionForwardingLocationIfEmpty(null, location);

    expect(existsSync(location.requestsDir)).toBe(true);
    expect(existsSync(location.responsesDir)).toBe(true);
    expect(existsSync(location.sessionRootDir)).toBe(true);
  });

  it("removes both subdirs and sessionRoot when both are empty (normal serial cleanup)", () => {
    root = mkdtempSync(join(tmpdir(), "io-cleanup-"));
    const forwardingDir = join(root, "forwarding");
    const location = createPermissionForwardingLocation(forwardingDir, "parent-session");
    mkdirSync(location.requestsDir, { recursive: true });
    mkdirSync(location.responsesDir, { recursive: true });

    cleanupPermissionForwardingLocationIfEmpty(null, location);

    expect(existsSync(location.requestsDir)).toBe(false);
    expect(existsSync(location.responsesDir)).toBe(false);
    expect(existsSync(location.sessionRootDir)).toBe(false);
  });

  it("leaves responses/ in place when it is non-empty even if requests/ is empty", () => {
    root = mkdtempSync(join(tmpdir(), "io-cleanup-"));
    const forwardingDir = join(root, "forwarding");
    const location = createPermissionForwardingLocation(forwardingDir, "parent-session");
    mkdirSync(location.requestsDir, { recursive: true });
    mkdirSync(location.responsesDir, { recursive: true });
    writeFileSync(join(location.responsesDir, "resp.json"), "{}", "utf-8");

    cleanupPermissionForwardingLocationIfEmpty(null, location);

    expect(existsSync(location.requestsDir)).toBe(false);
    expect(existsSync(location.responsesDir)).toBe(true);
    expect(existsSync(location.sessionRootDir)).toBe(true);
  });
});
