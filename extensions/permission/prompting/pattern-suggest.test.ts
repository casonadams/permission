import { describe, expect, it } from "vitest";
import { suggestBashPattern, suggestMcpPattern, suggestSessionPattern } from "#src/prompting/pattern-suggest";

describe("suggestBashPattern", () => {
  it("returns <command> <subcommand> * using the arity table", () => {
    // git arity=2: include the subcommand in the prefix.
    expect(suggestBashPattern("git status --short")).toBe("git status *");
  });

  it("appends trailing * when arity covers all tokens (multi-word script name)", () => {
    // npm run arity=3: prefix covers all three tokens → trailing wildcard.
    expect(suggestBashPattern("npm run build")).toBe("npm run build*");
  });

  it("returns the exact command when there are no arguments", () => {
    expect(suggestBashPattern("ls")).toBe("ls");
  });

  it("trims leading and trailing whitespace before lookup", () => {
    // git arity=2, tokens=["git","log"], prefix covers all → trailing wildcard.
    expect(suggestBashPattern("  git log  ")).toBe("git log*");
  });

  it("handles empty string gracefully", () => {
    expect(suggestBashPattern("")).toBe("");
  });

  it("falls back to first-word prefix for unknown commands", () => {
    expect(suggestBashPattern("mytool --verbose run")).toBe("mytool *");
  });

  it("returns first-word * for known arity-1 commands with args", () => {
    expect(suggestBashPattern("rm -rf node_modules")).toBe("rm *");
  });

  it("produces tighter pattern for docker compose than plain docker", () => {
    expect(suggestBashPattern("docker compose up --build")).toBe("docker compose up *");
  });
});

describe("suggestMcpPattern", () => {
  it("suggests server:* for a qualified target (colon-separated)", () => {
    expect(suggestMcpPattern("exa:search")).toBe("exa:*");
  });

  it("suggests server_* for a munged target (underscore-separated)", () => {
    expect(suggestMcpPattern("exa_search")).toBe("exa_*");
  });

  it("suggests * for a bare 'mcp' target", () => {
    expect(suggestMcpPattern("mcp")).toBe("*");
  });

  it("suggests * for a plain tool name with no server prefix", () => {
    expect(suggestMcpPattern("search")).toBe("*");
  });

  it("prefers colon over underscore when both are present", () => {
    // Qualified names contain ':'; the colon check runs first.
    expect(suggestMcpPattern("my-server:some_tool")).toBe("my-server:*");
  });
});

describe("suggestSessionPattern", () => {
  describe("bash surface", () => {
    it("returns arity-aware subcommand pattern for multi-word command", () => {
      // git arity=2: include the subcommand token in the prefix.
      const result = suggestSessionPattern("bash", "git status --short");
      expect(result).toMatchObject({
        surface: "bash",
        pattern: "git status *",
      });
    });

    it("returns exact command for single-word bash command", () => {
      const result = suggestSessionPattern("bash", "ls");
      expect(result).toMatchObject({ surface: "bash", pattern: "ls" });
    });
  });

  describe("mcp surface", () => {
    it("returns mcp surface with server:* for qualified target", () => {
      const result = suggestSessionPattern("mcp", "exa:search");
      expect(result).toMatchObject({ surface: "mcp", pattern: "exa:*" });
    });

    it("returns mcp surface with server_* for munged target", () => {
      const result = suggestSessionPattern("mcp", "exa_search");
      expect(result).toMatchObject({ surface: "mcp", pattern: "exa_*" });
    });

    it("returns * for bare mcp target", () => {
      const result = suggestSessionPattern("mcp", "mcp");
      expect(result).toMatchObject({ surface: "mcp", pattern: "*" });
    });
  });

  describe("skill surface", () => {
    it("returns exact skill name as pattern", () => {
      const result = suggestSessionPattern("skill", "librarian");
      expect(result).toMatchObject({ surface: "skill", pattern: "librarian" });
    });
  });

  describe("external_directory surface", () => {
    it("returns parent-directory glob from deriveApprovalPattern", () => {
      const result = suggestSessionPattern("external_directory", "/tmp/foo.txt");
      expect(result).toMatchObject({
        surface: "external_directory",
        pattern: "/tmp/*",
      });
    });
  });

  describe("path surface", () => {
    it("returns directory-scoped pattern for a file path", () => {
      const result = suggestSessionPattern("path", "src/.env");
      expect(result).toMatchObject({
        surface: "path",
        pattern: "src/*",
      });
    });

    it("label is the pattern alone", () => {
      const result = suggestSessionPattern("path", "src/.env");
      expect(result.label).toBe("Session: src/*");
    });
  });

  describe("path-bearing tool surfaces", () => {
    it("returns directory-scoped pattern for read with a file path", () => {
      const result = suggestSessionPattern("read", "/outside/project/file.ts");
      expect(result).toMatchObject({
        surface: "read",
        pattern: "/outside/project/*",
      });
    });

    it("returns directory-scoped pattern for write with a file path", () => {
      const result = suggestSessionPattern("write", "src/main.ts");
      expect(result).toMatchObject({
        surface: "write",
        pattern: "src/*",
      });
    });

    it("returns * when value is '*' (fallback)", () => {
      const result = suggestSessionPattern("read", "*");
      expect(result).toMatchObject({ surface: "read", pattern: "*" });
    });

    it("label is the derived path pattern for path-bearing tools", () => {
      const result = suggestSessionPattern("read", "/tmp/data/file.txt");
      expect(result.label).toBe("Session: /tmp/data/*");
    });

    it("label is the catch-all pattern when no narrower pattern applies", () => {
      const result = suggestSessionPattern("find", "*");
      expect(result.label).toBe("Session: *");
    });
  });

  describe("non-path-bearing tool surfaces", () => {
    it("returns * for extension tools", () => {
      const result = suggestSessionPattern("my_extension_tool", "*");
      expect(result).toMatchObject({
        surface: "my_extension_tool",
        pattern: "*",
      });
    });
  });

  describe("label field", () => {
    it("bash label is the command pattern", () => {
      const result = suggestSessionPattern("bash", "git status");
      expect(result.label).toBe("Session: git status*");
    });

    it("mcp label is the target pattern", () => {
      const result = suggestSessionPattern("mcp", "exa:search");
      expect(result.label).toBe("Session: exa:*");
    });

    it("skill label is the skill name", () => {
      const result = suggestSessionPattern("skill", "librarian");
      expect(result.label).toBe("Session: librarian");
    });

    it("external_directory label is the directory pattern", () => {
      const result = suggestSessionPattern("external_directory", "/tmp/foo.txt");
      expect(result.label).toBe("Session: /tmp/*");
    });

    it("path-bearing tool label is the path pattern", () => {
      const result = suggestSessionPattern("edit", "src/file.ts");
      expect(result.label).toBe("Session: src/*");
    });

    it("tool label is the catch-all pattern for a bare tool", () => {
      const result = suggestSessionPattern("edit", "*");
      expect(result.label).toBe("Session: *");
    });
  });
});
