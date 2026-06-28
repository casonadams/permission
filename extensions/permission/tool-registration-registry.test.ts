import { describe, expect, test } from "vitest";

import { ToolRegistrationRegistry } from "#src/tool-registration-registry";

describe("ToolRegistrationRegistry", () => {
  test("stores a registration so get() returns it", () => {
    const registry = new ToolRegistrationRegistry<string>((key) => `duplicate ${key}`);
    registry.register("my-tool", "first");
    expect(registry.get("my-tool")).toBe("first");
  });

  test("returns a disposer that removes the registration", () => {
    const registry = new ToolRegistrationRegistry<string>((key) => `duplicate ${key}`);
    const dispose = registry.register("my-tool", "first");
    dispose();
    expect(registry.get("my-tool")).toBeUndefined();
  });

  test("throws when a key is already registered", () => {
    const registry = new ToolRegistrationRegistry<string>((key) => `duplicate ${key}`);
    registry.register("my-tool", "first");
    expect(() => registry.register("my-tool", "second")).toThrow("duplicate my-tool");
  });

  test("allows registering different keys independently", () => {
    const registry = new ToolRegistrationRegistry<string>((key) => `duplicate ${key}`);
    registry.register("tool-a", "a");
    registry.register("tool-b", "b");
    expect(registry.get("tool-a")).toBe("a");
    expect(registry.get("tool-b")).toBe("b");
  });

  test("stale disposer does not evict a later registration", () => {
    const registry = new ToolRegistrationRegistry<string>((key) => `duplicate ${key}`);
    const disposeFirst = registry.register("my-tool", "first");
    disposeFirst();

    registry.register("my-tool", "second");
    disposeFirst();

    expect(registry.get("my-tool")).toBe("second");
  });
});
