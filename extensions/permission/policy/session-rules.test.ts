import { describe, expect, it } from "vitest";

import { evaluate } from "#src/policy/rule";
import { SessionApproval } from "#src/policy/session-approval";
import type { SessionApprovalRecorder } from "#src/policy/session-rules";
import { deriveApprovalPattern, SessionRules } from "#src/policy/session-rules";

describe("SessionRules", () => {
  describe("getRuleset", () => {
    it("returns an empty ruleset initially", () => {
      const rules = new SessionRules();
      expect(rules.getRuleset()).toEqual([]);
    });

    it("returns a ruleset containing approved rules", () => {
      const rules = new SessionRules();
      rules.approve("path", "/other/project/*");
      expect(rules.getRuleset()).toEqual([
        {
          surface: "path",
          pattern: "/other/project/*",
          action: "allow",
          layer: "session",
          origin: "session",
        },
      ]);
    });

    it("returns a defensive copy — mutations do not affect internal state", () => {
      const rules = new SessionRules();
      rules.approve("path", "/other/project/*");
      const copy = rules.getRuleset();
      copy.push({
        surface: "bash",
        pattern: "*",
        action: "deny",
        origin: "session",
      });
      expect(rules.getRuleset()).toHaveLength(1);
    });

    it("accumulates multiple approved patterns", () => {
      const rules = new SessionRules();
      rules.approve("path", "/project-a/*");
      rules.approve("path", "/project-b/*");
      expect(rules.getRuleset()).toHaveLength(2);
    });
  });

  describe("clear", () => {
    it("removes all session rules", () => {
      const rules = new SessionRules();
      rules.approve("path", "/other/project/*");
      rules.approve("path", "/another/path/*");
      rules.clear();
      expect(rules.getRuleset()).toEqual([]);
    });

    it("allows new approvals after clearing", () => {
      const rules = new SessionRules();
      rules.approve("path", "/old/path/*");
      rules.clear();
      rules.approve("path", "/new/path/*");
      expect(rules.getRuleset()).toHaveLength(1);
      expect(rules.getRuleset()[0].pattern).toBe("/new/path/*");
    });
  });

  describe("recordSessionApproval", () => {
    it("satisfies the SessionApprovalRecorder interface", () => {
      const rules: SessionApprovalRecorder = new SessionRules();
      expect(typeof rules.recordSessionApproval).toBe("function");
    });

    it("records a single-pattern approval as one rule", () => {
      const rules = new SessionRules();
      rules.recordSessionApproval(SessionApproval.single("bash", "git *"));
      expect(rules.getRuleset()).toEqual([
        {
          surface: "bash",
          pattern: "git *",
          action: "allow",
          layer: "session",
          origin: "session",
        },
      ]);
    });

    it("records a multi-pattern approval as one rule per pattern", () => {
      const rules = new SessionRules();
      rules.recordSessionApproval(SessionApproval.multiple("path", ["/outside/a/*", "/outside/b/*"]));
      expect(rules.getRuleset()).toHaveLength(2);
      expect(rules.getRuleset()[0].pattern).toBe("/outside/a/*");
      expect(rules.getRuleset()[1].pattern).toBe("/outside/b/*");
    });

    it("records each rule with the correct surface", () => {
      const rules = new SessionRules();
      rules.recordSessionApproval(SessionApproval.multiple("path", ["/outside/a/*", "/outside/b/*"]));
      for (const rule of rules.getRuleset()) {
        expect(rule.surface).toBe("path");
      }
    });

    it("records nothing for an empty patterns list", () => {
      const rules = new SessionRules();
      rules.recordSessionApproval(SessionApproval.multiple("path", []));
      expect(rules.getRuleset()).toEqual([]);
    });
  });

  describe("evaluate() integration", () => {
    it("returns allow for a path under an approved directory", () => {
      const session = new SessionRules();
      session.approve("path", "/other/project/*");
      const result = evaluate("path", "/other/project/src/foo.ts", session.getRuleset());
      expect(result.action).toBe("allow");
    });

    it("returns ask (default) for a path outside approved directories", () => {
      const session = new SessionRules();
      session.approve("path", "/other/project/*");
      const result = evaluate("path", "/other/unrelated/file.ts", session.getRuleset());
      expect(result.action).toBe("ask");
    });

    it("does not match a sibling directory that shares a string prefix", () => {
      const session = new SessionRules();
      session.approve("path", "/other/project/*");
      const result = evaluate("path", "/other/project-b/foo.ts", session.getRuleset());
      expect(result.action).toBe("ask");
    });

    it("matches the directory itself (trailing slash)", () => {
      const session = new SessionRules();
      session.approve("path", "/other/project/src/*");
      const result = evaluate("path", "/other/project/src/", session.getRuleset());
      expect(result.action).toBe("allow");
    });

    it("handles multiple approved directories", () => {
      const session = new SessionRules();
      session.approve("path", "/project-a/*");
      session.approve("path", "/project-b/*");
      expect(evaluate("path", "/project-a/foo.ts", session.getRuleset()).action).toBe("allow");
      expect(evaluate("path", "/project-b/bar.ts", session.getRuleset()).action).toBe("allow");
      expect(evaluate("path", "/project-c/baz.ts", session.getRuleset()).action).toBe("ask");
    });

    it("does not match a different surface", () => {
      const session = new SessionRules();
      session.approve("path", "/other/project/*");
      const result = evaluate("bash", "/other/project/foo.ts", session.getRuleset());
      expect(result.action).toBe("ask");
    });

    it("returns allow after clearing and re-approving", () => {
      const session = new SessionRules();
      session.approve("path", "/old/project/*");
      session.clear();
      session.approve("path", "/new/project/*");
      expect(evaluate("path", "/old/project/file.ts", session.getRuleset()).action).toBe("ask");
      expect(evaluate("path", "/new/project/file.ts", session.getRuleset()).action).toBe("allow");
    });
  });
});

describe("deriveApprovalPattern", () => {
  it("returns parent directory glob for a file path", () => {
    expect(deriveApprovalPattern("/other/project/src/foo.ts")).toBe("/other/project/src/*");
  });

  it("returns directory glob when path already ends with separator", () => {
    expect(deriveApprovalPattern("/other/project/src/")).toBe("/other/project/src/*");
  });

  it("returns parent directory glob for a directory-like path without trailing separator", () => {
    expect(deriveApprovalPattern("/other/project/src")).toBe("/other/project/*");
  });

  it("handles root path", () => {
    expect(deriveApprovalPattern("/")).toBe("/*");
  });

  it("handles single-level path", () => {
    expect(deriveApprovalPattern("/foo")).toBe("/*");
  });

  it("produces a pattern that matches paths under the approved directory", () => {
    const pattern = deriveApprovalPattern("/other/project/src/foo.ts");
    const session = new SessionRules();
    session.approve("path", pattern);
    expect(evaluate("path", "/other/project/src/bar.ts", session.getRuleset()).action).toBe("allow");
  });

  it("produces a pattern that does not match sibling directories", () => {
    const pattern = deriveApprovalPattern("/other/project/src/foo.ts");
    const session = new SessionRules();
    session.approve("path", pattern);
    expect(evaluate("path", "/other/project/lib/bar.ts", session.getRuleset()).action).toBe("ask");
  });
});
