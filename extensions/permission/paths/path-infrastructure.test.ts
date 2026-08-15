import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockSpawnSync } = vi.hoisted(() => ({
  mockSpawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: mockSpawnSync,
  default: { spawnSync: mockSpawnSync },
}));

import { discoverGlobalNodeModulesRoot } from "#src/paths/node-modules-discovery";
import { isPiInfrastructureRead } from "#src/paths/path-utils";

describe("discoverGlobalNodeModulesRoot", () => {
  beforeEach(() => {
    mockSpawnSync.mockReset();
    mockSpawnSync.mockReturnValue({ status: 1, stdout: "" });
  });

  test("returns the node_modules dir when the file is inside one", () => {
    const url = "file:///opt/homebrew/lib/node_modules/permission/dist/external-directory.js";
    expect(discoverGlobalNodeModulesRoot(url)).toBe("/opt/homebrew/lib/node_modules");
  });

  test("returns node_modules for a deeply nested file", () => {
    const url = "file:///home/user/.nvm/versions/node/v20/lib/node_modules/permission/src/external-directory.js";
    expect(discoverGlobalNodeModulesRoot(url)).toBe("/home/user/.nvm/versions/node/v20/lib/node_modules");
  });

  test("returns node_modules for a bun global install path", () => {
    const url = "file:///home/user/.bun/install/global/node_modules/permission/dist/external-directory.js";
    expect(discoverGlobalNodeModulesRoot(url)).toBe("/home/user/.bun/install/global/node_modules");
  });

  test("returns the innermost (closest-to-file) node_modules ancestor", () => {
    const url = "file:///opt/lib/node_modules/some-pkg/node_modules/permission/dist/index.js";
    expect(discoverGlobalNodeModulesRoot(url)).toBe("/opt/lib/node_modules/some-pkg/node_modules");
  });

  test("returns null when the file is not inside any node_modules directory", () => {
    const url = "file:///home/user/development/permission/dist/external-directory.js";
    expect(discoverGlobalNodeModulesRoot(url)).toBeNull();
  });

  test("returns null for a root-level file", () => {
    const url = "file:///external-directory.js";
    expect(discoverGlobalNodeModulesRoot(url)).toBeNull();
  });

  test("returns null for an invalid URL", () => {
    expect(discoverGlobalNodeModulesRoot("not-a-url")).toBeNull();
  });

  test("works with the real import.meta.url of this extension (smoke test)", () => {
    const result = discoverGlobalNodeModulesRoot();
    expect(result === null || result.endsWith("node_modules")).toBe(true);
  });

  test("the discovered path includes the permission package directory", () => {
    const url = "file:///opt/homebrew/lib/node_modules/permission/dist/external-directory.js";
    const root = discoverGlobalNodeModulesRoot(url);
    expect(root).not.toBeNull();
    expect(join(root!, "permission")).toBe("/opt/homebrew/lib/node_modules/permission");
  });
});

const INFRA_DIRS = ["/home/user/.pi/agent", "/home/user/.pi/agent/git", "/opt/homebrew/lib/node_modules"];
const CWD = "/home/user/project";

describe("isPiInfrastructureRead", () => {
  test("allows 'read' tool for a file inside agentDir", () => {
    expect(
      isPiInfrastructureRead("read", "/home/user/.pi/agent/extensions/permission/config.json", INFRA_DIRS, CWD),
    ).toBe(true);
  });

  test("allows 'find' tool for a path inside node_modules infra dir", () => {
    expect(isPiInfrastructureRead("find", "/opt/homebrew/lib/node_modules/pi-ask-user/skills", INFRA_DIRS, CWD)).toBe(
      true,
    );
  });

  test("allows 'grep' tool for a path inside agentDir/git", () => {
    expect(isPiInfrastructureRead("grep", "/home/user/.pi/agent/git/some-package/README.md", INFRA_DIRS, CWD)).toBe(
      true,
    );
  });

  test("allows 'ls' tool for a path inside node_modules infra dir", () => {
    expect(isPiInfrastructureRead("ls", "/opt/homebrew/lib/node_modules/permission", INFRA_DIRS, CWD)).toBe(true);
  });

  test("blocks 'write' tool for a file inside agentDir", () => {
    expect(
      isPiInfrastructureRead("write", "/home/user/.pi/agent/extensions/permission/config.json", INFRA_DIRS, CWD),
    ).toBe(false);
  });

  test("blocks 'edit' tool for a file inside node_modules", () => {
    expect(
      isPiInfrastructureRead(
        "edit",
        "/opt/homebrew/lib/node_modules/pi-ask-user/skills/ask-user/SKILL.md",
        INFRA_DIRS,
        CWD,
      ),
    ).toBe(false);
  });

  test("blocks 'bash' tool regardless of path", () => {
    expect(isPiInfrastructureRead("bash", "/opt/homebrew/lib/node_modules/pi-ask-user/SKILL.md", INFRA_DIRS, CWD)).toBe(
      false,
    );
  });

  test("does not allow 'read' for a path outside all infra dirs", () => {
    expect(isPiInfrastructureRead("read", "/etc/passwd", INFRA_DIRS, CWD)).toBe(false);
  });

  test("does not allow 'read' for a path only partially matching an infra dir prefix", () => {
    expect(isPiInfrastructureRead("read", "/home/user/.pi/agent-other/config.json", INFRA_DIRS, CWD)).toBe(false);
  });

  test("allows 'read' for a path inside project-local .pi/npm/", () => {
    expect(isPiInfrastructureRead("read", `${CWD}/.pi/npm/node_modules/some-skill/SKILL.md`, INFRA_DIRS, CWD)).toBe(
      true,
    );
  });

  test("allows 'read' for a path inside project-local .pi/git/", () => {
    expect(isPiInfrastructureRead("read", `${CWD}/.pi/git/github.com/org/skill-repo/SKILL.md`, INFRA_DIRS, CWD)).toBe(
      true,
    );
  });

  test("blocks 'write' for a path inside project-local .pi/npm/", () => {
    expect(isPiInfrastructureRead("write", `${CWD}/.pi/npm/node_modules/some-skill/SKILL.md`, INFRA_DIRS, CWD)).toBe(
      false,
    );
  });

  test("returns false when infrastructureDirs is empty and path is not project-local", () => {
    expect(isPiInfrastructureRead("read", "/etc/passwd", [], CWD)).toBe(false);
  });

  test("returns false when infrastructureDirs is empty but path IS project-local .pi/npm", () => {
    expect(isPiInfrastructureRead("read", `${CWD}/.pi/npm/node_modules/x/SKILL.md`, [], CWD)).toBe(true);
  });
});

describe("isPiInfrastructureRead with glob patterns", () => {
  test("glob entry matches a versioned nested path", () => {
    expect(
      isPiInfrastructureRead(
        "read",
        "/opt/homebrew/Cellar/pi-coding-agent/0.74.0/libexec/lib/node_modules/@earendil-works/pi-coding-agent/SKILL.md",
        ["/opt/homebrew/*/@earendil-works/pi-coding-agent/*"],
        CWD,
      ),
    ).toBe(true);
  });

  test("** behaves the same as * (matches across path separators)", () => {
    expect(
      isPiInfrastructureRead(
        "read",
        "/opt/homebrew/Cellar/pi-coding-agent/0.74.0/libexec/lib/node_modules/@earendil-works/pi-coding-agent/SKILL.md",
        ["/opt/homebrew/**/@earendil-works/pi-coding-agent/**"],
        CWD,
      ),
    ).toBe(true);
  });

  test("glob entry does not match an unrelated path", () => {
    expect(
      isPiInfrastructureRead("read", "/etc/passwd", ["/opt/homebrew/*/@earendil-works/pi-coding-agent/*"], CWD),
    ).toBe(false);
  });

  test("? matches exactly one character", () => {
    expect(isPiInfrastructureRead("read", "/opt/homebrew/X/file.md", ["/opt/homebrew/?/file.md"], CWD)).toBe(true);
  });

  test("? does not match multiple characters", () => {
    expect(isPiInfrastructureRead("read", "/opt/homebrew/abc/file.md", ["/opt/homebrew/?/file.md"], CWD)).toBe(false);
  });

  test("mixed array of plain dirs and glob patterns — both branches work", () => {
    const dirs = ["/home/user/.pi/agent", "/opt/homebrew/*/@earendil-works/pi-coding-agent/*"];
    expect(isPiInfrastructureRead("read", "/home/user/.pi/agent/config.json", dirs, CWD)).toBe(true);
    expect(
      isPiInfrastructureRead(
        "read",
        "/opt/homebrew/Cellar/pi-coding-agent/0.74.0/libexec/lib/node_modules/@earendil-works/pi-coding-agent/SKILL.md",
        dirs,
        CWD,
      ),
    ).toBe(true);
  });

  test("plain entry with ~ prefix matches after home expansion", () => {
    const home = homedir();
    expect(isPiInfrastructureRead("read", `${home}/.pi/agent/config.json`, ["~/.pi/agent"], CWD)).toBe(true);
  });

  test("write tool with a glob-matching path is still rejected", () => {
    expect(
      isPiInfrastructureRead(
        "write",
        "/opt/homebrew/Cellar/pi-coding-agent/0.74.0/libexec/lib/node_modules/@earendil-works/pi-coding-agent/SKILL.md",
        ["/opt/homebrew/**/@earendil-works/pi-coding-agent/**"],
        CWD,
      ),
    ).toBe(false);
  });
});
