import { describe, expect, test } from "vitest";
import { renderComponent, type ThemeLike } from "#src/ui/prompt/horizontal-render";

const theme: ThemeLike = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

function render(title: string, body: string): string[] {
  return renderComponent({
    width: 60,
    theme,
    title,
    body,
    options: [
      { label: "Allow", value: "allow" },
      { label: "Deny", value: "deny" },
    ],
    selected: 0,
  }).map((line) => line.replace(/^[│┌└]|[│┐┘]$/g, "").trimEnd());
}

describe("renderComponent", () => {
  test("spends no vertical space on an absent body", () => {
    expect(render("Write /tmp/notes.txt", "")).toEqual([
      "─".repeat(58),
      "Write /tmp/notes.txt",
      "",
      " Allow   [Deny]",
      "─".repeat(58),
    ]);
  });

  test("separates a present body from the title and the options", () => {
    expect(render("Bash /etc/hosts", "cat /etc/hosts")).toEqual([
      "─".repeat(58),
      "Bash /etc/hosts",
      "",
      "cat /etc/hosts",
      "",
      " Allow   [Deny]",
      "─".repeat(58),
    ]);
  });

  test("treats a whitespace-only body as absent", () => {
    expect(render("Skill: plan", "   ")).toHaveLength(5);
  });
});
