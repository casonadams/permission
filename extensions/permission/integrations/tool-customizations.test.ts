import { describe, expect, test } from "vitest";
import { type ToolAccessExtractor, ToolCustomizations, type ToolInputFormatter } from "./tool-customizations";

const formatter: ToolInputFormatter = () => "preview";
const extractor: ToolAccessExtractor = () => "/tmp/x";

describe("ToolCustomizations", () => {
  test("stores formatters and extractors independently", () => {
    const customizations = new ToolCustomizations();
    customizations.formatters.register("my-tool", formatter);
    customizations.extractors.register("my-tool", extractor);

    expect(customizations.formatters.get("my-tool")).toBe(formatter);
    expect(customizations.extractors.get("my-tool")).toBe(extractor);
  });

  test("returns a disposer that removes its registration", () => {
    const registry = new ToolCustomizations().formatters;
    const dispose = registry.register("my-tool", formatter);
    dispose();
    expect(registry.get("my-tool")).toBeUndefined();
  });

  test("does not let a stale disposer remove a later registration", () => {
    const registry = new ToolCustomizations().formatters;
    const disposeFirst = registry.register("my-tool", formatter);
    disposeFirst();

    const replacement: ToolInputFormatter = () => "replacement";
    registry.register("my-tool", replacement);
    disposeFirst();

    expect(registry.get("my-tool")).toBe(replacement);
  });

  test("reports duplicate formatter registrations", () => {
    const registry = new ToolCustomizations().formatters;
    registry.register("my-tool", formatter);
    expect(() => registry.register("my-tool", formatter)).toThrow(
      "A tool input formatter is already registered for 'my-tool'.",
    );
  });

  test("reports duplicate extractor registrations", () => {
    const registry = new ToolCustomizations().extractors;
    registry.register("my-tool", extractor);
    expect(() => registry.register("my-tool", extractor)).toThrow(
      "A tool access extractor is already registered for 'my-tool'.",
    );
  });

  test("registered customizations remain callable", () => {
    const customizations = new ToolCustomizations();
    customizations.formatters.register("run", (input) =>
      typeof input.cmd === "string" ? `runs ${input.cmd}` : undefined,
    );
    customizations.extractors.register("find", (input) =>
      typeof input.target === "string" ? input.target : undefined,
    );

    expect(customizations.formatters.get("run")?.({ cmd: "ls" })).toBe("runs ls");
    expect(customizations.extractors.get("find")?.({ target: "/etc/hosts" })).toBe("/etc/hosts");
  });
});
