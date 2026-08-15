import { describe, expect, test } from "vitest";
import type { PermissionCheckResult } from "#src/policy/types";
import {
  type DenialContext,
  EXTENSION_TAG,
  formatDenyReason,
  formatUnavailableReason,
  formatUserDeniedReason,
} from "#src/prompting/denial-messages";

function toolCheck(toolName: string, overrides: Partial<PermissionCheckResult> = {}): PermissionCheckResult {
  return {
    toolName,
    state: "deny",
    source: "tool",
    origin: "builtin",
    ...overrides,
  };
}

function mcpCheck(target: string, overrides: Partial<PermissionCheckResult> = {}): PermissionCheckResult {
  return {
    toolName: "mcp",
    target,
    state: "deny",
    source: "mcp",
    origin: "builtin",
    ...overrides,
  };
}

function toolCtx(check: PermissionCheckResult, agentName?: string): Extract<DenialContext, { kind: "tool" }> {
  return { kind: "tool", check, agentName };
}

describe("EXTENSION_TAG", () => {
  test("is [permission]", () => {
    expect(EXTENSION_TAG).toBe("[permission]");
  });
});

describe("formatDenyReason", () => {
  describe("tool context", () => {
    test("generic tool without agent", () => {
      expect(formatDenyReason(toolCtx(toolCheck("write")))).toBe("[permission] is not permitted to run 'write'.");
    });

    test("generic tool with agent", () => {
      expect(formatDenyReason(toolCtx(toolCheck("write"), "my-agent"))).toBe(
        "[permission] Agent 'my-agent' is not permitted to run 'write'.",
      );
    });

    test("MCP target", () => {
      expect(formatDenyReason(toolCtx(mcpCheck("server:do-thing")))).toBe(
        "[permission] is not permitted to run MCP target 'server:do-thing'.",
      );
    });

    test("bash with command", () => {
      expect(formatDenyReason(toolCtx(toolCheck("bash", { command: "rm -rf /" })))).toBe(
        "[permission] is not permitted to run 'bash' command 'rm -rf /'.",
      );
    });

    test("bash with command and matched pattern", () => {
      expect(
        formatDenyReason(
          toolCtx(
            toolCheck("bash", {
              command: "rm -rf /",
              matchedPattern: "rm *",
            }),
          ),
        ),
      ).toBe("[permission] is not permitted to run 'bash' command 'rm -rf /' (matched 'rm *').");
    });

    test("bash with nested execution context", () => {
      expect(
        formatDenyReason(
          toolCtx(
            toolCheck("bash", {
              command: "rm -rf foo",
              matchedPattern: "rm *",
              commandContext: "command_substitution",
            }),
          ),
        ),
      ).toBe(
        "[permission] is not permitted to run 'bash' command 'rm -rf foo' (matched 'rm *', inside command substitution).",
      );
    });

    test("does not duplicate punctuation in a custom reason", () => {
      expect(
        formatDenyReason(
          toolCtx(
            toolCheck("bash", {
              command: "npm install",
              matchedPattern: "npm *",
              reason: "Use pnpm instead.",
            }),
          ),
        ),
      ).toBe(
        "[permission] is not permitted to run 'bash' command 'npm install' (matched 'npm *'). Reason: Use pnpm instead.",
      );
    });

    test("custom reason with no matched pattern", () => {
      expect(
        formatDenyReason(
          toolCtx(
            toolCheck("write", {
              reason: "Write access is disabled for security",
            }),
          ),
        ),
      ).toBe("[permission] is not permitted to run 'write'. Reason: Write access is disabled for security.");
    });

    test("custom reason is included alongside the agent name", () => {
      expect(
        formatDenyReason(
          toolCtx(
            toolCheck("bash", {
              command: "yarn build",
              matchedPattern: "yarn *",
              reason: "Use pnpm instead",
            }),
            "dev-agent",
          ),
        ),
      ).toBe(
        "[permission] Agent 'dev-agent' is not permitted to run 'bash' command 'yarn build' (matched 'yarn *'). Reason: Use pnpm instead.",
      );
    });

    test("custom reason on an MCP target", () => {
      expect(
        formatDenyReason(
          toolCtx(
            mcpCheck("server:deploy", {
              reason: "Deploy requires approval from a senior engineer",
            }),
          ),
        ),
      ).toBe(
        "[permission] is not permitted to run MCP target 'server:deploy'. Reason: Deploy requires approval from a senior engineer.",
      );
    });

    test("MCP source with target on non-mcp toolName", () => {
      expect(formatDenyReason(toolCtx(toolCheck("anything", { source: "mcp", target: "server:tool" })))).toBe(
        "[permission] is not permitted to run MCP target 'server:tool'.",
      );
    });
  });

  describe("path context", () => {
    test("without agent", () => {
      expect(
        formatDenyReason({
          kind: "path",
          toolName: "read",
          pathValue: "/etc/passwd",
        }),
      ).toBe("[permission] Current agent is not permitted to access path '/etc/passwd' via tool 'read'.");
    });

    test("with agent", () => {
      expect(
        formatDenyReason({
          kind: "path",
          toolName: "read",
          pathValue: "/etc/passwd",
          agentName: "sec-agent",
        }),
      ).toBe("[permission] Agent 'sec-agent' is not permitted to access path '/etc/passwd' via tool 'read'.");
    });
  });

  describe("bash_path context", () => {
    test("without agent", () => {
      expect(
        formatDenyReason({
          kind: "bash_path",
          command: "cat /etc/passwd",
          pathValue: "/etc/passwd",
        }),
      ).toBe("[permission] Current agent is not permitted to access path '/etc/passwd' via tool 'bash'.");
    });

    test("with agent", () => {
      expect(
        formatDenyReason({
          kind: "bash_path",
          command: "cat /etc/passwd",
          pathValue: "/etc/passwd",
          agentName: "my-agent",
        }),
      ).toBe("[permission] Agent 'my-agent' is not permitted to access path '/etc/passwd' via tool 'bash'.");
    });
  });

  describe("skill_read context", () => {
    test("without agent", () => {
      expect(
        formatDenyReason({
          kind: "skill_read",
          skillName: "librarian",
          readPath: "/skills/librarian/SKILL.md",
        }),
      ).toBe(
        "[permission] Current agent is not permitted to access skill 'librarian' via '/skills/librarian/SKILL.md'.",
      );
    });

    test("with agent", () => {
      expect(
        formatDenyReason({
          kind: "skill_read",
          skillName: "librarian",
          readPath: "/skills/librarian/SKILL.md",
          agentName: "my-agent",
        }),
      ).toBe(
        "[permission] Agent 'my-agent' is not permitted to access skill 'librarian' via '/skills/librarian/SKILL.md'.",
      );
    });
  });

  describe("skill_input context", () => {
    test("without agent", () => {
      expect(
        formatDenyReason({
          kind: "skill_input",
          skillName: "librarian",
        }),
      ).toBe("[permission] Current agent is not permitted to access skill 'librarian'.");
    });

    test("with agent", () => {
      expect(
        formatDenyReason({
          kind: "skill_input",
          skillName: "librarian",
          agentName: "my-agent",
        }),
      ).toBe("[permission] Agent 'my-agent' is not permitted to access skill 'librarian'.");
    });
  });
});

describe("formatUnavailableReason", () => {
  test("generic tool", () => {
    expect(formatUnavailableReason(toolCtx(toolCheck("write")))).toBe(
      "[permission] Using tool 'write' requires approval, but no interactive UI is available.",
    );
  });

  test("bash with command", () => {
    expect(formatUnavailableReason(toolCtx(toolCheck("bash", { command: "git push" })))).toBe(
      "[permission] Running bash command 'git push' requires approval, but no interactive UI is available.",
    );
  });

  test("mcp", () => {
    expect(formatUnavailableReason(toolCtx(mcpCheck("server:tool")))).toBe(
      "[permission] Using tool 'mcp' requires approval, but no interactive UI is available.",
    );
  });

  test("path", () => {
    expect(
      formatUnavailableReason({
        kind: "path",
        toolName: "read",
        pathValue: "/etc/passwd",
      }),
    ).toBe("[permission] Accessing '/etc/passwd' requires approval, but no interactive UI is available.");
  });

  test("bash_path", () => {
    expect(
      formatUnavailableReason({
        kind: "bash_path",
        command: "cat /etc/passwd",
        pathValue: "/etc/passwd",
      }),
    ).toBe(
      "[permission] Bash command 'cat /etc/passwd' accesses path '/etc/passwd' which requires approval, but no interactive UI is available.",
    );
  });

  test("skill_read", () => {
    expect(
      formatUnavailableReason({
        kind: "skill_read",
        skillName: "librarian",
        readPath: "/skills/librarian/SKILL.md",
      }),
    ).toBe("[permission] Accessing skill 'librarian' requires approval, but no interactive UI is available.");
  });

  test("skill_input", () => {
    expect(
      formatUnavailableReason({
        kind: "skill_input",
        skillName: "librarian",
      }),
    ).toBe("[permission] Accessing skill 'librarian' requires approval, but no interactive UI is available.");
  });
});

describe("formatUserDeniedReason", () => {
  describe("tool context", () => {
    test("generic tool without reason", () => {
      expect(formatUserDeniedReason(toolCtx(toolCheck("write")))).toBe("User denied tool 'write'.");
    });

    test("generic tool with reason", () => {
      expect(formatUserDeniedReason(toolCtx(toolCheck("write")), "too risky")).toBe(
        "User denied tool 'write'. Reason: too risky.",
      );
    });

    test("bash with command", () => {
      expect(formatUserDeniedReason(toolCtx(toolCheck("bash", { command: "ls -la" })))).toBe(
        "User denied bash command 'ls -la'.",
      );
    });

    test("MCP target", () => {
      expect(formatUserDeniedReason(toolCtx(mcpCheck("server:query")))).toBe("User denied MCP target 'server:query'.");
    });
  });

  describe("path context", () => {
    test("without reason", () => {
      expect(
        formatUserDeniedReason({
          kind: "path",
          toolName: "read",
          pathValue: "/etc/passwd",
        }),
      ).toBe("User denied access to path '/etc/passwd'.");
    });

    test("with reason", () => {
      expect(formatUserDeniedReason({ kind: "path", toolName: "read", pathValue: "/etc/passwd" }, "sensitive")).toBe(
        "User denied access to path '/etc/passwd'. Reason: sensitive.",
      );
    });
  });

  describe("bash_path context", () => {
    test("without reason", () => {
      expect(
        formatUserDeniedReason({
          kind: "bash_path",
          command: "cat /etc/passwd",
          pathValue: "/etc/passwd",
        }),
      ).toBe("Path denied: '/etc/passwd'.");
    });

    test("with reason", () => {
      expect(
        formatUserDeniedReason(
          {
            kind: "bash_path",
            command: "cat /etc/passwd",
            pathValue: "/etc/passwd",
          },
          "sensitive",
        ),
      ).toBe("Path denied: '/etc/passwd'. Reason: sensitive.");
    });
  });

  describe("skill_read context", () => {
    test("without reason", () => {
      expect(
        formatUserDeniedReason({
          kind: "skill_read",
          skillName: "librarian",
          readPath: "/skills/librarian/SKILL.md",
        }),
      ).toBe("User denied access to skill 'librarian'.");
    });

    test("with reason", () => {
      expect(
        formatUserDeniedReason(
          {
            kind: "skill_read",
            skillName: "librarian",
            readPath: "/skills/librarian/SKILL.md",
          },
          "not needed",
        ),
      ).toBe("User denied access to skill 'librarian'. Reason: not needed.");
    });
  });

  describe("skill_input context", () => {
    test("without agent and without reason", () => {
      expect(
        formatUserDeniedReason({
          kind: "skill_input",
          skillName: "librarian",
        }),
      ).toBe("User denied access to skill 'librarian'.");
    });

    test("with agent and with reason", () => {
      expect(
        formatUserDeniedReason(
          {
            kind: "skill_input",
            skillName: "librarian",
            agentName: "code-agent",
          },
          "not permitted",
        ),
      ).toBe("User denied access to skill 'librarian'. Reason: not permitted.");
    });
  });
});
