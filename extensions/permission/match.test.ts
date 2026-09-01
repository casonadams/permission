import { describe, expect, it } from "vitest";
import { compilePattern, decideValue, foldMostRestrictive, type PolicyRule } from "./match";
import { buildPolicy } from "./policy";

describe("compilePattern", () => {
  it("matches exact strings only", () => {
    const regex = compilePattern("git status");
    expect(regex.test("git status")).toBe(true);
    expect(regex.test("git status --short")).toBe(false);
  });

  it("supports * anywhere", () => {
    expect(compilePattern("git *").test("git status")).toBe(true);
    expect(compilePattern("git *").test("git")).toBe(true);
    expect(compilePattern("* --version").test("node --version")).toBe(true);
    expect(compilePattern("* --version").test("node -v")).toBe(false);
  });

  it("makes a trailing space-star optional only for the bare command", () => {
    const pattern = compilePattern("ls *");
    expect(pattern.test("ls")).toBe(true);
    expect(pattern.test("ls -la")).toBe(true);
    expect(pattern.test("lsof")).toBe(false);
    expect(pattern.test("lsx")).toBe(false);
  });

  it("makes trailing space-star optional unconditionally (v1 behavior)", () => {
    expect(compilePattern("* --help *").test("npm --help x")).toBe(true);
    expect(compilePattern("* --help *").test("npm --help")).toBe(true);
  });

  it("makes a trailing path-star optional (dir matches itself)", () => {
    expect(compilePattern("/workspace/docs/*").test("/workspace/docs")).toBe(true);
    expect(compilePattern("/workspace/docs/*").test("/workspace/docs/security.md")).toBe(true);
    expect(compilePattern("/workspace/docs/*").test("/workspace/docs-old")).toBe(false);
  });

  it("supports ? as a single-character wildcard", () => {
    expect(compilePattern("git stat?s").test("git status")).toBe(true);
    expect(compilePattern("git stat?s").test("git stats")).toBe(false);
    expect(compilePattern("git status?").test("git status")).toBe(false);
    expect(compilePattern("git status?").test("git status1")).toBe(true);
  });

  it("escapes regex metacharacters", () => {
    expect(compilePattern("a.b").test("axb")).toBe(false);
    expect(compilePattern("a.b").test("a.b")).toBe(true);
    expect(compilePattern("npm (run)*").test("npm (run) build")).toBe(true);
  });

  it("expands home-relative patterns", () => {
    expect(compilePattern("~/.ssh/*").test(`${process.env.HOME}/.ssh/id_rsa`)).toBe(true);
  });

  it("matches across newlines (dotall)", () => {
    expect(compilePattern("git *").test("git status\nnpm test")).toBe(true);
  });
});

describe("decideValue", () => {
  const rules = [
    { surface: "*", pattern: "*", state: "ask" as const },
    { surface: "bash", pattern: "git *", state: "allow" as const },
    { surface: "bash", pattern: "git push*", state: "deny" as const, reason: "no pushes" },
    { surface: "path", pattern: "/tmp/*", state: "allow" as const },
  ].map((rule) => rule) as PolicyRule[];

  const policy = buildPolicy({ rules, universal: undefined }, null);

  it("uses last matching rule (specific after broad)", () => {
    expect(decideValue(policy.rules, "bash", "git status")).toEqual({ state: "allow" });
    expect(decideValue(policy.rules, "bash", "git push origin")).toEqual({ state: "deny", reason: "no pushes" });
  });

  it("falls back to the universal default for unmatched surfaces and values", () => {
    expect(decideValue(policy.rules, "bash", "npm test")).toEqual({ state: "ask" });
    expect(decideValue(policy.rules, "write", "/tmp/x")).toEqual({ state: "ask" });
  });

  it("matches surface wildcards", () => {
    const p = buildPolicy(
      { rules: [{ surface: "*", pattern: "mcp_status", state: "allow" as const }], universal: "ask" },
      null,
    );
    expect(decideValue(p.rules, "mcp", "mcp_status")).toEqual({ state: "allow" });
  });

  it("later rules on the same surface override earlier ones", () => {
    const p = buildPolicy(
      {
        rules: [
          { surface: "bash", pattern: "*", state: "ask" as const },
          { surface: "bash", pattern: "git diff*", state: "allow" as const },
        ],
        universal: "ask",
      },
      null,
    );
    expect(decideValue(p.rules, "bash", "git diff HEAD")).toEqual({ state: "allow" });
    expect(decideValue(p.rules, "bash", "rm -rf /")).toEqual({ state: "ask" });
  });
});

describe("foldMostRestrictive", () => {
  it("returns deny immediately", () => {
    const decision = foldMostRestrictive([
      { state: "ask" },
      { state: "deny", reason: "x" },
      { state: "deny", reason: "y" },
    ]);
    expect(decision).toEqual({ state: "deny", reason: "x" });
  });

  it("returns the first ask when no deny exists", () => {
    expect(foldMostRestrictive([{ state: "allow" }, { state: "ask" }])).toEqual({ state: "ask" });
  });

  it("returns null when everything allows", () => {
    expect(foldMostRestrictive([{ state: "allow" }, { state: "allow" }])).toBeNull();
  });

  it("returns null for an empty set", () => {
    expect(foldMostRestrictive([])).toBeNull();
  });
});
