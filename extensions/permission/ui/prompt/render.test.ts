import { describe, expect, test } from "vitest";
import { renderPromptBody } from "#src/ui/prompt/render";

describe("renderPromptBody", () => {
  test("keeps every line of a long command preview", () => {
    const preview = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n");

    expect(renderPromptBody(preview)).toBe(preview);
  });

  test("normalizes carriage returns", () => {
    expect(renderPromptBody("first\r\nsecond")).toBe("first\nsecond");
  });
});
