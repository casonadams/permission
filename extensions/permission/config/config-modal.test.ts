import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { Rule, Ruleset } from "#src/policy/rule";
import { loadUnifiedConfig } from "./config-loader";
import { registerPermissionSystemCommand } from "./config-modal";
import type { CommandConfigStore } from "./config-store";
import {
  DEFAULT_EXTENSION_CONFIG,
  normalizePermissionSystemConfig,
  type PermissionSystemExtensionConfig,
} from "./extension-config";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getSettingsListTheme: () => ({}),
}));

vi.mock("@earendil-works/pi-tui", () => ({
  SettingsList: class {
    handleInput(): void {}
    updateValue(): void {}
    render(): string[] {
      return [];
    }
    invalidate(): void {}
  },
}));

type Notification = { message: string; level: "info" | "warning" | "error" };

type CommandContextStub = {
  hasUI: boolean;
  ui: {
    notify(message: string, level: "info" | "warning" | "error"): void;
    custom<T>(renderer: (...args: unknown[]) => unknown, options?: unknown): Promise<T>;
  };
};

function createCommandContext(hasUI: boolean): {
  ctx: CommandContextStub;
  notifications: Notification[];
  getCustomCalls(): number;
} {
  const notifications: Notification[] = [];
  let customCalls = 0;

  return {
    ctx: {
      hasUI,
      ui: {
        notify(message: string, level: "info" | "warning" | "error") {
          notifications.push({ message, level });
        },
        async custom<T>(_renderer: (...args: unknown[]) => unknown, _options?: unknown): Promise<T> {
          customCalls += 1;
          return undefined as T;
        },
      },
    },
    notifications,
    getCustomCalls: () => customCalls,
  };
}

function lastNotification(notifications: Notification[]): Notification {
  return notifications[notifications.length - 1];
}

type CommandDefinition = {
  description: string;
  getArgumentCompletions?: (
    argumentPrefix: string,
  ) => Array<{ value: string; label: string; description?: string }> | null;
  handler: (args: string, ctx: CommandContextStub) => Promise<void>;
};

function registerTestCommand(configPath: string, configStore: CommandConfigStore): CommandDefinition {
  const controller = {
    config: configStore,
    configPath,
    getActiveAgentConfigRules: () => [] as Ruleset,
  };
  let definition: CommandDefinition | null = null;
  registerPermissionSystemCommand(
    {
      registerCommand(_name: string, nextDefinition: CommandDefinition) {
        definition = nextDefinition;
      },
    } as never,
    controller,
  );
  return definition!;
}

test("permission-system command completions expose top-level config actions", () => {
  withTempConfig("pi-permission-system-command-completions-", assertCommandCompletions);
});

function withTempConfig(prefix: string, run: (configPath: string) => void): void {
  const baseDir = mkdtempSync(join(tmpdir(), prefix));
  try {
    run(join(baseDir, "config.json"));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
}

function assertCommandCompletions(configPath: string): void {
  let config: PermissionSystemExtensionConfig = { ...DEFAULT_EXTENSION_CONFIG };
  const definition = registerTestCommand(configPath, {
    current: () => config,
    save: (next) => {
      config = next;
    },
  });
  const complete = requireCompletions(definition);

  expect(complete("")?.map((item) => item.value)).toEqual(["show", "path", "reset", "help"]);
  expect(complete("pa")?.map((item) => item.value)).toEqual(["path"]);
  expect(complete("path extra")).toBe(null);
  expect(complete("zzz")).toBe(null);
}

function requireCompletions(definition: CommandDefinition): NonNullable<CommandDefinition["getArgumentCompletions"]> {
  expect(definition.getArgumentCompletions).toBeTypeOf("function");
  return definition.getArgumentCompletions!;
}

test("permission-system command handlers manage config summary, persistence, and modal routing", async () => {
  const baseDir = mkdtempSync(join(tmpdir(), "pi-permission-system-command-"));
  const configPath = join(baseDir, "config.json");
  let config: PermissionSystemExtensionConfig = {
    debugLog: true,
    permissionReviewLog: false,
    yoloMode: true,
  };

  try {
    writeFileSync(configPath, `${JSON.stringify(normalizePermissionSystemConfig(config), null, 2)}\n`, "utf-8");

    const configStore: CommandConfigStore = {
      current: () => config,
      save: (next) => {
        const currentConfig = normalizePermissionSystemConfig(loadUnifiedConfig(configPath).config);
        const normalized = normalizePermissionSystemConfig(next);
        writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
        config = normalizePermissionSystemConfig(loadUnifiedConfig(configPath).config);
        expect(config).not.toEqual(currentConfig);
      },
    };
    const controller = {
      config: configStore,
      configPath,
      getActiveAgentConfigRules: () => [] as Ruleset,
    };

    let registeredName = "";
    let definition: {
      description: string;
      getArgumentCompletions?: (
        argumentPrefix: string,
      ) => Array<{ value: string; label: string; description?: string }> | null;
      handler: (args: string, ctx: CommandContextStub) => Promise<void>;
    } | null = null;

    registerPermissionSystemCommand(
      {
        registerCommand(name: string, nextDefinition: typeof definition) {
          registeredName = name;
          definition = nextDefinition;
        },
      } as never,
      controller,
    );

    expect(registeredName).toBe("permission-system");
    expect(definition!.description).toContain("Configure pi-permission-system");

    const infoCtx = createCommandContext(true);
    await definition!.handler("show", infoCtx.ctx);
    expect(lastNotification(infoCtx.notifications).message).toContain("yoloMode=on");
    expect(lastNotification(infoCtx.notifications).message).toContain("debugLog=on");

    await definition!.handler("path", infoCtx.ctx);
    expect(lastNotification(infoCtx.notifications).message).toBe(`permission-system config: ${configPath}`);

    await definition!.handler("help", infoCtx.ctx);
    expect(lastNotification(infoCtx.notifications).message).toContain("Usage: /permission-system");

    await definition!.handler("reset", infoCtx.ctx);
    expect(config).toEqual(DEFAULT_EXTENSION_CONFIG);
    expect(lastNotification(infoCtx.notifications).message).toBe("Permission system settings reset to defaults.");

    const persisted = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(persisted).toEqual(DEFAULT_EXTENSION_CONFIG);

    await definition!.handler("unknown", infoCtx.ctx);
    expect(lastNotification(infoCtx.notifications).level).toBe("warning");
    expect(lastNotification(infoCtx.notifications).message).toContain("Usage: /permission-system");

    const headlessCtx = createCommandContext(false);
    await definition!.handler("", headlessCtx.ctx);
    expect(lastNotification(headlessCtx.notifications).message).toBe(
      "/permission-system requires interactive TUI mode.",
    );

    const modalCtx = createCommandContext(true);
    await definition!.handler("", modalCtx.ctx);
    expect(modalCtx.getCustomCalls()).toBe(1);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("show output includes rule origins when getComposedRules is provided", async () => {
  const config = { ...DEFAULT_EXTENSION_CONFIG };
  const composedRules: Rule[] = [
    {
      surface: "read",
      pattern: "*",
      action: "allow",
      layer: "config",
      origin: "global",
    },
    {
      surface: "bash",
      pattern: "rm *",
      action: "deny",
      layer: "config",
      origin: "project",
    },
  ];

  const controller = {
    config: { current: () => config, save: () => {} } as CommandConfigStore,
    configPath: "/fake/config.json",
    getActiveAgentConfigRules: () => composedRules,
  };

  let definition: {
    handler: (args: string, ctx: CommandContextStub) => Promise<void>;
  } | null = null;

  registerPermissionSystemCommand(
    {
      registerCommand(_name: string, nextDef: typeof definition) {
        definition = nextDef;
      },
    } as never,
    controller,
  );

  const ctx = createCommandContext(true);
  await definition!.handler("show", ctx.ctx);
  const msg = lastNotification(ctx.notifications).message;

  expect(msg).toContain("global");
  expect(msg).toContain("project");
  expect(msg).toContain("read");
  expect(msg).toContain("bash");
});

test("show output omits rule summary when getComposedRules is not provided", async () => {
  const config = { ...DEFAULT_EXTENSION_CONFIG, yoloMode: true };

  const controller = {
    config: { current: () => config, save: () => {} } as CommandConfigStore,
    configPath: "/fake/config.json",
    getActiveAgentConfigRules: () => [] as Ruleset,
  };

  let definition: {
    handler: (args: string, ctx: CommandContextStub) => Promise<void>;
  } | null = null;

  registerPermissionSystemCommand(
    {
      registerCommand(_name: string, nextDef: typeof definition) {
        definition = nextDef;
      },
    } as never,
    controller,
  );

  const ctx = createCommandContext(true);
  await definition!.handler("show", ctx.ctx);
  const msg = lastNotification(ctx.notifications).message;

  // Config knobs still present.
  expect(msg).toContain("yoloMode=on");
  // No rule annotation lines.
  expect(msg).not.toContain("(global)");
});
