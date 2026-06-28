import { describe, expect, it } from "vitest";
import type { PromptPermissionDetails } from "#src/permission-prompter";
import { buildApprovalOptions, buildSessionOption } from "#src/ui/prompt-options";

function makeDetails(overrides: Partial<PromptPermissionDetails> = {}): PromptPermissionDetails {
  return {
    requestId: "req-1",
    source: "tool_call",
    agentName: null,
    message: "Allow external path?",
    toolName: "mcp",
    path: "/outside/project/file.ts",
    ...overrides,
  };
}

describe("prompt option construction", () => {
  it("shows descriptor-provided session approval even when tool suggestion is catch-all", () => {
    const details = makeDetails({
      sessionLabel: 'Yes, allow access to external directory "/outside/project/*" for this session',
      sessionPattern: "/outside/project/*",
    });

    const suggestion = buildSessionOption(details, "mcp");
    const options = buildApprovalOptions(suggestion);

    expect(suggestion.pattern).toBe("/outside/project/*");
    expect(options).toContainEqual({ label: details.sessionLabel, value: "allow_session" });
  });

  it("hides session approval when no non-catch-all pattern is available", () => {
    const suggestion = buildSessionOption(makeDetails({ path: undefined }), "mcp");
    const options = buildApprovalOptions(suggestion);

    expect(suggestion.pattern).toBe("*");
    expect(options.map((option) => option.value)).toEqual(["allow", "deny"]);
  });
});
