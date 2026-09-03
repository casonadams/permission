import { describe, expect, it } from "vitest";
import { compilePattern, decideSurface, foldMostRestrictive } from "./match";
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

describe("decideSurface", () => {
  const policy = buildPolicy(
    {
      rules: [
        { surface: "bash", pattern: "git *", state: "allow" as const },
        { surface: "bash", pattern: "git push*", state: "deny" as const, reason: "no pushes" },
      ],
      universal: "ask",
    },
    null,
  );

  it("uses last matching rule (specific after broad)", () => {
    expect(decideSurface(policy.rules, "bash", ["git status"], "first")).toEqual({
      state: "allow",
      matchedPattern: "git *",
    });
    expect(decideSurface(policy.rules, "bash", ["git push origin"], "first")).toEqual({
      state: "deny",
      reason: "no pushes",
      matchedPattern: "git push*",
    });
  });

  it("falls back to the universal default for unmatched values", () => {
    expect(decideSurface(policy.rules, "bash", ["npm test"], "first")).toEqual({ state: "ask" });
    expect(decideSurface(policy.rules, "custom_tool", ["/tmp/x"], "first")).toEqual({ state: "ask" });
  });

  it("matches surface wildcards", () => {
    const p = buildPolicy(
      { rules: [{ surface: "*", pattern: "mcp_status", state: "allow" as const }], universal: "ask" },
      null,
    );
    expect(decideSurface(p.rules, "mcp", ["mcp_status"], "first")).toEqual({
      state: "allow",
      matchedPattern: "mcp_status",
    });
  });

  it("'first' takes the first value with a real rule match (projection-friendly)", () => {
    const p = buildPolicy(
      { rules: [{ surface: "read", pattern: "src/*", state: "allow" as const }], universal: "ask" },
      null,
    );
    const decision = decideSurface(p.rules, "read", ["/repo/src/App.jsx", "src/App.jsx"], "first");
    expect(decision.state).toBe("allow");
    expect(decision.matchedPattern).toBe("src/*");
  });

  it("'any' takes the last rule matching any projection", () => {
    const p = buildPolicy(
      {
        rules: [
          { surface: "path", pattern: "*.env*", state: "deny" as const },
          { surface: "path", pattern: "/tmp/*", state: "allow" as const },
        ],
        universal: "ask",
      },
      null,
    );
    expect(decideSurface(p.rules, "path", ["/tmp/out.env"], "any").state).toBe("allow");
    expect(decideSurface(p.rules, "path", ["/repo/src/.env"], "any").state).toBe("deny");
    expect(decideSurface(p.rules, "path", ["/var/data/x"], "any")).toEqual({ state: "ask" });
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
