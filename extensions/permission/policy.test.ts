import { describe, expect, it } from "vitest";
import { decideSurface } from "./match";
import { buildPolicy, parsePolicyScope, type ScopeRules, stripJsonComments } from "./policy";

const scope = (rules: ScopeRules["rules"], universal?: ScopeRules["universal"]): ScopeRules => ({ rules, universal });

describe("stripJsonComments", () => {
  it("removes line comments and preserves newlines", () => {
    expect(stripJsonComments('{\n  // comment\n  "a": 1\n}')).toBe('{\n  \n  "a": 1\n}');
  });

  it("removes block comments", () => {
    expect(stripJsonComments("{ /* c */ }")).toBe("{  }");
  });

  it("keeps comment-like text inside strings", () => {
    expect(stripJsonComments('{ "url": "http://x//y" }')).toBe('{ "url": "http://x//y" }');
  });

  it("handles escaped quotes inside strings", () => {
    const input = '{ "a": "x \\" // not comment" }';
    expect(stripJsonComments(input)).toBe(input);
  });
});

describe("parsePolicyScope", () => {
  it("parses surface state strings as catch-all rules", () => {
    const { scope: parsed, issues } = parsePolicyScope({ permission: { read: "allow" } });
    expect(issues).toHaveLength(0);
    expect(parsed.rules).toEqual([{ surface: "read", pattern: "*", state: "allow" }]);
  });

  it("parses pattern maps and deny objects", () => {
    const { scope: parsed, issues } = parsePolicyScope({
      permission: {
        bash: { "*": "ask", "rm *": { action: "deny", reason: "destructive" } },
      },
    });
    expect(issues).toHaveLength(0);
    expect(parsed.rules).toEqual([
      { surface: "bash", pattern: "*", state: "ask" },
      { surface: "bash", pattern: "rm *", state: "deny", reason: "destructive" },
    ]);
  });

  it("reads a universal string and reports invalid universal values", () => {
    expect(parsePolicyScope({ permission: { "*": "allow" } }).scope.universal).toBe("allow");
    const invalid = parsePolicyScope({ permission: { "*": "Allow" } });
    expect(invalid.scope.universal).toBeUndefined();
    expect(invalid.issues[0]).toContain("permission.*");
  });

  it("treats a universal object as inert but validates its entries", () => {
    const result = parsePolicyScope({ permission: { "*": { "git *": "maybe" } } });
    expect(result.scope.universal).toBeUndefined();
    expect(result.scope.rules).toHaveLength(0);
    expect(result.issues[0]).toContain("permission.*.git *");
  });

  it("rejects invalid surface states and pattern actions", () => {
    const { issues } = parsePolicyScope({
      permission: { read: "Allow", bash: { "git *": "maybe" } },
    });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("permission.read");
    expect(issues[1]).toContain("permission.bash.git *");
  });

  it("rejects deny objects with a non-deny action or invalid reason", () => {
    const { issues } = parsePolicyScope({
      permission: {
        bash: { "a *": { action: "allow" }, "b *": { action: "deny", reason: 5 } },
      },
    });
    expect(issues).toHaveLength(2);
  });

  it("rejects a non-object permission root", () => {
    const { issues } = parsePolicyScope({ permission: "allow" });
    expect(issues[0]).toContain("expected an object");
  });

  it("ignores unknown top-level keys like $schema", () => {
    const { scope: parsed, issues } = parsePolicyScope({ $schema: "https://x", permission: { read: "allow" } });
    expect(issues).toHaveLength(0);
    expect(parsed.rules).toEqual([{ surface: "read", pattern: "*", state: "allow" }]);
  });

  it("returns no rules for a missing permission key", () => {
    const { scope: parsed, issues } = parsePolicyScope({ other: true });
    expect(issues).toHaveLength(0);
    expect(parsed.rules).toHaveLength(0);
  });
});

describe("buildPolicy", () => {
  it("returns an ask default with no scopes", () => {
    const policy = buildPolicy(null, null);
    expect(decideSurface(policy.rules, "bash", ["anything"], "first")).toEqual({ state: "ask" });
  });

  it("uses the universal string as the default action", () => {
    const policy = buildPolicy(scope([], "allow"), null);
    expect(decideSurface(policy.rules, "write", ["anything"], "first")).toEqual({ state: "allow" });
  });

  it("merges scopes with project winning per pattern", () => {
    const global = scope([{ surface: "bash", pattern: "git *", state: "ask" }]);
    const project = scope([{ surface: "bash", pattern: "git *", state: "allow" }]);
    const policy = buildPolicy(global, project);
    expect(decideSurface(policy.rules, "bash", ["git status"], "first")).toEqual({
      state: "allow",
      matchedPattern: "git *",
    });
  });

  it("appends project-only patterns after shared ones", () => {
    const global = scope([{ surface: "bash", pattern: "git *", state: "allow" }]);
    const project = scope([{ surface: "bash", pattern: "git push*", state: "deny", reason: "no" }]);
    const policy = buildPolicy(global, project);
    expect(decideSurface(policy.rules, "bash", ["git push origin"], "first")).toEqual({
      state: "deny",
      reason: "no",
      matchedPattern: "git push*",
    });
    expect(decideSurface(policy.rules, "bash", ["git status"], "first")).toEqual({
      state: "allow",
      matchedPattern: "git *",
    });
  });

  it("project universal default overrides global", () => {
    const policy = buildPolicy(scope([], "ask"), scope([], "allow"));
    expect(decideSurface(policy.rules, "write", ["x"], "first")).toEqual({ state: "allow", matchedPattern: undefined });
  });

  it("expands home patterns at match time", () => {
    const policy = buildPolicy(scope([{ surface: "path", pattern: "~/.ssh/*", state: "deny" }]), null);
    expect(decideSurface(policy.rules, "path", [`${process.env.HOME}/.ssh/id_rsa`], "any")).toEqual({
      state: "deny",
      matchedPattern: "~/.ssh/*",
    });
  });

  it("keeps a valid deny reason through the merge", () => {
    const policy = buildPolicy(
      scope([{ surface: "bash", pattern: "rm *", state: "deny", reason: "destructive" }]),
      null,
    );
    expect(decideSurface(policy.rules, "bash", ["rm -rf /"], "first")).toEqual({
      state: "deny",
      reason: "destructive",
      matchedPattern: "rm *",
    });
  });
});
