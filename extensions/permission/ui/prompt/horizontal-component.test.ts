import { describe, expect, test, vi } from "vitest";
import { createHorizontalPickerComponent } from "#src/ui/prompt/horizontal-component";
import type { ThemeLike } from "#src/ui/prompt/horizontal-render";

const theme: ThemeLike = {
  fg: (_color, text) => text,
  bg: (_color, text) => text,
  bold: (text) => text,
};

describe("createHorizontalPickerComponent", () => {
  test("scrolls a long command body with the up and down arrows", () => {
    const tui = { requestRender: vi.fn() };
    const body = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
    const component = createHorizontalPickerComponent({
      tui,
      theme,
      title: "Bash",
      step: { body, options: [{ label: "Allow", value: "allow" }] },
      cancelValue: "deny",
      done: vi.fn(),
    });

    expect(component.render(60).join("\n")).toContain("lines 1-8 of 12");
    component.handleInput("\u001b[B");
    const scrolled = component.render(60).join("\n");

    expect(scrolled).toContain("line 2");
    expect(scrolled).not.toContain("line 1 ");
    expect(scrolled).toContain("lines 2-9 of 12");

    component.handleInput("k");
    expect(component.render(60).join("\n")).toContain("lines 1-8 of 12");
    component.handleInput("j");
    expect(component.render(60).join("\n")).toContain("lines 2-9 of 12");
    component.handleInput("\u001b[A");
    expect(component.render(60).join("\n")).toContain("lines 1-8 of 12");
    expect(tui.requestRender).toHaveBeenCalledTimes(4);
  });

  test("moves the approval selection with h and l", () => {
    const component = createHorizontalPickerComponent({
      tui: { requestRender: vi.fn() },
      theme,
      title: "Bash",
      step: {
        body: "git status",
        options: [
          { label: "Allow", value: "allow" },
          { label: "Deny", value: "deny" },
        ],
      },
      cancelValue: "deny",
      done: vi.fn(),
    });

    component.handleInput("l");
    expect(component.render(60).join("\n")).toContain("[Allow]   Deny ");
    component.handleInput("h");
    expect(component.render(60).join("\n")).toContain(" Allow   [Deny]");
  });
});
