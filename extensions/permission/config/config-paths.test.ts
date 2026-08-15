import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getGlobalConfigPath,
  getLegacyExtensionConfigPath,
  getLegacyGlobalPolicyPath,
  getLegacyProjectPolicyPath,
  getProjectConfigPath,
} from "./config-paths";

describe("config-paths", () => {
  const agentDir = "/home/user/.pi/agent";
  const cwd = "/projects/my-app";
  const extensionRoot = "/opt/extensions/permission";

  describe("new layout paths", () => {
    it("getGlobalConfigPath returns permission.json at the agent root (flat layout)", () => {
      expect(getGlobalConfigPath(agentDir)).toBe(join(agentDir, "permission.json"));
    });

    it("getProjectConfigPath returns .pi/agent/permission.json under cwd (flat layout)", () => {
      expect(getProjectConfigPath(cwd)).toBe(join(cwd, ".pi", "agent", "permission.json"));
    });
  });

  describe("legacy paths", () => {
    it("getLegacyGlobalPolicyPath returns pi-permissions.jsonc under agentDir", () => {
      expect(getLegacyGlobalPolicyPath(agentDir)).toBe(join(agentDir, "pi-permissions.jsonc"));
    });

    it("getLegacyProjectPolicyPath returns .pi/agent/pi-permissions.jsonc under cwd", () => {
      expect(getLegacyProjectPolicyPath(cwd)).toBe(join(cwd, ".pi", "agent", "pi-permissions.jsonc"));
    });

    it("getLegacyExtensionConfigPath returns config.json under extensionRoot", () => {
      expect(getLegacyExtensionConfigPath(extensionRoot)).toBe(join(extensionRoot, "config.json"));
    });
  });
});
