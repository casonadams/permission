import { describe, expect, test } from "vitest";

import { type ToolInputFormatter, ToolInputFormatterRegistry } from "#src/tool-input-formatter-registry";

const noopFormatter: ToolInputFormatter = () => "preview";

describe("ToolInputFormatterRegistry", () => {
  test("stores a formatter so get() returns it", () => {
    const registry = new ToolInputFormatterRegistry();
    registry.register("my-tool", noopFormatter);
    expect(registry.get("my-tool")).toBe(noopFormatter);
  });

  test("throws a formatter-specific duplicate message", () => {
    const registry = new ToolInputFormatterRegistry();
    registry.register("my-tool", noopFormatter);
    expect(() => registry.register("my-tool", () => undefined)).toThrow(
      "A tool input formatter is already registered for 'my-tool'.",
    );
  });

  test("the registered formatter is callable and returns its result", () => {
    const registry = new ToolInputFormatterRegistry();
    const fmt: ToolInputFormatter = (input) => (typeof input.cmd === "string" ? `runs ${input.cmd}` : undefined);
    registry.register("run", fmt);
    expect(registry.get("run")?.({ cmd: "ls" })).toBe("runs ls");
    expect(registry.get("run")?.({ other: true })).toBeUndefined();
  });
});
