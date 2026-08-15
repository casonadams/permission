import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { PermissionManager, type ScopedPermissionManager } from "#src/policy/permission-manager";
import type { Ruleset } from "#src/policy/rule";
import type { PermissionCheckResult, ScopeConfig } from "#src/policy/types";
import {
  createManager,
  createManagerWithProject,
  makeInMemoryManager,
  makeManager,
  makeManagerWithConfig,
  makeManagerWithScopes,
  sessionAllow,
} from "#test/helpers/manager-harness";
import { getGlobalConfigPath, getProjectConfigPath } from "../config/config-paths";

describe("checkPermission — session rules", () => {
  it("session rule wins over the universal default (skill)", () => {
    const manager = makeManager();
    const sessionRules: Ruleset = [sessionAllow("skill", "librarian")];
    const result = manager.checkPermission("skill", { name: "librarian" }, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
    expect(result.matchedPattern).toBe("librarian");
  });

  it("session rule wins over the universal default (bash)", () => {
    const manager = makeManager();
    const sessionRules: Ruleset = [sessionAllow("bash", "git status")];
    const result = manager.checkPermission("bash", { command: "git status" }, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
    expect(result.matchedPattern).toBe("git status");
  });

  it("session rule wins over the universal default (tool — read)", () => {
    const manager = makeManager();
    const sessionRules: Ruleset = [sessionAllow("read", "*")];
    const result = manager.checkPermission("read", {}, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
  });

  it("session rule wins over the universal default (mcp)", () => {
    const manager = makeManager();
    const sessionRules: Ruleset = [sessionAllow("mcp", "mcp_status")];
    const result = manager.checkPermission("mcp", {}, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
  });

  it("no session rules — falls through to default (ask)", () => {
    const manager = makeManager();
    const result = manager.checkPermission("read", {}, undefined, []);
    expect(result.state).toBe("ask");
    expect(result.source).not.toBe("session");
  });

  it("session rule with narrower pattern does not block a broader command not in session", () => {
    const manager = makeManager();
    const sessionRules: Ruleset = [sessionAllow("bash", "git status")];
    const result = manager.checkPermission("bash", { command: "git push origin main" }, undefined, sessionRules);
    expect(result.state).toBe("ask");
    expect(result.source).not.toBe("session");
  });

  it("session wildcard pattern matches multiple commands", () => {
    const manager = makeManager();
    const sessionRules: Ruleset = [sessionAllow("bash", "git *")];
    const push = manager.checkPermission("bash", { command: "git push origin main" }, undefined, sessionRules);
    const status = manager.checkPermission("bash", { command: "git status" }, undefined, sessionRules);
    expect(push.state).toBe("allow");
    expect(push.source).toBe("session");
    expect(status.state).toBe("allow");
    expect(status.source).toBe("session");
  });
});

describe("checkPermission — source derivation and matchedPattern", () => {
  describe("skill surface", () => {
    it("source is 'skill' for a config-matched skill name", () => {
      const { manager, cleanup } = makeManagerWithConfig({
        "*": "ask",
        skill: { librarian: "allow" },
      });
      try {
        const result = manager.checkPermission("skill", { name: "librarian" });
        expect(result.state).toBe("allow");
        expect(result.source).toBe("skill");
        expect(result.matchedPattern).toBe("librarian");
      } finally {
        cleanup();
      }
    });

    it("source is 'skill' even for a default match", () => {
      const manager = makeManager();
      const result = manager.checkPermission("skill", { name: "unknown" });
      expect(result.state).toBe("ask");
      expect(result.source).toBe("skill");
    });
  });

  describe("bash surface", () => {
    it("source is 'bash' and command is included in result", () => {
      const { manager, cleanup } = makeManagerWithConfig({
        "*": "ask",
        bash: { "git *": "allow" },
      });
      try {
        const result = manager.checkPermission("bash", {
          command: "git status",
        });
        expect(result.state).toBe("allow");
        expect(result.source).toBe("bash");
        expect(result.command).toBe("git status");
        expect(result.matchedPattern).toBe("git *");
      } finally {
        cleanup();
      }
    });

    it("source is 'bash' even for a default match, command is empty string", () => {
      const manager = makeManager();
      const result = manager.checkPermission("bash", {});
      expect(result.source).toBe("bash");
      expect(result.command).toBe("");
      expect(result.matchedPattern).toBeUndefined();
    });
  });

  describe("mcp surface", () => {
    it("source is 'mcp' for a config-matched target", () => {
      const { manager, cleanup } = makeManagerWithConfig({ "*": "ask", mcp: { exa_search: "allow" } }, ["exa"]);
      try {
        const result = manager.checkPermission("mcp", {
          tool: "exa:search",
          server: "exa",
        });
        expect(result.state).toBe("allow");
        expect(result.source).toBe("mcp");
        expect(result.matchedPattern).toBe("exa_search");
        expect(result.target).toBeDefined();
      } finally {
        cleanup();
      }
    });

    it("source is 'default' when all targets match only the synthesized default", () => {
      const manager = makeManager();
      const result = manager.checkPermission("mcp", { tool: "exa:search" });
      expect(result.state).toBe("ask");
      expect(result.source).toBe("default");
      expect(result.matchedPattern).toBeUndefined();
    });

    it("target field is set for a matched mcp call", () => {
      const { manager, cleanup } = makeManagerWithConfig({ "*": "ask", mcp: { mcp_status: "allow" } }, []);
      try {
        const result = manager.checkPermission("mcp", {});
        expect(result.target).toBeDefined();
        expect(result.source).toBe("mcp");
      } finally {
        cleanup();
      }
    });
  });

  describe("tool surfaces", () => {
    it("built-in tool: source is always 'tool' (config match)", () => {
      const { manager, cleanup } = makeManagerWithConfig({
        "*": "ask",
        read: "allow",
      });
      try {
        const result = manager.checkPermission("read", {});
        expect(result.state).toBe("allow");
        expect(result.source).toBe("tool");
      } finally {
        cleanup();
      }
    });

    it("built-in tool: source is 'tool' even for a default match", () => {
      const manager = makeManager();
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("ask");
      expect(result.source).toBe("tool");
    });

    it("extension tool: source is 'default' when no config rule matches", () => {
      const manager = makeManager();
      const result = manager.checkPermission("my_custom_tool", {});
      expect(result.state).toBe("ask");
      expect(result.source).toBe("default");
    });

    it("extension tool: source is 'tool' when a config rule matches", () => {
      const { manager, cleanup } = makeManagerWithConfig({
        "*": "ask",
        my_custom_tool: "allow",
      });
      try {
        const result = manager.checkPermission("my_custom_tool", {});
        expect(result.state).toBe("allow");
        expect(result.source).toBe("tool");
      } finally {
        cleanup();
      }
    });
  });

  describe("matchedPattern for session rules across surfaces", () => {
    it("matchedPattern is the session rule pattern for a session match (bash)", () => {
      const manager = makeManager();
      const sessionRules: Ruleset = [sessionAllow("bash", "git *")];
      const result = manager.checkPermission("bash", { command: "git status" }, undefined, sessionRules);
      expect(result.matchedPattern).toBe("git *");
      expect(result.source).toBe("session");
    });

    it("matchedPattern is the session rule pattern for a session match (skill)", () => {
      const manager = makeManager();
      const sessionRules: Ruleset = [sessionAllow("skill", "librarian")];
      const result = manager.checkPermission("skill", { name: "librarian" }, undefined, sessionRules);
      expect(result.matchedPattern).toBe("librarian");
    });
  });
});

describe("checkPermission — rule origin provenance", () => {
  it("single-scope global: config rule has origin 'global'", () => {
    const { manager, cleanup } = makeManagerWithScopes({ read: "allow" });
    try {
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("global");
    } finally {
      cleanup();
    }
  });

  it("single-scope global with pattern map: origin is 'global'", () => {
    const { manager, cleanup } = makeManagerWithScopes({
      bash: { "git *": "allow" },
    });
    try {
      const result = manager.checkPermission("bash", { command: "git status" });
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("global");
    } finally {
      cleanup();
    }
  });

  it("project overrides global: winning rule has origin 'project'", () => {
    const { manager, cleanup } = makeManagerWithScopes({ read: "ask" }, { read: "allow" });
    try {
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project");
    } finally {
      cleanup();
    }
  });

  it("both-object merge: patterns retain their own origins", () => {
    const { manager, cleanup } = makeManagerWithScopes({ bash: { "git *": "allow" } }, { bash: { "rm *": "deny" } });
    try {
      const gitResult = manager.checkPermission("bash", {
        command: "git status",
      });
      expect(gitResult.state).toBe("allow");
      expect(gitResult.origin).toBe("global");

      const rmResult = manager.checkPermission("bash", {
        command: "rm -rf /",
      });
      expect(rmResult.state).toBe("deny");
      expect(rmResult.origin).toBe("project");
    } finally {
      cleanup();
    }
  });

  it("both-object merge: project pattern overrides global pattern for same key", () => {
    const { manager, cleanup } = makeManagerWithScopes({ bash: { "git *": "ask" } }, { bash: { "git *": "allow" } });
    try {
      const result = manager.checkPermission("bash", {
        command: "git status",
      });
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project");
    } finally {
      cleanup();
    }
  });

  it("string replaces object: all patterns from replacing scope get origin 'project'", () => {
    const { manager, cleanup } = makeManagerWithScopes({ bash: { "git *": "ask", "npm *": "ask" } }, { bash: "allow" });
    try {
      const result = manager.checkPermission("bash", {
        command: "anything",
      });
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project");
    } finally {
      cleanup();
    }
  });

  it("object replaces string: all patterns from replacing scope get origin 'project'", () => {
    const { manager, cleanup } = makeManagerWithScopes({ read: "ask" }, { read: { "*": "allow" } });
    try {
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project");
    } finally {
      cleanup();
    }
  });

  it("no config match: origin is 'builtin' (default layer)", () => {
    const manager = makeManager();
    const result = manager.checkPermission("read", {});
    expect(result.state).toBe("ask");
    expect(result.origin).toBe("builtin");
  });

  it("session rule: origin is 'session'", () => {
    const manager = makeManager();
    const sessionRules: Ruleset = [
      {
        surface: "read",
        pattern: "*",
        action: "allow",
        layer: "session",
        origin: "session",
      },
    ];
    const result = manager.checkPermission("read", {}, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
    expect(result.origin).toBe("session");
  });

  it("universal fallback (*) set in global config carries origin 'global'", () => {
    const { manager, cleanup } = makeManagerWithScopes({ "*": "allow" });
    try {
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("global");
    } finally {
      cleanup();
    }
  });

  it("universal fallback (*) overridden by project carries origin 'project'", () => {
    const { manager, cleanup } = makeManagerWithScopes({ "*": "ask" }, { "*": "allow" });
    try {
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project");
    } finally {
      cleanup();
    }
  });

  it("built-in fallback (no * in any config): origin is 'builtin'", () => {
    const manager = makeManager();
    const result = manager.checkPermission("read", {});
    expect(result.state).toBe("ask");
    expect(result.origin).toBe("builtin");
  });
});

describe("PermissionManager with in-memory PolicyLoader", () => {
  describe("universal fallback", () => {
    it("defaults to ask when no config is provided", () => {
      const manager = makeInMemoryManager();
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("ask");
      expect(result.origin).toBe("builtin");
    });

    it("respects permission['*'] = 'allow' from global config", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "allow" } },
      });
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("global");
    });

    it("respects permission['*'] = 'deny' from global config", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "deny" } },
      });
      const result = manager.checkPermission("write", {});
      expect(result.state).toBe("deny");
    });
  });

  describe("surface routing", () => {
    it("bash surface routes correctly", () => {
      const manager = makeInMemoryManager({
        global: {
          permission: { "*": "ask", bash: { "git *": "allow" } },
        },
      });
      const result = manager.checkPermission("bash", {
        command: "git status",
      });
      expect(result.state).toBe("allow");
      expect(result.source).toBe("bash");
      expect(result.matchedPattern).toBe("git *");
    });

    it("tool surface routes correctly for built-in tools", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "deny", read: "allow" } },
      });
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.source).toBe("tool");
    });

    it("skill surface routes correctly", () => {
      const manager = makeInMemoryManager({
        global: {
          permission: { "*": "ask", skill: { librarian: "allow" } },
        },
      });
      const result = manager.checkPermission("skill", { name: "librarian" });
      expect(result.state).toBe("allow");
      expect(result.source).toBe("skill");
    });

    it("mcp surface routes correctly", () => {
      const manager = makeInMemoryManager(
        {
          global: {
            permission: { "*": "ask", mcp: { exa_search: "allow" } },
          },
        },
        ["exa"],
      );
      const result = manager.checkPermission("mcp", {
        tool: "exa:search",
        server: "exa",
      });
      expect(result.state).toBe("allow");
      expect(result.source).toBe("mcp");
    });

    it("extension tools use 'default' source when no config rule matches", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "ask" } },
      });
      const result = manager.checkPermission("my_custom_tool", {});
      expect(result.state).toBe("ask");
      expect(result.source).toBe("default");
    });
  });

  describe("multi-scope merge", () => {
    it("project overrides global", () => {
      const manager = makeInMemoryManager({
        global: { permission: { read: "ask" } },
        project: { permission: { read: "allow" } },
      });
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project");
    });

    it("agent overrides project", () => {
      const manager = makeInMemoryManager({
        global: { permission: { read: "ask" } },
        project: { permission: { read: "allow" } },
        agent: { coder: { permission: { read: "deny" } } },
      });
      const result = manager.checkPermission("read", {}, "coder");
      expect(result.state).toBe("deny");
      expect(result.origin).toBe("agent");
    });

    it("project-agent overrides agent", () => {
      const manager = makeInMemoryManager({
        global: { permission: { read: "deny" } },
        agent: { coder: { permission: { read: "deny" } } },
        projectAgent: { coder: { permission: { read: "allow" } } },
      });
      const result = manager.checkPermission("read", {}, "coder");
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project-agent");
    });

    it("deep-shallow merge preserves patterns from different scopes", () => {
      const manager = makeInMemoryManager({
        global: { permission: { bash: { "git *": "allow" } } },
        project: { permission: { bash: { "rm *": "deny" } } },
      });
      const gitResult = manager.checkPermission("bash", {
        command: "git status",
      });
      expect(gitResult.state).toBe("allow");
      expect(gitResult.origin).toBe("global");

      const rmResult = manager.checkPermission("bash", {
        command: "rm -rf /",
      });
      expect(rmResult.state).toBe("deny");
      expect(rmResult.origin).toBe("project");
    });

    it("string replaces object in override scope", () => {
      const manager = makeInMemoryManager({
        global: {
          permission: { bash: { "git *": "ask", "npm *": "ask" } },
        },
        project: { permission: { bash: "allow" } },
      });
      const result = manager.checkPermission("bash", { command: "anything" });
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project");
    });
  });

  describe("session rule composition", () => {
    it("session rule wins over config", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "deny" } },
      });
      const sessionRules: Ruleset = [sessionAllow("read", "*")];
      const result = manager.checkPermission("read", {}, undefined, sessionRules);
      expect(result.state).toBe("allow");
      expect(result.source).toBe("session");
    });

    it("session rule does not bleed across surfaces", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "ask" } },
      });
      const sessionRules: Ruleset = [sessionAllow("bash", "git *")];
      const bashResult = manager.checkPermission("bash", { command: "git status" }, undefined, sessionRules);
      expect(bashResult.state).toBe("allow");

      const readResult = manager.checkPermission("read", {}, undefined, sessionRules);
      expect(readResult.state).toBe("ask");
    });
  });

  describe("origin tracking", () => {
    it("universal fallback from project carries origin 'project'", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "ask" } },
        project: { permission: { "*": "allow" } },
      });
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
      expect(result.origin).toBe("project");
    });

    it("session origin is 'session'", () => {
      const manager = makeInMemoryManager();
      const sessionRules: Ruleset = [sessionAllow("read", "*")];
      const result = manager.checkPermission("read", {}, undefined, sessionRules);
      expect(result.origin).toBe("session");
    });
  });

  describe("getToolPermission", () => {
    it("returns tool-level state for built-in tools", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "deny", read: "allow" } },
      });
      expect(manager.getToolPermission("read")).toBe("allow");
      expect(manager.getToolPermission("write")).toBe("deny");
    });

    it("returns tool-level state for bash surface", () => {
      const manager = makeInMemoryManager({
        global: { permission: { "*": "deny", bash: "allow" } },
      });
      expect(manager.getToolPermission("bash")).toBe("allow");
    });
  });

  describe("getComposedConfigRules", () => {
    it("returns only config-layer rules", () => {
      const manager = makeInMemoryManager({
        global: {
          permission: { "*": "ask", bash: { "git *": "allow" } },
        },
      });
      const rules = manager.getComposedConfigRules();
      expect(rules.every((r) => r.layer === "config")).toBe(true);
      expect(rules.some((r) => r.surface === "bash" && r.pattern === "git *")).toBe(true);
    });
  });
});

describe("checkPermission — per-tool path patterns", () => {
  it("denies read of .env when path pattern matches", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: { "*": "allow", "*.env": "deny" },
    });
    try {
      const result = manager.checkPermission("read", { path: ".env" });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("*.env");
    } finally {
      cleanup();
    }
  });

  it("allows read of non-.env file when .env is denied", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: { "*": "allow", "*.env": "deny" },
    });
    try {
      const result = manager.checkPermission("read", {
        path: "src/main.ts",
      });
      expect(result.state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("allows write to src/ when only src/ is allowed", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      write: { "*": "deny", "src/*": "allow" },
    });
    try {
      const result = manager.checkPermission("write", {
        path: "src/main.ts",
      });
      expect(result.state).toBe("allow");
      expect(result.matchedPattern).toBe("src/*");
    } finally {
      cleanup();
    }
  });

  it("denies write outside src/ when only src/ is allowed", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      write: { "*": "deny", "src/*": "allow" },
    });
    try {
      const result = manager.checkPermission("write", {
        path: "vendor/lib.ts",
      });
      expect(result.state).toBe("deny");
    } finally {
      cleanup();
    }
  });

  it("backward compat: 'read': 'allow' allows read of any path", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: "allow",
    });
    try {
      const result = manager.checkPermission("read", { path: ".env" });
      expect(result.state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("backward compat: 'read': 'deny' denies read of any path", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: "deny",
    });
    try {
      const result = manager.checkPermission("read", {
        path: "src/main.ts",
      });
      expect(result.state).toBe("deny");
    } finally {
      cleanup();
    }
  });

  it("session rule for specific path overrides config deny", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: { "*": "allow", "*.env": "deny" },
    });
    try {
      const sessionRules: Ruleset = [sessionAllow("read", ".env")];
      const result = manager.checkPermission("read", { path: ".env" }, undefined, sessionRules);
      expect(result.state).toBe("allow");
      expect(result.source).toBe("session");
    } finally {
      cleanup();
    }
  });

  it("falls back to '*' when input.path is missing", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: { "*": "allow", "*.env": "deny" },
    });
    try {
      const result = manager.checkPermission("read", {});
      expect(result.state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("getToolPermission still returns surface-level state (not path-specific)", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: { "*": "allow", "*.env": "deny" },
    });
    try {
      const toolState = manager.getToolPermission("read");
      expect(toolState).toBe("allow");
    } finally {
      cleanup();
    }
  });
});

describe("cross-cutting path surface", () => {
  it("denies .env via the path surface", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "*.env": "deny" },
      read: "allow",
    });
    try {
      const result = manager.checkPermission("path", { path: ".env" });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("*.env");
    } finally {
      cleanup();
    }
  });

  it("allows non-matching paths via the path surface", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "*.env": "deny" },
      read: "allow",
    });
    try {
      const result = manager.checkPermission("path", { path: "README.md" });
      expect(result.state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("path surface does not interfere with per-tool rules", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow" },
      read: { "*": "allow", "*.secret": "deny" },
    });
    try {
      const readResult = manager.checkPermission("read", {
        path: "data.secret",
      });
      expect(readResult.state).toBe("deny");
      const pathResult = manager.checkPermission("path", {
        path: "data.secret",
      });
      expect(pathResult.state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("getToolPermission('path') returns catch-all action", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "*.env": "deny" },
    });
    try {
      const toolState = manager.getToolPermission("path");
      expect(toolState).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("session approval on path surface overrides config deny", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "*.env": "deny" },
    });
    try {
      const sessionRules: Ruleset = [sessionAllow("path", "/project/.env")];
      const result = manager.checkPermission("path", { path: "/project/.env" }, undefined, sessionRules);
      expect(result.state).toBe("allow");
      expect(result.source).toBe("session");
    } finally {
      cleanup();
    }
  });

  it("configs without path key behave identically (no path gate fires)", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: "allow",
    });
    try {
      const result = manager.checkPermission("path", { path: ".env" });
      expect(result.state).toBe("ask");
    } finally {
      cleanup();
    }
  });

  it("universal default produces undefined matchedPattern for gate skip (#58)", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      "*": "ask",
      read: "allow",
      find: "allow",
    });
    try {
      const result = manager.checkPermission("path", {
        path: "src/main.ts",
      });
      expect(result.state).toBe("ask");
      expect(result.matchedPattern).toBeUndefined();

      const readResult = manager.checkPermission("read", {
        path: "src/main.ts",
      });
      expect(readResult.state).toBe("allow");
      expect(readResult.matchedPattern).toBe("*");
    } finally {
      cleanup();
    }
  });

  it("deny-with-reason: reason threads through to PermissionCheckResult", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      bash: { "npm *": { action: "deny", reason: "Use pnpm instead" } },
    });
    try {
      const result = manager.checkPermission("bash", {
        command: "npm install",
      });
      expect(result.state).toBe("deny");
      expect(result.reason).toBe("Use pnpm instead");
      expect(result.matchedPattern).toBe("npm *");
    } finally {
      cleanup();
    }
  });

  it("deny-without-reason: reason is undefined in PermissionCheckResult", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      bash: { "rm -rf *": "deny" },
    });
    try {
      const result = manager.checkPermission("bash", { command: "rm -rf /" });
      expect(result.state).toBe("deny");
      expect(result.reason).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("deny-with-reason on a non-bash surface", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: {
        "*.env": {
          action: "deny",
          reason: "Environment files contain secrets",
        },
      },
    });
    try {
      const result = manager.checkPermission("read", { path: ".env" });
      expect(result.state).toBe("deny");
      expect(result.reason).toBe("Environment files contain secrets");
      expect(result.matchedPattern).toBe("*.env");
    } finally {
      cleanup();
    }
  });

  it("non-string reason falls through to the default (malformed config)", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      bash: { "npm *": { action: "deny", reason: 42 } },
    });
    try {
      const result = manager.checkPermission("bash", {
        command: "npm install",
      });
      expect(result.state).toBe("ask");
      expect(result.reason).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("last-match-wins: catch-all after deny overrides the deny", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*.env": "deny", "*": "allow" },
    });
    try {
      const result = manager.checkPermission("path", { path: ".env" });
      expect(result.state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("last-match-wins: deny after catch-all blocks the path", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "*.env": "deny" },
    });
    try {
      const result = manager.checkPermission("path", { path: ".env" });
      expect(result.state).toBe("deny");
    } finally {
      cleanup();
    }
  });

  it(".env.example override: denies .env and .env.local, allows .env.example", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: {
        "*": "allow",
        "*.env": "deny",
        "*.env.*": "deny",
        "*.env.example": "allow",
      },
    });
    try {
      expect(manager.checkPermission("path", { path: ".env" }).state).toBe("deny");
      expect(manager.checkPermission("path", { path: ".env.local" }).state).toBe("deny");
      expect(manager.checkPermission("path", { path: ".env.production" }).state).toBe("deny");
      expect(manager.checkPermission("path", { path: "src/.env" }).state).toBe("deny");
      expect(manager.checkPermission("path", { path: ".env.example" }).state).toBe("allow");
      expect(manager.checkPermission("path", { path: "README.md" }).state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("universal '*': 'allow' with no path key makes the path gate transparent", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      "*": "allow",
    });
    try {
      const result = manager.checkPermission("path", { path: ".env" });
      expect(result.state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("universal '*': 'deny' with no path key denies via path surface too", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      "*": "deny",
    });
    try {
      const result = manager.checkPermission("path", { path: ".env" });
      expect(result.state).toBe("deny");
    } finally {
      cleanup();
    }
  });

  it("per-tool deny still blocks even when path surface allows", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow" },
      read: "deny",
    });
    try {
      const pathResult = manager.checkPermission("path", {
        path: "secret.txt",
      });
      expect(pathResult.state).toBe("allow");
      const readResult = manager.checkPermission("read", {
        path: "secret.txt",
      });
      expect(readResult.state).toBe("deny");
    } finally {
      cleanup();
    }
  });
});

describe("cross-cutting path surface — home-expanded values", () => {
  it("~/... path value is denied by a ~/* rule (reported footgun)", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "~/.ssh/*": "deny" },
    });
    try {
      const result = manager.checkPermission("path", {
        path: "~/.ssh/config",
      });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("~/.ssh/*");
    } finally {
      cleanup();
    }
  });

  it("$HOME/... path value is denied by a ~/* rule", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "~/.ssh/*": "deny" },
    });
    try {
      const result = manager.checkPermission("path", {
        path: `${homedir()}/.ssh/config`,
      });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("~/.ssh/*");
    } finally {
      cleanup();
    }
  });

  it("$HOME/... path value matches a $HOME/* pattern rule", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "$HOME/.ssh/*": "deny" },
    });
    try {
      const result = manager.checkPermission("path", {
        path: "$HOME/.ssh/config",
      });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("$HOME/.ssh/*");
    } finally {
      cleanup();
    }
  });

  it("already-absolute home path is still denied by ~/* rule", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "~/.ssh/*": "deny" },
    });
    try {
      const result = manager.checkPermission("path", {
        path: `${homedir()}/.ssh/config`,
      });
      expect(result.state).toBe("deny");
    } finally {
      cleanup();
    }
  });

  it("non-home value is unchanged — .env still matches *.env", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "allow", "*.env": "deny" },
    });
    try {
      const result = manager.checkPermission("path", { path: ".env" });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("*.env");
    } finally {
      cleanup();
    }
  });

  it("per-tool read surface denies ~/... path with a ~/* rule", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      "*": "allow",
      read: { "*": "allow", "~/.ssh/*": "deny" },
    });
    try {
      const result = manager.checkPermission("read", {
        path: "~/.ssh/config",
      });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("~/.ssh/*");
    } finally {
      cleanup();
    }
  });
});

describe("PermissionManager — configureForCwd and agentDir option", () => {
  function makeAgentDirSetup(opts: {
    globalPermission: Record<string, unknown>;
    projectPermission?: Record<string, unknown>;
  }): {
    agentDir: string;
    cwd: string;
    globalConfigPath: string;
    projectConfigPath: string;
    cleanup: () => void;
  } {
    const baseDir = mkdtempSync(join(tmpdir(), "pm-agent-dir-test-"));
    const agentDir = join(baseDir, "agent");
    const cwd = join(baseDir, "project");

    const globalConfigPath = getGlobalConfigPath(agentDir);
    mkdirSync(dirname(globalConfigPath), { recursive: true });
    writeFileSync(globalConfigPath, JSON.stringify({ permission: opts.globalPermission }, null, 2));

    const projectConfigPath = getProjectConfigPath(cwd);
    mkdirSync(dirname(projectConfigPath), { recursive: true });
    if (opts.projectPermission) {
      writeFileSync(projectConfigPath, JSON.stringify({ permission: opts.projectPermission }, null, 2));
    }

    return {
      agentDir,
      cwd,
      globalConfigPath,
      projectConfigPath,
      cleanup: () => rmSync(baseDir, { recursive: true, force: true }),
    };
  }

  it("ScopedPermissionManager is exported and PermissionManager satisfies it", () => {
    const manager = new PermissionManager({
      globalConfigPath: "/nonexistent/config.json",
      agentsDir: "/nonexistent/agents",
    });
    const scoped: ScopedPermissionManager = manager;
    expect(typeof scoped.configureForCwd).toBe("function");
    expect(typeof scoped.checkPermission).toBe("function");
    expect(typeof scoped.getToolPermission).toBe("function");
    expect(typeof scoped.getConfigIssues).toBe("function");
    expect(typeof scoped.getPolicyCacheStamp).toBe("function");
  });

  it("construction with { agentDir } reads global config from getGlobalConfigPath(agentDir)", () => {
    const { agentDir, cleanup } = makeAgentDirSetup({
      globalPermission: { read: "deny" },
    });
    try {
      const manager = new PermissionManager({ agentDir });
      const result = manager.checkPermission("read", { path: "foo.txt" });
      expect(result.state).toBe("deny");
    } finally {
      cleanup();
    }
  });

  it("configureForCwd(cwd) applies project config (project overrides global)", () => {
    const { agentDir, cwd, cleanup } = makeAgentDirSetup({
      globalPermission: { read: "deny" },
      projectPermission: { read: "allow" },
    });
    try {
      const manager = new PermissionManager({ agentDir });
      expect(manager.checkPermission("read", { path: "foo.txt" }).state).toBe("deny");

      manager.configureForCwd(cwd);

      expect(manager.checkPermission("read", { path: "foo.txt" }).state).toBe("allow");
    } finally {
      cleanup();
    }
  });

  it("configureForCwd(undefined) reverts to global-only", () => {
    const { agentDir, cwd, cleanup } = makeAgentDirSetup({
      globalPermission: { read: "deny" },
      projectPermission: { read: "allow" },
    });
    try {
      const manager = new PermissionManager({ agentDir });
      manager.configureForCwd(cwd);
      expect(manager.checkPermission("read", { path: "foo.txt" }).state).toBe("allow");

      manager.configureForCwd(undefined);

      expect(manager.checkPermission("read", { path: "foo.txt" }).state).toBe("deny");
    } finally {
      cleanup();
    }
  });

  it("configureForCwd clears the resolved-permissions cache", () => {
    const { agentDir, globalConfigPath, cleanup } = makeAgentDirSetup({
      globalPermission: { read: "allow" },
    });
    try {
      const manager = new PermissionManager({ agentDir });
      expect(manager.checkPermission("read", { path: "foo.txt" }).state).toBe("allow");
      writeFileSync(globalConfigPath, JSON.stringify({ permission: { read: "deny" } }, null, 2));
      manager.configureForCwd(undefined);
      expect(manager.checkPermission("read", { path: "foo.txt" }).state).toBe("deny");
    } finally {
      cleanup();
    }
  });
});

test("Project-level config overrides base bash patterns", () => {
  const { manager, cleanup } = createManagerWithProject(
    {
      permission: {
        "*": "allow",
        bash: { "*": "ask", "rm -rf *": "deny" },
      },
    },
    {},
    {
      projectConfig: {
        permission: { bash: { "rm -rf build": "allow" } },
      },
    },
  );

  try {
    const allowed = manager.checkPermission("bash", {
      command: "rm -rf build",
    });
    expect(allowed.state).toBe("allow");
    expect(allowed.matchedPattern).toBe("rm -rf build");

    const denied = manager.checkPermission("bash", {
      command: "rm -rf node_modules",
    });
    expect(denied.state).toBe("deny");
    expect(denied.matchedPattern).toBe("rm -rf *");
  } finally {
    cleanup();
  }
});

test("System-agent config overrides project-level bash patterns", () => {
  const { manager, cleanup } = createManagerWithProject(
    {
      permission: { "*": "allow", bash: "ask" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  bash:
    "git log *": allow
---
`,
    },
    {
      projectConfig: {
        permission: { bash: { "git *": "deny" } },
      },
    },
  );

  try {
    const allowed = manager.checkPermission("bash", { command: "git log --oneline" }, "reviewer");
    expect(allowed.state).toBe("allow");
    expect(allowed.matchedPattern).toBe("git log *");

    const denied = manager.checkPermission("bash", { command: "git status" }, "reviewer");
    expect(denied.state).toBe("deny");
    expect(denied.matchedPattern).toBe("git *");
  } finally {
    cleanup();
  }
});

test("Project-agent config overrides system-agent tool rules", () => {
  const { manager, cleanup } = createManagerWithProject(
    {
      permission: { "*": "ask" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  read: deny
---
`,
    },
    {
      projectAgentFiles: {
        reviewer: `---
name: reviewer
permission:
  read: allow
---
`,
      },
    },
  );

  try {
    const result = manager.checkPermission("read", {}, "reviewer");
    expect(result.state).toBe("allow");
    expect(result.source).toBe("tool");
  } finally {
    cleanup();
  }
});

test("Full precedence chain base < project < system-agent < project-agent for universal default", () => {
  const { manager, cleanup } = createManagerWithProject(
    {
      permission: { "*": "deny" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  "*": ask
---
`,
    },
    {
      projectConfig: {
        permission: { "*": "allow" },
      },
      projectAgentFiles: {
        reviewer: `---
name: reviewer
permission:
  "*": deny
---
`,
      },
    },
  );

  try {
    const reviewerResult = manager.checkPermission("custom_extension_tool", {}, "reviewer");
    expect(reviewerResult.state).toBe("deny");
    expect(reviewerResult.source).toBe("default");

    const globalResult = manager.checkPermission("custom_extension_tool", {});
    expect(globalResult.state).toBe("allow");
    expect(globalResult.source).toBe("default");
  } finally {
    cleanup();
  }
});

test("Project-agent applies even without a matching system-agent file", () => {
  const { manager, cleanup } = createManagerWithProject(
    {
      permission: { "*": "allow" },
    },
    {},
    {
      projectAgentFiles: {
        reviewer: `---
name: reviewer
permission:
  read: deny
---
`,
      },
    },
  );

  try {
    const agentResult = manager.checkPermission("read", {}, "reviewer");
    expect(agentResult.state).toBe("deny");
    expect(agentResult.source).toBe("tool");

    const globalResult = manager.checkPermission("read", {});
    expect(globalResult.state).toBe("allow");
    expect(globalResult.source).toBe("tool");
  } finally {
    cleanup();
  }
});

test("PermissionManager canonical built-in permission checking", () => {
  const { manager, cleanup } = createManager({
    permission: { "*": "deny", read: "allow" },
  });

  try {
    const readResult = manager.checkPermission("read", {});
    expect(readResult.state).toBe("allow");
    expect(readResult.source).toBe("tool");

    const writeResult = manager.checkPermission("write", {});
    expect(writeResult.state).toBe("deny");
    expect(writeResult.source).toBe("tool");
  } finally {
    cleanup();
  }
});

test("multiline bash command resolves to allow via universal fallback", () => {
  const { manager, cleanup } = createManager({
    permission: {
      "*": "allow",
      bash: { "rm -rf *": "deny", "sudo *": "ask" },
    },
  });

  try {
    const command = "node -e \"\nimport('x').then(() => {\n  console.log('done');\n});\n\"";
    const result = manager.checkPermission("bash", { command });
    expect(result.state).toBe("allow");
  } finally {
    cleanup();
  }
});

test("Bash specific deny patterns override catch-all within the same config", () => {
  const { manager, cleanup } = createManager({
    permission: {
      "*": "ask",
      bash: { "*": "allow", "rm -rf *": "deny" },
    },
  });

  try {
    const denied = manager.checkPermission("bash", {
      command: "rm -rf build",
    });
    expect(denied.state).toBe("deny");
    expect(denied.source).toBe("bash");
    expect(denied.matchedPattern).toBe("rm -rf *");

    const allowed = manager.checkPermission("bash", { command: "echo hello" });
    expect(allowed.state).toBe("allow");
    expect(allowed.source).toBe("bash");
    expect(allowed.matchedPattern).toBe("*");
  } finally {
    cleanup();
  }
});

test("MCP wildcard matching uses the registered mcp tool", () => {
  const { manager, cleanup } = createManager({
    permission: {
      "*": "ask",
      mcp: { "*": "deny", "research_*": "ask", "research_query-*": "allow" },
    },
  });

  try {
    const queryDocs = manager.checkPermission("mcp", {
      tool: "research:query-docs",
    });
    expect(queryDocs.state).toBe("allow");
    expect(queryDocs.source).toBe("mcp");
    expect(queryDocs.matchedPattern).toBe("research_query-*");
    expect(queryDocs.target).toBe("research_query-docs");

    const resolve2 = manager.checkPermission("mcp", {
      tool: "research:resolve-context",
    });
    expect(resolve2.state).toBe("ask");
    expect(resolve2.matchedPattern).toBe("research_*");
    expect(resolve2.target).toBe("research_resolve-context");

    const unknown = manager.checkPermission("mcp", {
      tool: "search:provider",
    });
    expect(unknown.state).toBe("deny");
    expect(unknown.matchedPattern).toBe("*");
    expect(unknown.target).toBe("search_provider");
  } finally {
    cleanup();
  }
});

test("Arbitrary extension tools use exact-name tool permissions instead of MCP fallback", () => {
  const { manager, cleanup } = createManager({
    permission: {
      "*": "deny",
      third_party_tool: "allow",
      mcp: { "*": "deny" },
    },
  });

  try {
    const allowed = manager.checkPermission("third_party_tool", {});
    expect(allowed.state).toBe("allow");
    expect(allowed.source).toBe("tool");

    const fallback = manager.checkPermission("another_extension_tool", {});
    expect(fallback.state).toBe("deny");
    expect(fallback.source).toBe("default");
  } finally {
    cleanup();
  }
});

test("Skill permission matching", () => {
  const { manager, cleanup } = createManager({
    permission: {
      "*": "ask",
      skill: {
        "*": "ask",
        "web-*": "deny",
        "requesting-code-review": "allow",
      },
    },
  });

  try {
    const allowed = manager.checkPermission("skill", {
      name: "requesting-code-review",
    });
    expect(allowed.state).toBe("allow");
    expect(allowed.matchedPattern).toBe("requesting-code-review");
    expect(allowed.source).toBe("skill");

    const denied = manager.checkPermission("skill", {
      name: "web-design-guidelines",
    });
    expect(denied.state).toBe("deny");
    expect(denied.matchedPattern).toBe("web-*");

    const fallback = manager.checkPermission("skill", {
      name: "unknown-skill",
    });
    expect(fallback.state).toBe("ask");
    expect(fallback.matchedPattern).toBe("*");
  } finally {
    cleanup();
  }
});

test("MCP proxy tool infers server-prefixed aliases from configured server names", () => {
  const { manager, cleanup } = createManager(
    {
      permission: {
        "*": "ask",
        mcp: { "exa_*": "deny", exa_get_code_context_exa: "allow" },
      },
    },
    {},
    { mcpServerNames: ["exa"] },
  );

  try {
    const result = manager.checkPermission("mcp", {
      tool: "get_code_context_exa",
    });
    expect(result.state).toBe("allow");
    expect(result.source).toBe("mcp");
    expect(result.matchedPattern).toBe("exa_get_code_context_exa");
    expect(result.target).toBe("exa_get_code_context_exa");
  } finally {
    cleanup();
  }
});

test("MCP server names in settings.json are not used — only mcp.json is consulted", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "pi-permission-system-test-"));
  const globalConfigPath = join(baseDir, "pi-permissions.jsonc");
  const mcpConfigPath = join(baseDir, "mcp.json");
  const settingsJsonPath = join(baseDir, "settings.json");
  const agentsDir = join(baseDir, "agents");
  mkdirSync(agentsDir, { recursive: true });

  const config: ScopeConfig = {
    permission: { "*": "ask", mcp: { "legacy-server_*": "allow" } },
  };

  writeFileSync(globalConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: {} }), "utf8");
  writeFileSync(settingsJsonPath, JSON.stringify({ mcpServers: { "legacy-server": {} } }), "utf8");

  const manager = new PermissionManager({
    globalConfigPath,
    agentsDir,
    globalMcpConfigPath: mcpConfigPath,
  });

  try {
    const result = manager.checkPermission("mcp", {
      tool: "some_tool_legacy-server",
    });
    expect(result.state).toBe("ask");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("MCP describe mode normalizes qualified tool names without duplicating server prefixes", () => {
  const { manager, cleanup } = createManager(
    {
      permission: {
        "*": "ask",
        mcp: { "exa_*": "deny", exa_web_search_exa: "allow" },
      },
    },
    {},
    { mcpServerNames: ["exa"] },
  );

  try {
    const result = manager.checkPermission("mcp", {
      describe: "exa:web_search_exa",
      server: "exa",
    });
    expect(result.state).toBe("allow");
    expect(result.source).toBe("mcp");
    expect(result.matchedPattern).toBe("exa_web_search_exa");
    expect(result.target).toBe("exa_web_search_exa");
  } finally {
    cleanup();
  }
});

test("Canonical tools map directly without legacy aliases", () => {
  const { manager, cleanup } = createManager({
    permission: { "*": "ask", find: "allow", ls: "deny" },
  });

  try {
    const findResult = manager.checkPermission("find", {});
    expect(findResult.state).toBe("allow");
    expect(findResult.source).toBe("tool");

    const lsResult = manager.checkPermission("ls", {});
    expect(lsResult.state).toBe("deny");
    expect(lsResult.source).toBe("tool");
  } finally {
    cleanup();
  }
});

test("mcp catch-all acts as fallback for unmatched MCP targets", () => {
  const { manager, cleanup } = createManager(
    {
      permission: { "*": "ask" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  mcp: allow
---
`,
    },
  );

  try {
    const result = manager.checkPermission("mcp", { tool: "exa:web_search_exa" }, "reviewer");
    expect(result.state).toBe("allow");
    expect(result.source).toBe("mcp");
    expect(result.target).toBe("exa_web_search_exa");
  } finally {
    cleanup();
  }
});

test("specific MCP rules override mcp catch-all", () => {
  const { manager, cleanup } = createManager(
    {
      permission: { "*": "ask" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  mcp:
    "*": allow
    exa_web_search_exa: deny
---
`,
    },
    { mcpServerNames: ["exa"] },
  );

  try {
    const result = manager.checkPermission("mcp", { tool: "web_search_exa" }, "reviewer");
    expect(result.state).toBe("deny");
    expect(result.source).toBe("mcp");
    expect(result.matchedPattern).toBe("exa_web_search_exa");
    expect(result.target).toBe("exa_web_search_exa");
  } finally {
    cleanup();
  }
});

test("specific MCP rules still win when mcp catch-all is deny", () => {
  const { manager, cleanup } = createManager(
    {
      permission: { "*": "ask" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  mcp:
    "*": deny
    exa_web_search_exa: allow
---
`,
    },
    { mcpServerNames: ["exa"] },
  );

  try {
    const allowed = manager.checkPermission("mcp", { tool: "web_search_exa" }, "reviewer");
    expect(allowed.state).toBe("allow");
    expect(allowed.source).toBe("mcp");
    expect(allowed.matchedPattern).toBe("exa_web_search_exa");
    expect(allowed.target).toBe("exa_web_search_exa");

    const fallback = manager.checkPermission("mcp", { tool: "other_exa" }, "reviewer");
    expect(fallback.state).toBe("deny");
    expect(fallback.source).toBe("mcp");
    expect(fallback.target).toBe("exa_other_exa");
  } finally {
    cleanup();
  }
});

test("mcp catch-all in agent frontmatter overrides global default", () => {
  const { manager, cleanup } = createManager(
    {
      permission: { "*": "deny" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  mcp: allow
---
`,
    },
  );

  try {
    const readResult = manager.checkPermission("read", {}, "reviewer");
    expect(readResult.state).toBe("deny");
    expect(readResult.source).toBe("tool");

    const mcpResult = manager.checkPermission("mcp", { tool: "exa:web_search_exa" }, "reviewer");
    expect(mcpResult.state).toBe("allow");
    expect(mcpResult.source).toBe("mcp");
  } finally {
    cleanup();
  }
});

test("Agent frontmatter canonical tools resolve correctly", () => {
  const { manager, cleanup } = createManager(
    {
      permission: { "*": "deny" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  find: allow
  ls: deny
---
`,
    },
  );

  try {
    const findResult = manager.checkPermission("find", {}, "reviewer");
    expect(findResult.state).toBe("allow");
    expect(findResult.source).toBe("tool");

    const lsResult = manager.checkPermission("ls", {}, "reviewer");
    expect(lsResult.state).toBe("deny");
    expect(lsResult.source).toBe("tool");
  } finally {
    cleanup();
  }
});

test("All surface names work in agent frontmatter flat permission format", () => {
  const { manager, cleanup } = createManager(
    {
      permission: { "*": "deny" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  find: allow
  task: allow
  mcp: allow
---
`,
    },
  );

  try {
    const findResult = manager.checkPermission("find", {}, "reviewer");
    expect(findResult.state).toBe("allow");
    expect(findResult.source).toBe("tool");

    const taskResult = manager.checkPermission("task", {}, "reviewer");
    expect(taskResult.state).toBe("allow");
    expect(taskResult.source).toBe("tool");

    const mcpResult = manager.checkPermission("mcp", { tool: "exa:web_search_exa" }, "reviewer");
    expect(mcpResult.state).toBe("allow");
  } finally {
    cleanup();
  }
});

test("task uses exact-name tool permissions like any registered extension tool", () => {
  const { manager, cleanup } = createManager({
    permission: { "*": "deny", task: "allow" },
  });

  try {
    const taskResult = manager.checkPermission("task", {});
    expect(taskResult.state).toBe("allow");
    expect(taskResult.source).toBe("tool");
  } finally {
    cleanup();
  }
});

test("getToolPermission returns tool-level policy for canonical and extension tools", () => {
  const { manager, cleanup } = createManager(
    {
      permission: { "*": "ask" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  bash: deny
  read: deny
  task: allow
---
`,
    },
  );

  try {
    const bashPermission = manager.getToolPermission("bash", "reviewer");
    expect(bashPermission).toBe("deny");

    const taskPermission = manager.getToolPermission("task", "reviewer");
    expect(taskPermission).toBe("allow");

    const readPermission = manager.getToolPermission("read", "reviewer");
    expect(readPermission).toBe("deny");

    const defaultBashPermission = manager.getToolPermission("bash");
    expect(defaultBashPermission).toBe("ask");

    const { manager: manager2, cleanup: cleanup2 } = createManager({
      permission: { "*": "deny", bash: "allow" },
    });

    try {
      const globalBashPermission = manager2.getToolPermission("bash");
      expect(globalBashPermission).toBe("allow");
    } finally {
      cleanup2();
    }
  } finally {
    cleanup();
  }
});

test("getToolPermission supports arbitrary extension tool names", () => {
  const { manager, cleanup } = createManager({
    permission: { "*": "deny", third_party_tool: "allow" },
  });

  try {
    const explicitPermission = manager.getToolPermission("third_party_tool");
    expect(explicitPermission).toBe("allow");

    const fallbackPermission = manager.getToolPermission("missing_extension_tool");
    expect(fallbackPermission).toBe("deny");
  } finally {
    cleanup();
  }
});

test("skill pattern map in agent frontmatter overrides global skill policy", () => {
  const { manager, cleanup } = createManager(
    {
      permission: { "*": "deny", skill: "deny" },
    },
    {
      reviewer: `---
name: reviewer
permission:
  skill:
    "*": ask
    "pi-*": allow
---
`,
    },
  );

  try {
    const allowed = manager.checkPermission("skill", { name: "pi-code-review" }, "reviewer");
    expect(allowed.state).toBe("allow");
    expect(allowed.matchedPattern).toBe("pi-*");
    expect(allowed.source).toBe("skill");

    const asked = manager.checkPermission("skill", { name: "other-skill" }, "reviewer");
    expect(asked.state).toBe("ask");
    expect(asked.matchedPattern).toBe("*");

    const denied = manager.checkPermission("skill", { name: "pi-code-review" });
    expect(denied.state).toBe("deny");
    expect(denied.source).toBe("skill");
  } finally {
    cleanup();
  }
});

test("project-agent frontmatter skill rules override global-agent frontmatter skill rules", () => {
  const { manager, cleanup } = createManagerWithProject(
    {
      permission: { "*": "deny" },
    },
    {
      analyst: `---
name: analyst
permission:
  skill:
    "*": ask
---
`,
    },
    {
      projectAgentFiles: {
        analyst: `---
name: analyst
permission:
  skill:
    "pi-*": allow
    "*": deny
---
`,
      },
    },
  );

  try {
    const allowed = manager.checkPermission("skill", { name: "pi-code-review" }, "analyst");
    expect(allowed.state).toBe("allow");
    expect(allowed.matchedPattern).toBe("pi-*");

    const denied = manager.checkPermission("skill", { name: "other-skill" }, "analyst");
    expect(denied.state).toBe("deny");
    expect(denied.matchedPattern).toBe("*");
  } finally {
    cleanup();
  }
});

test("PermissionManager reads config from PI_CODING_AGENT_DIR when set", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "pi-permission-system-envdir-"));
  const agentsDir = join(baseDir, "agents");
  const newConfigPath = getGlobalConfigPath(baseDir);
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(dirname(newConfigPath), { recursive: true });

  const config: ScopeConfig = {
    permission: { "*": "deny", read: "allow" },
  };
  writeFileSync(newConfigPath, JSON.stringify(config), "utf8");

  const original = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = baseDir;
  try {
    const manager = new PermissionManager();
    const result = manager.checkPermission("read", {});
    expect(result.state).toBe("allow");

    const result2 = manager.checkPermission("write", {});
    expect(result2.state).toBe("deny");
  } finally {
    if (original !== undefined) {
      process.env.PI_CODING_AGENT_DIR = original;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("PermissionManager.getConfigIssues returns empty array for clean config", () => {
  const config: ScopeConfig = {
    permission: { "*": "ask", path: "ask" },
  };
  const { manager, cleanup } = createManager(config);
  try {
    const issues = manager.getConfigIssues();
    expect(issues.length).toBe(0);
  } finally {
    cleanup();
  }
});

test("PermissionManager.getConfigIssues returns empty array for empty config", () => {
  const { manager, cleanup } = createManager({});
  try {
    const issues = manager.getConfigIssues();
    expect(issues.length).toBe(0);
  } finally {
    cleanup();
  }
});

test("checkPermission falls back to config policy when session rules do not cover the path", () => {
  const { manager, cleanup } = createManager({
    permission: { "*": "allow", path: "deny" },
  });

  try {
    const sessionRules = [
      {
        surface: "path",
        pattern: "/other/project/*",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const result = manager.checkPermission("path", { path: "/completely/different/path.ts" }, undefined, sessionRules);
    expect(result.state).toBe("deny");
  } finally {
    cleanup();
  }
});

test("checkPermission with empty session rules is identical to call without sessionRules arg", () => {
  const { manager, cleanup } = createManager({
    permission: { "*": "allow", path: "deny" },
  });

  try {
    const withEmpty = manager.checkPermission("path", { path: "/other/project/foo.ts" }, undefined, []);
    const withoutArg = manager.checkPermission("path", {
      path: "/other/project/foo.ts",
    });
    const expected: PermissionCheckResult = {
      toolName: "path",
      state: "deny",
      matchedPattern: "*",
      source: "special",
      origin: "global",
    };
    expect(withEmpty).toEqual(expected);
    expect(withoutArg).toEqual(expected);
  } finally {
    cleanup();
  }
});

test("session rules for one surface do not affect checks on other surfaces", () => {
  const { manager, cleanup } = createManager({ permission: {} });

  try {
    const sessionRules = [
      {
        surface: "path",
        pattern: "/other/project/*",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const bashResult = manager.checkPermission("bash", { command: "git status" }, undefined, sessionRules);
    expect(bashResult.state).toBe("ask");
    expect(bashResult.source).toBe("bash");

    const mcpResult = manager.checkPermission("mcp", { tool: "exa:search" }, undefined, sessionRules);
    expect(mcpResult.state).toBe("ask");
    expect(mcpResult.source).toBe("default");
  } finally {
    cleanup();
  }
});

test("checkPermission returns source 'session' for bash when session rules match", () => {
  const { manager, cleanup } = createManager({ permission: {} });

  try {
    const sessionRules = [
      {
        surface: "bash",
        pattern: "git *",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const result = manager.checkPermission("bash", { command: "git status --short" }, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
    expect(result.matchedPattern).toBe("git *");
  } finally {
    cleanup();
  }
});

test("checkPermission returns source 'session' for bash when session rule is exact match", () => {
  const { manager, cleanup } = createManager({ permission: {} });

  try {
    const sessionRules = [
      {
        surface: "bash",
        pattern: "ls",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const result = manager.checkPermission("bash", { command: "ls" }, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
  } finally {
    cleanup();
  }
});

test("checkPermission falls back to config for bash when session rules do not match the command", () => {
  const { manager, cleanup } = createManager({ permission: { bash: "deny" } });

  try {
    const sessionRules = [
      {
        surface: "bash",
        pattern: "git *",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const result = manager.checkPermission("bash", { command: "npm run build" }, undefined, sessionRules);
    expect(result.state).toBe("deny");
    expect(result.source).toBe("bash");
  } finally {
    cleanup();
  }
});

test("checkPermission returns source 'session' for mcp when session rules match the target", () => {
  const { manager, cleanup } = createManager({ permission: {} });

  try {
    const sessionRules = [
      {
        surface: "mcp",
        pattern: "exa:*",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const result = manager.checkPermission("mcp", { tool: "exa:search" }, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
  } finally {
    cleanup();
  }
});

test("checkPermission returns source 'session' for skill when session rules match", () => {
  const { manager, cleanup } = createManager({ permission: {} });

  try {
    const sessionRules = [
      {
        surface: "skill",
        pattern: "librarian",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const result = manager.checkPermission("skill", { name: "librarian" }, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
    expect(result.matchedPattern).toBe("librarian");
  } finally {
    cleanup();
  }
});

test("checkPermission returns source 'session' for tool surface when session rules match", () => {
  const { manager, cleanup } = createManager({ permission: {} });

  try {
    const sessionRules = [
      {
        surface: "read",
        pattern: "*",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const result = manager.checkPermission("read", {}, undefined, sessionRules);
    expect(result.state).toBe("allow");
    expect(result.source).toBe("session");
  } finally {
    cleanup();
  }
});

test("bash session rules do not bleed into mcp checks", () => {
  const { manager, cleanup } = createManager({ permission: {} });

  try {
    const sessionRules = [
      {
        surface: "bash",
        pattern: "git *",
        action: "allow" as const,
        layer: "session" as const,
        origin: "session" as const,
      },
    ];

    const result = manager.checkPermission("mcp", { tool: "exa:search" }, undefined, sessionRules);
    expect(result.source).not.toBe("session");
  } finally {
    cleanup();
  }
});

test("getResolvedPolicyPaths returns correct paths and existence when files exist", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "policy-paths-exist-"));
  try {
    const globalConfigPath = join(tempDir, "pi-permissions.jsonc");
    const agentsDir = join(tempDir, "agents");
    const projectConfigPath = join(tempDir, "project", "pi-permissions.jsonc");
    const projectAgentsDir = join(tempDir, "project", "agents");

    writeFileSync(globalConfigPath, "{}", "utf-8");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(join(tempDir, "project"), { recursive: true });
    writeFileSync(projectConfigPath, "{}", "utf-8");
    mkdirSync(projectAgentsDir, { recursive: true });

    const pm = new PermissionManager({
      globalConfigPath,
      agentsDir,
      projectGlobalConfigPath: projectConfigPath,
      projectAgentsDir,
    });

    const result = pm.getResolvedPolicyPaths();

    expect(result.globalConfigPath).toBe(globalConfigPath);
    expect(result.globalConfigExists).toBe(true);
    expect(result.projectConfigPath).toBe(projectConfigPath);
    expect(result.projectConfigExists).toBe(true);
    expect(result.agentsDir).toBe(agentsDir);
    expect(result.agentsDirExists).toBe(true);
    expect(result.projectAgentsDir).toBe(projectAgentsDir);
    expect(result.projectAgentsDirExists).toBe(true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("getResolvedPolicyPaths returns false for missing files and null for absent project paths", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "policy-paths-missing-"));
  try {
    const globalConfigPath = join(tempDir, "does-not-exist.jsonc");
    const agentsDir = join(tempDir, "no-agents");

    const pm = new PermissionManager({
      globalConfigPath,
      agentsDir,
    });

    const result = pm.getResolvedPolicyPaths();

    expect(result.globalConfigPath).toBe(globalConfigPath);
    expect(result.globalConfigExists).toBe(false);
    expect(result.projectConfigPath).toBe(null);
    expect(result.projectConfigExists).toBe(false);
    expect(result.agentsDir).toBe(agentsDir);
    expect(result.agentsDirExists).toBe(false);
    expect(result.projectAgentsDir).toBe(null);
    expect(result.projectAgentsDirExists).toBe(false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("checkPermission — cwd-aware path policy values", () => {
  const cwd = "/workspace/project";

  it("matches a relative read input against an absolute allowlist", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: { "*": "ask", [`${cwd}/*`]: "allow" },
    });
    try {
      manager.configureForCwd(cwd);
      const result = manager.checkPermission("read", { path: "src/App.jsx" });
      expect(result.state).toBe("allow");
      expect(result.matchedPattern).toBe(`${cwd}/*`);
    } finally {
      cleanup();
    }
  });

  it("keeps legacy relative path rules working after configureForCwd", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: { "*": "allow", "src/*": "deny" },
    });
    try {
      manager.configureForCwd(cwd);
      const result = manager.checkPermission("read", { path: "src/App.jsx" });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("src/*");
    } finally {
      cleanup();
    }
  });

  it("preserves last-match-wins across absolute and relative aliases", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      read: {
        "*": "ask",
        [`${cwd}/*`]: "allow",
        "src/*": "deny",
      },
    });
    try {
      manager.configureForCwd(cwd);
      const result = manager.checkPermission("read", { path: "src/App.jsx" });
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("src/*");
    } finally {
      cleanup();
    }
  });

  it("matches the cross-cutting path surface against absolute allowlists", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "ask", [`${cwd}/*`]: "allow" },
    });
    try {
      manager.configureForCwd(cwd);
      const result = manager.checkPermission("path", { path: "src/App.jsx" });
      expect(result.state).toBe("allow");
      expect(result.matchedPattern).toBe(`${cwd}/*`);
    } finally {
      cleanup();
    }
  });
});

describe("checkPathPolicy", () => {
  const cwd = "/workspace/project";

  it("evaluates precomputed policy values against the path surface", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "ask", [`${cwd}/*`]: "allow" },
    });
    try {
      const result = manager.checkPathPolicy([`${cwd}/src/App.jsx`, "src/App.jsx"]);
      expect(result.state).toBe("allow");
      expect(result.matchedPattern).toBe(`${cwd}/*`);
      expect(result.source).toBe("special");
      expect(result.toolName).toBe("path");
    } finally {
      cleanup();
    }
  });

  it("preserves last-match-wins across the provided aliases", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "ask", [`${cwd}/*`]: "allow", "src/*": "deny" },
    });
    try {
      const result = manager.checkPathPolicy([`${cwd}/src/App.jsx`, "src/App.jsx"]);
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("src/*");
    } finally {
      cleanup();
    }
  });

  it("applies session rules over config", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "ask", "src/*": "deny" },
    });
    try {
      const sessionRules: Ruleset = [sessionAllow("path", "src/*")];
      const result = manager.checkPathPolicy(["src/App.jsx"], undefined, sessionRules);
      expect(result.state).toBe("allow");
      expect(result.source).toBe("session");
    } finally {
      cleanup();
    }
  });

  it("falls back to the catch-all for an empty value list", () => {
    const { manager, cleanup } = makeManagerWithConfig({
      path: { "*": "deny" },
    });
    try {
      const result = manager.checkPathPolicy([]);
      expect(result.state).toBe("deny");
      expect(result.matchedPattern).toBe("*");
    } finally {
      cleanup();
    }
  });
});
