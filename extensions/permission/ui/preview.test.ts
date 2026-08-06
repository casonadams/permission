import { describe, expect, test } from "vitest";
import { looksLikeWebhook, previewToolCall, toolTitle } from "#src/ui/preview";

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
