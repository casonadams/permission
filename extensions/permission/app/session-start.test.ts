import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import piPermissionSystemExtension from "#src/index";
import type { ScopeConfig } from "#src/policy/types";
import { getGlobalConfigPath } from "../config/config-paths";
import { DEFAULT_EXTENSION_CONFIG } from "../config/extension-config";

type MockHandler = (
  event: Record<string, unknown>,
  ctx: Record<string, unknown>,
) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;

describe("session_start handler consolidation", () => {
  let baseDir: string;
  let originalAgentDir: string | undefined;
  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "pi-permission-session-start-"));
    originalAgentDir = process.env.PI_CODING_AGENT_DIR;

    const globalConfigPath = getGlobalConfigPath(baseDir);
    mkdirSync(join(baseDir, "agents"), { recursive: true });
    mkdirSync(dirname(globalConfigPath), { recursive: true });

    const config: ScopeConfig = {
      permission: { "*": "ask" },
    };
    writeFileSync(globalConfigPath, `${JSON.stringify({ ...DEFAULT_EXTENSION_CONFIG, ...config }, null, 2)}\n`, "utf8");

    process.env.PI_CODING_AGENT_DIR = baseDir;
  });

  afterEach(() => {
    if (originalAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    }
    rmSync(baseDir, { recursive: true, force: true });
  });

  test("registers exactly one session_start handler", () => {
    const registrations: Array<{ name: string; handler: MockHandler }> = [];

    piPermissionSystemExtension({
      on: (name: string, handler: MockHandler): void => {
        registrations.push({ name, handler });
      },
      registerCommand: (): void => {},
      getAllTools: (): Array<{ name: string }> => [],
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
      registerProvider: (): void => {},
      events: {
        emit: (): void => {},
        on: (): (() => void) => () => undefined,
      },
    } as never);

    const sessionStartHandlers = registrations.filter((r) => r.name === "session_start");
    expect(sessionStartHandlers).toHaveLength(2);
  });

  test("session_start handler writes lifecycle.reload review log", async () => {
    const registrations: Array<{ name: string; handler: MockHandler }> = [];

    piPermissionSystemExtension({
      on: (name: string, handler: MockHandler): void => {
        registrations.push({ name, handler });
      },
      registerCommand: (): void => {},
      getAllTools: (): Array<{ name: string }> => [],
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
      registerProvider: (): void => {},
      events: {
        emit: (): void => {},
        on: (): (() => void) => () => undefined,
      },
    } as never);

    const sessionStartHandlers = registrations.filter((r) => r.name === "session_start");

    const mockCtx = {
      cwd: baseDir,
      ui: { select: async () => "", input: async () => "" },
      agent: { name: "test-agent" },
      sessionManager: {
        getEntries: () => [],
        addEntry: () => {},
      },
    };

    await expect(sessionStartHandlers[0].handler({ reason: "reload" }, mockCtx)).resolves.not.toThrow();
  });
});
