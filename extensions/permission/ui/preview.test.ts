import { describe, expect, test } from "vitest";
import { looksLikeWebhook, previewToolCall, promptBody, toolTitle } from "#src/ui/preview";

describe("toolTitle", () => {
  test("names the resolved MCP target instead of the generic tool name", () => {
    expect(toolTitle("mcp", { toolName: "mcp", target: "playwright_browser_navigate" })).toBe(
      "MCP: playwright_browser_navigate",
    );
  });

  test("composes server and tool when only the raw input shape is available", () => {
    expect(toolTitle("mcp", { server: "playwright", tool: "browser_navigate" })).toBe(
      "MCP: playwright:browser_navigate",
    );
  });

  test("falls back to the plain tool name when no MCP target is known", () => {
    expect(toolTitle("mcp", {})).toBe("Tool: mcp");
  });

  test("names the bash sub-command that triggered the gate", () => {
    expect(toolTitle("bash", { command: "git push --force" })).toBe("Bash: git push");
  });

  test("names a bare bash command", () => {
    expect(toolTitle("bash", { command: "date -u +%Y" })).toBe("Bash: date");
  });

  test("names the skill being loaded", () => {
    expect(toolTitle("skill", { skillName: "plan" })).toBe("Skill: plan");
  });

  test("labels tools with no named subject by name", () => {
    expect(toolTitle("websearch", { query: "pi" })).toBe("Tool: websearch");
  });

  test("falls back to the tool name when bash has no command", () => {
    expect(toolTitle("bash", {})).toBe("Tool: bash");
  });

  test("names the skill when a skill gate carries no tool name", () => {
    expect(toolTitle("tool", { skillName: "librarian" })).toBe("Skill: librarian");
  });

  test("names the skill when a skill file is read through the read tool", () => {
    expect(toolTitle("read", { skillName: "librarian", path: "/skills/librarian/SKILL.md" })).toBe("Skill: librarian");
  });

  test("titles an external-directory gate by the boundary, not the tool", () => {
    expect(toolTitle("read", { promptSurface: "external_directory", path: "/other/notes.md" })).toBe(
      "Outside cwd: /other/notes.md",
    );
  });

  test("the boundary outranks the bash sub-command", () => {
    expect(
      toolTitle("bash", { promptSurface: "external_directory", path: "/etc/hosts", command: "cat /etc/hosts" }),
    ).toBe("Outside cwd: /etc/hosts");
  });

  test("flags a webhook-shaped MCP target", () => {
    expect(toolTitle("mcp", { target: "gateway_send_webhook" })).toBe("Webhook: gateway_send_webhook");
  });

  test("flags a webhook-shaped tool name", () => {
    expect(toolTitle("send_webhook", {})).toBe("Webhook: send_webhook");
  });
});

describe("looksLikeWebhook", () => {
  test("detects a webhook target on the prompt-details shape", () => {
    expect(looksLikeWebhook("mcp", { target: "gateway_send_webhook" })).toBe(true);
  });

  test("ignores unrelated MCP targets", () => {
    expect(looksLikeWebhook("mcp", { target: "playwright_browser_click" })).toBe(false);
  });
});

describe("previewToolCall", () => {
  test("reads the bash command", () => {
    expect(previewToolCall("bash", { command: "ls -la" })).toBe("ls -la");
  });

  test("reads the read path", () => {
    expect(previewToolCall("read", { path: "src/index.ts" })).toBe("src/index.ts");
  });
});

describe("promptBody", () => {
  test("drops the message-only 'with' preposition", () => {
    expect(promptBody("Tool: mcpScript", "with code: 'emit(1)'")).toBe("code: 'emit(1)'");
  });

  test("keeps a body that reads on its own", () => {
    expect(promptBody("Tool: read", "for path 'src/index.ts'")).toBe("for path 'src/index.ts'");
  });

  test("drops a body the title already states", () => {
    expect(promptBody("Bash: pwd", "pwd")).toBe("");
  });

  test("keeps a body that extends the title", () => {
    expect(promptBody("Bash: uname", "uname -sr")).toBe("uname -sr");
  });

  test("passes an empty body through", () => {
    expect(promptBody("MCP: playwright_browser_snapshot", "")).toBe("");
  });
});
