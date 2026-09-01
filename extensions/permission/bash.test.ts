import { describe, expect, it } from "vitest";
import { analyzeBashCommand } from "./bash";

describe("analyzeBashCommand: command splitting", () => {
  it("splits compound commands on separators", () => {
    const analysis = analyzeBashCommand("git status && npm test");
    expect(analysis.commands).toEqual(["git status", "npm test"]);
    expect(analysis.suspicious).toBe(false);
  });

  it("splits on ;, |, and newlines", () => {
    expect(analyzeBashCommand("git add .; git commit -m 'x'").commands).toEqual(["git add .", "git commit -m 'x'"]);
    expect(analyzeBashCommand("cat a | grep b").commands).toEqual(["cat a", "grep b"]);
    expect(analyzeBashCommand("git status\nnpm test").commands).toEqual(["git status", "npm test"]);
  });

  it("does not split inside quotes", () => {
    expect(analyzeBashCommand('echo "a; b"').commands).toEqual(['echo "a; b"']);
    expect(analyzeBashCommand("echo 'a && b'").commands).toEqual(["echo 'a && b'"]);
  });

  it("preserves the raw command text per segment", () => {
    expect(analyzeBashCommand('git commit -m "fix bug"').commands).toEqual(['git commit -m "fix bug"']);
    expect(analyzeBashCommand("  git   status  ").commands).toEqual(["git status"]);
  });
});

describe("analyzeBashCommand: wrapper stripping", () => {
  it("strips simple wrappers so rules match the inner command", () => {
    expect(analyzeBashCommand("nohup npm test").commands).toEqual(["npm test"]);
    expect(analyzeBashCommand("time git status").commands).toEqual(["git status"]);
    expect(analyzeBashCommand("command -v git").commands).toEqual(["command -v git"]);
  });

  it("strips timeout with a duration", () => {
    expect(analyzeBashCommand("timeout 30 npm test").commands).toEqual(["npm test"]);
    expect(analyzeBashCommand("timeout 1m npm test").commands).toEqual(["npm test"]);
  });

  it("strips bare xargs but not xargs with flags", () => {
    expect(analyzeBashCommand("find . | xargs grep foo").commands).toEqual(["find .", "grep foo"]);
    expect(analyzeBashCommand("find . | xargs -n1 grep foo").commands).toEqual(["find .", "xargs -n1 grep foo"]);
  });

  it("does not strip wrappers with flag arguments", () => {
    expect(analyzeBashCommand("nice -n 5 npm test").commands).toEqual(["nice -n 5 npm test"]);
  });

  it("strips leading env assignments", () => {
    expect(analyzeBashCommand("NODE_ENV=test npm test").commands).toEqual(["npm test"]);
    expect(analyzeBashCommand("NODE_ENV=test npm test").pathTokens).toEqual([]);
  });
});

describe("analyzeBashCommand: suspicious constructs force ask", () => {
  it("marks command substitution suspicious", () => {
    expect(analyzeBashCommand("echo $(rm -rf /)").suspicious).toBe(true);
    expect(analyzeBashCommand("echo `rm -rf /`").suspicious).toBe(true);
    expect(analyzeBashCommand('echo "$(git status)"').suspicious).toBe(true);
  });

  it("does not mark single-quoted substitution text suspicious", () => {
    expect(analyzeBashCommand("echo '$(safe)'").suspicious).toBe(false);
  });

  it("marks process substitution and subshells suspicious", () => {
    expect(analyzeBashCommand("diff <(ls a) <(ls b)").suspicious).toBe(true);
    expect(analyzeBashCommand("(cd /tmp && ls)").suspicious).toBe(true);
  });

  it("marks unbalanced quotes suspicious", () => {
    expect(analyzeBashCommand('echo "unterminated').suspicious).toBe(true);
    expect(analyzeBashCommand("echo 'unterminated").suspicious).toBe(true);
  });

  it("marks dangling operators suspicious", () => {
    expect(analyzeBashCommand("npm test &&").suspicious).toBe(true);
    expect(analyzeBashCommand("npm test &&; git status").suspicious).toBe(true);
  });

  it("allows plain parameter expansions", () => {
    expect(analyzeBashCommand("cd $PROJECT_DIR && npm test").suspicious).toBe(false);
    expect(analyzeBashCommand("echo $HOME/bin").suspicious).toBe(false);
    expect(analyzeBashCommand('echo "$HOME"/bin').suspicious).toBe(false);
  });

  it("tolerates heredocs structurally via unmatched body segments", () => {
    const analysis = analyzeBashCommand("cat << EOF\nhello\nEOF");
    expect(analysis.suspicious).toBe(false);
    expect(analysis.commands).toEqual(["cat << EOF", "hello", "EOF"]);
  });
});

describe("analyzeBashCommand: path candidates", () => {
  it("extracts redirect targets", () => {
    expect(analyzeBashCommand("ls > out.txt").pathTokens).toEqual(["out.txt"]);
    expect(analyzeBashCommand("git log > /tmp/log.txt 2>&1").pathTokens).toEqual(["/tmp/log.txt"]);
    expect(analyzeBashCommand("grep foo < input.txt").pathTokens).toEqual(["input.txt"]);
  });

  it("extracts argument paths and rejects non-paths", () => {
    expect(analyzeBashCommand("cat src/app.ts").pathTokens).toEqual(["src/app.ts"]);
    expect(analyzeBashCommand("cat ~/.ssh/id_rsa").pathTokens).toEqual(["~/.ssh/id_rsa"]);
    expect(analyzeBashCommand("grep -r pattern /var/log").pathTokens).toEqual(["/var/log"]);
    expect(analyzeBashCommand("curl https://example.com").pathTokens).toEqual([]);
    expect(analyzeBashCommand("npm install @scope/package").pathTokens).toEqual([]);
    expect(analyzeBashCommand("echo hello").pathTokens).toEqual([]);
  });

  it("extracts dotfile arguments (v1 rule-candidate behavior)", () => {
    expect(analyzeBashCommand("rm .env").pathTokens).toEqual([".env"]);
    expect(analyzeBashCommand("cat ../secrets.txt").pathTokens).toEqual(["../secrets.txt"]);
  });

  it("extracts assignment values that look like paths", () => {
    expect(analyzeBashCommand("FOO=/etc/passwd cat x").pathTokens).toEqual(["/etc/passwd"]);
  });

  it("extracts cd targets so cross-directory cd is gated", () => {
    expect(analyzeBashCommand("cd /etc && cat passwd").pathTokens).toEqual(["/etc"]);
  });

  it("classifies tokens like v1 rule candidates (slash, dot-prefix, or dotdot)", () => {
    const analysis = analyzeBashCommand("sed -i 's/a/b/' file.txt");
    expect(analysis.pathTokens).toEqual(["s/a/b/"]);
    expect(analyzeBashCommand("rm src/app.ts").pathTokens).toEqual(["src/app.ts"]);
  });

  it("rejects bare slashes and regex metachar patterns", () => {
    expect(analyzeBashCommand("ls /").pathTokens).toEqual([]);
    expect(analyzeBashCommand("grep 'a.*b' file").pathTokens).toEqual([]);
  });
});
