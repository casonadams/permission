import { describe, expect, it } from "vitest";

import { detectMisplacedPermissionKeys, normalizePermissionSystemConfig } from "./extension-config";

describe("detectMisplacedPermissionKeys", () => {
  it("returns an empty array for an empty record", () => {
    expect(detectMisplacedPermissionKeys({})).toEqual([]);
  });

  it("returns misplaced key names when legacy permission-rule keys are present", () => {
    expect(
      detectMisplacedPermissionKeys({
        defaultPolicy: { tools: "ask" },
        bash: { "git status": "allow" },
      }),
    ).toEqual(["defaultPolicy", "bash"]);
  });

  it("detects all known legacy permission-rule keys", () => {
    expect(
      detectMisplacedPermissionKeys({
        defaultPolicy: {},
        tools: {},
        bash: {},
        mcp: {},
        skills: {},
        special: {},
      }),
    ).toEqual(["defaultPolicy", "tools", "bash", "mcp", "skills", "special"]);
  });

  it("does not flag the flat-format permission key as misplaced", () => {
    expect(detectMisplacedPermissionKeys({ permission: { "*": "ask" } })).toEqual([]);
  });

  it("ignores unknown keys that are not permission-rule keys", () => {
    expect(detectMisplacedPermissionKeys({ someRandomKey: "value" })).toEqual([]);
  });
});

describe("normalizePermissionSystemConfig", () => {
  it("returns an empty config regardless of the input", () => {
    expect(normalizePermissionSystemConfig({ unknownSetting: true })).toEqual({});
    expect(normalizePermissionSystemConfig({})).toEqual({});
  });
});
