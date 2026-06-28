import { describe, expect, test } from "vitest";

import {
  formatBashExternalDirectoryAskPrompt,
  formatExternalDirectoryAskPrompt,
} from "#src/handlers/gates/external-directory-messages";

// Denial message functions (formatExternalDirectoryDenyReason,
// formatExternalDirectoryUserDeniedReason, formatExternalDirectoryHardStopHint,
// formatBashExternalDirectoryDenyReason) have moved to denial-messages.ts.
// Their behavior is tested in denial-messages.test.ts.

describe("formatExternalDirectoryAskPrompt", () => {
  test("uses 'Current agent' when no agent name provided", () => {
    const result = formatExternalDirectoryAskPrompt({
      toolName: "read",
      pathValue: "/etc/passwd",
      cwd: "/projects/my-app",
    });
    expect(result).toContain("Current agent");
    expect(result).toContain("read");
    expect(result).toContain("/etc/passwd");
    expect(result).toContain("/projects/my-app");
  });

  test("uses agent name when provided", () => {
    const result = formatExternalDirectoryAskPrompt({
      toolName: "write",
      pathValue: "/tmp/out.txt",
      cwd: "/projects/my-app",
      agentName: "my-agent",
    });
    expect(result).toContain("Agent 'my-agent'");
    expect(result).toContain("write");
    expect(result).toContain("/tmp/out.txt");
  });
});

describe("formatBashExternalDirectoryAskPrompt", () => {
  test("includes command, paths, cwd, and agent name", () => {
    const result = formatBashExternalDirectoryAskPrompt({
      command: "cat /etc/passwd",
      externalPaths: ["/etc/passwd"],
      cwd: "/projects/my-app",
      agentName: "my-agent",
    });
    expect(result).toContain("Agent 'my-agent'");
    expect(result).toContain("cat /etc/passwd");
    expect(result).toContain("/etc/passwd");
    expect(result).toContain("/projects/my-app");
  });

  test("uses 'Current agent' when no agent name provided", () => {
    const result = formatBashExternalDirectoryAskPrompt({
      command: "ls /tmp",
      externalPaths: ["/tmp"],
      cwd: "/projects/my-app",
    });
    expect(result).toContain("Current agent");
  });
});
