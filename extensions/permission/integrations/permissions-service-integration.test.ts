import { describe, expect, it, vi } from "vitest";
import { LocalPermissionsService } from "#src/integrations/permissions-service";
import { createManager } from "#test/helpers/manager-harness";

function makeService(manager: ReturnType<typeof createManager>["manager"]) {
  return new LocalPermissionsService({
    permissionManager: manager,
    sessionRules: { getRuleset: vi.fn().mockReturnValue([]) },
    formatterRegistry: { register: vi.fn().mockReturnValue(vi.fn()) },
    accessExtractorRegistry: { register: vi.fn().mockReturnValue(vi.fn()) },
  });
}

describe("LocalPermissionsService integration", () => {
  it("evaluates public path checks against the provided path value", () => {
    const harness = createManager({
      permission: {
        "*": "allow",
        path: { "secret.txt": "deny" },
      },
    });

    try {
      const result = makeService(harness.manager).checkPermission("path", "secret.txt");
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("secret.txt");
    } finally {
      harness.cleanup();
    }
  });

  it("evaluates public path-bearing tool checks against the provided path value", () => {
    const harness = createManager({
      permission: {
        "*": "allow",
        read: { "secret.txt": "deny" },
      },
    });

    try {
      const result = makeService(harness.manager).checkPermission("read", "secret.txt");
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("secret.txt");
    } finally {
      harness.cleanup();
    }
  });

  it("evaluates public MCP checks against the provided target value", () => {
    const harness = createManager(
      {
        permission: {
          "*": "allow",
          mcp: { "exa:search": "deny" },
        },
      },
      {},
      { mcpServerNames: ["exa"] },
    );

    try {
      const result = makeService(harness.manager).checkPermission("mcp", "exa:search");
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("exa:search");
    } finally {
      harness.cleanup();
    }
  });
});
