import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stripJsonComments } from "./config-json-comments";
import { collectLegacyConfigIssues, loadUnifiedConfig } from "./config-loader";
import { getGlobalConfigPath, getProjectConfigPath } from "./config-paths";

describe("stripJsonComments", () => {
  it("returns empty string for empty input", () => {
    expect(stripJsonComments("")).toBe("");
  });

  it("passes through plain JSON unchanged", () => {
    const input = '{"key": true}';
    expect(stripJsonComments(input)).toBe(input);
  });

  it("drops a line comment body and preserves the trailing newline", () => {
    expect(stripJsonComments('{ // comment\n"k": 1}')).toBe('{ \n"k": 1}');
  });

  it("drops a line comment that runs to EOF with no trailing newline", () => {
    expect(stripJsonComments('{"k": 1} // trailing')).toBe('{"k": 1} ');
  });

  it("drops a block comment and nothing else", () => {
    expect(stripJsonComments('{ /* block */ "k": 1}')).toBe('{  "k": 1}');
  });

  it("drops an unterminated block comment to EOF", () => {
    expect(stripJsonComments("{ /* no close")).toBe("{ ");
  });

  it("preserves // inside a double-quoted string", () => {
    expect(stripJsonComments('{"url": "http://example.com"}')).toBe('{"url": "http://example.com"}');
  });

  it("preserves block-comment markers inside a double-quoted string", () => {
    expect(stripJsonComments('{"v": "a /* b */ c"}')).toBe('{"v": "a /* b */ c"}');
  });

  it("preserves // inside a single-quoted string", () => {
    expect(stripJsonComments("{'url': 'http://x.com'}")).toBe("{'url': 'http://x.com'}");
  });

  it("preserves block-comment markers inside a single-quoted string", () => {
    expect(stripJsonComments("{'v': 'a /* b */ c'}")).toBe("{'v': 'a /* b */ c'}");
  });

  it("honors a backslash-escaped quote so it does not close the string", () => {
    expect(stripJsonComments('{"k": "a\\"b"}')).toBe('{"k": "a\\"b"}');
  });

  it("emits an unterminated string to EOF verbatim", () => {
    expect(stripJsonComments('{"k": "unterminated')).toBe('{"k": "unterminated');
  });

  it("preserves a lone slash that is not part of // or /*", () => {
    expect(stripJsonComments('{"v": 1/2}')).toBe('{"v": 1/2}');
  });

  it("handles a combined JSONC document that round-trips to valid JSON", () => {
    const jsonc = ["{", '  "permission": { /* the policy */ "*": "ask" }', "}"].join("\n");
    const stripped = stripJsonComments(jsonc);
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    expect(parsed.permission).toEqual({ "*": "ask" });
  });
});

describe("loadUnifiedConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "config-loader-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses a valid JSON file with a flat permission block", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        permission: {
          "*": "ask",
          read: "allow",
          bash: { "git status": "allow" },
        },
      }),
    );

    const result = loadUnifiedConfig(configPath);
    expect(result.issues).toEqual([]);
    expect(result.config.permission).toEqual({
      "*": "ask",
      read: "allow",
      bash: { "git status": "allow" },
    });
  });

  it("strips JSONC comments before parsing", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(
      configPath,
      `{
  // This is a comment
  /* block comment */
  "permission": { "*": "ask" }
}`,
    );

    const result = loadUnifiedConfig(configPath);
    expect(result.issues).toEqual([]);
    expect(result.config.permission).toEqual({ "*": "ask" });
  });

  it("ignores unknown keys without emitting issues", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        unknownField: "ignored",
        anotherRandom: 42,
        permission: { read: "allow" },
      }),
    );

    const result = loadUnifiedConfig(configPath);
    expect(result.issues).toEqual([]);
    expect(result.config).not.toHaveProperty("unknownField");
    expect(result.config.permission).toEqual({ read: "allow" });
  });

  it("returns empty config and no issues when the file does not exist", () => {
    const configPath = join(tempDir, "nonexistent.json");
    const result = loadUnifiedConfig(configPath);
    expect(result.issues).toEqual([]);
    expect(result.config.permission).toBeUndefined();
  });

  it("returns empty config and an issue when the file contains invalid JSON", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(configPath, "not valid json {{{");

    const result = loadUnifiedConfig(configPath);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain(configPath);
  });

  it("normalizes permission map, keeping only valid PermissionState values", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        permission: {
          read: "allow",
          write: "invalid",
          bash: { "git *": "ask", "rm -rf": 42 },
        },
      }),
    );

    const result = loadUnifiedConfig(configPath);
    expect(result.config.permission).toEqual({
      read: "allow",
      bash: { "git *": "ask" },
    });
    expect(result.issues).toEqual([
      "Invalid permission config at 'permission.write': expected allow, deny, or ask",
      "Invalid permission config at 'permission.bash.rm -rf': expected allow, deny, ask, or deny object",
    ]);
  });

  it("accepts permission as object with mixed string and object values", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        permission: {
          "*": "ask",
          read: "allow",
          bash: { "*": "ask", "git *": "allow" },
          path: { "/tmp/*": "allow" },
        },
      }),
    );

    const result = loadUnifiedConfig(configPath);
    expect(result.issues).toEqual([]);
    expect(result.config.permission).toEqual({
      "*": "ask",
      read: "allow",
      bash: { "*": "ask", "git *": "allow" },
      path: { "/tmp/*": "allow" },
    });
  });

  it("preserves a deny-with-reason object inside a pattern map", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        permission: {
          bash: {
            "git *": "allow",
            "npm *": { action: "deny", reason: "Use pnpm instead" },
          },
        },
      }),
    );

    const result = loadUnifiedConfig(configPath);
    expect(result.config.permission).toEqual({
      bash: {
        "git *": "allow",
        "npm *": { action: "deny", reason: "Use pnpm instead" },
      },
    });
  });

  it("strips a deny object with a non-string reason (malformed)", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        permission: {
          bash: {
            "git *": "allow",
            "npm *": { action: "deny", reason: 42 },
          },
        },
      }),
    );

    const result = loadUnifiedConfig(configPath);
    expect(result.config.permission).toEqual({
      bash: { "git *": "allow" },
    });
    expect(result.issues).toEqual([
      "Invalid permission config at 'permission.bash.npm *': expected allow, deny, ask, or deny object",
    ]);
  });

  it("emits an issue when the permission field is malformed", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ permission: "allow" }));

    const result = loadUnifiedConfig(configPath);

    expect(result.config.permission).toBeUndefined();
    expect(result.issues).toEqual(["Invalid permission config at 'permission': expected an object"]);
  });

  it("returns no permission when the permission field is absent", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(configPath, JSON.stringify({}));

    const result = loadUnifiedConfig(configPath);
    expect(result.config.permission).toBeUndefined();
  });

  it("ignores a non-object permission field", () => {
    const configPath = join(tempDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ permission: "allow" }));

    const result = loadUnifiedConfig(configPath);
    expect(result.config.permission).toBeUndefined();
  });
});

describe("collectLegacyConfigIssues", () => {
  let tempDir: string;
  let agentDir: string;
  let cwd: string;
  let extensionRoot: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "config-issues-test-"));
    agentDir = join(tempDir, "agent");
    cwd = join(tempDir, "project");
    extensionRoot = join(tempDir, "ext");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeLegacyGlobalPolicy(content: string): void {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "pi-permissions.jsonc"), content);
  }

  function writeLegacyProjectPolicy(content: string): void {
    const dir = join(cwd, ".pi", "agent");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "pi-permissions.jsonc"), content);
  }

  it("detects legacy global policy and reports parse issues", () => {
    writeLegacyGlobalPolicy("not valid json");

    const issues = collectLegacyConfigIssues(agentDir, cwd, extensionRoot);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("pi-permissions.jsonc");
    expect(issues[0]).toContain(getGlobalConfigPath(agentDir));
    expect(issues[1]).toContain("Failed to read config");
  });

  it("detects legacy project policy", () => {
    writeLegacyProjectPolicy(JSON.stringify({ bash: { "git status": "allow" } }));

    const issues = collectLegacyConfigIssues(agentDir, cwd, extensionRoot);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(".pi/agent/pi-permissions.jsonc");
    expect(issues[0]).toContain(getProjectConfigPath(cwd));
  });

  it("returns no issues when no config files exist", () => {
    expect(collectLegacyConfigIssues(agentDir, cwd, extensionRoot)).toEqual([]);
  });
});
