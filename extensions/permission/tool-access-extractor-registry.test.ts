import { describe, expect, test } from "vitest";

import { type ToolAccessExtractor, ToolAccessExtractorRegistry } from "#src/tool-access-extractor-registry";

const noopExtractor: ToolAccessExtractor = () => "/tmp/x";

describe("ToolAccessExtractorRegistry", () => {
  test("stores an extractor so get() returns it", () => {
    const registry = new ToolAccessExtractorRegistry();
    registry.register("my-tool", noopExtractor);
    expect(registry.get("my-tool")).toBe(noopExtractor);
  });

  test("throws an access-extractor-specific duplicate message", () => {
    const registry = new ToolAccessExtractorRegistry();
    registry.register("my-tool", noopExtractor);
    expect(() => registry.register("my-tool", () => undefined)).toThrow(
      "A tool access extractor is already registered for 'my-tool'.",
    );
  });

  test("the registered extractor is callable and returns its path", () => {
    const registry = new ToolAccessExtractorRegistry();
    const extractor: ToolAccessExtractor = (input) => (typeof input.target === "string" ? input.target : undefined);
    registry.register("ffgrep", extractor);
    expect(registry.get("ffgrep")?.({ target: "/etc/hosts" })).toBe("/etc/hosts");
    expect(registry.get("ffgrep")?.({ other: true })).toBeUndefined();
  });
});
