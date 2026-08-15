import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupPermissionForwardingLocationIfEmpty,
  formatUnknownErrorMessage,
  isErrnoCode,
  notifyPermissionForwardingError,
  notifyPermissionForwardingWarning,
  tryRemoveDirectoryIfEmpty,
} from "#src/forwarding/io";
import { createPermissionForwardingLocation } from "#src/forwarding/permission-forwarding";
import type { PermissionNotifier } from "#src/integrations/notifier";

function makeNotifier(): PermissionNotifier {
  return { warn: vi.fn() };
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

describe("forwarding notifications", () => {
  it("warns with the message", () => {
    const notifier = makeNotifier();
    notifyPermissionForwardingWarning(notifier, "something went wrong");
    expect(notifier.warn).toHaveBeenCalledWith("something went wrong");
  });

  it("includes formatted errors", () => {
    const notifier = makeNotifier();
    notifyPermissionForwardingError(notifier, "io error", new Error("ENOENT"));
    expect(notifier.warn).toHaveBeenCalledWith("io error: ENOENT");
  });

  it("does not throw without a notifier", () => {
    expect(() => notifyPermissionForwardingWarning(null, "ignored")).not.toThrow();
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
