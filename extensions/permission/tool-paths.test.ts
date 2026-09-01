import { describe, expect, it } from "vitest";
import {
  extractMcpTargets,
  extractToolInputPath,
  isInfrastructureRead,
  isPathOutsideWorkingDirectory,
  parentDirectoryGlob,
  pathPolicyValues,
} from "./tool-paths";

const cwd = "/repo";

describe("extractToolInputPath", () => {
  it("reads path from built-in tool input", () => {
    expect(extractToolInputPath("read", { path: "src/App.tsx" })).toBe("src/App.tsx");
    expect(extractToolInputPath("write", { path: "/tmp/x" })).toBe("/tmp/x");
  });
  it("returns null for non-path tools", () => {
    expect(extractToolInputPath("bash", { command: "ls" })).toBeNull();
    expect(extractToolInputPath("read", {})).toBeNull();
  });
});

describe("extractMcpTargets", () => {
  it("builds server:tool and server targets", () => {
    expect(extractMcpTargets({ server: "exa", tool: "search" })).toEqual(["exa:search", "exa"]);
  });
  it("returns an empty list without a server", () => {
    expect(extractMcpTargets({})).toEqual([]);
  });
});

describe("pathPolicyValues", () => {
  it("includes the literal, absolute, and cwd-relative projections", () => {
    expect(pathPolicyValues("/repo/src/App.tsx", cwd)).toEqual(["/repo/src/App.tsx", "src/App.tsx"]);
    expect(pathPolicyValues("src/App.tsx", cwd)).toEqual(["src/App.tsx", "/repo/src/App.tsx"]);
  });

  it("expands home in the literal projection", () => {
    const values = pathPolicyValues("~/.ssh/id_rsa", cwd);
    expect(values).toContain(`${process.env.HOME}/.ssh/id_rsa`);
  });

  it("keeps non-resolvable absolute paths without a relative projection", () => {
    expect(pathPolicyValues("/definitely-not-a-real-dir/hosts", cwd)).toEqual(["/definitely-not-a-real-dir/hosts"]);
  });
});

describe("parentDirectoryGlob", () => {
  it("globs the parent directory of the canonical absolute path", () => {
    expect(parentDirectoryGlob("/var/log/syslog", cwd)).toBe("/var/log/*");
    expect(parentDirectoryGlob("/repo/src/App.tsx", cwd)).toBe("/repo/src/*");
    expect(parentDirectoryGlob("src/App.tsx", cwd)).toBe("/repo/src/*");
  });
  it("returns null for unresolvable or root-level paths", () => {
    expect(parentDirectoryGlob("/x", cwd)).toBeNull();
  });
});

describe("isPathOutsideWorkingDirectory", () => {
  it("treats outside and home-relative paths as external", () => {
    expect(isPathOutsideWorkingDirectory("/var/log/x", cwd)).toBe(true);
    expect(isPathOutsideWorkingDirectory("~/.ssh/id_rsa", cwd)).toBe(true);
    expect(isPathOutsideWorkingDirectory("/repo/src/App.tsx", cwd)).toBe(false);
    expect(isPathOutsideWorkingDirectory("src/App.tsx", cwd)).toBe(false);
  });
  it("exempts /dev from the external rule", () => {
    expect(isPathOutsideWorkingDirectory("/dev/null", cwd)).toBe(false);
  });
});

describe("isInfrastructureRead", () => {
  const dirs = ["~/.pi/agent"];
  it("allows read-only tools under infrastructure dirs", () => {
    expect(isInfrastructureRead("read", "~/.pi/agent/skills/x/SKILL.md", cwd, dirs)).toBe(true);
    expect(isInfrastructureRead("grep", "~/.pi/agent/settings.json", cwd, dirs)).toBe(true);
  });
  it("never applies to write tools or other directories", () => {
    expect(isInfrastructureRead("write", "~/.pi/agent/settings.json", cwd, dirs)).toBe(false);
    expect(isInfrastructureRead("read", "~/.ssh/id_rsa", cwd, dirs)).toBe(false);
    expect(isInfrastructureRead("read", "/repo/.pi/agent/x", cwd, dirs)).toBe(false);
  });
});
