import { type ExtensionAPI, type ExtensionCommandContext, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { SettingsList } from "@earendil-works/pi-tui";
import {
  applySetting,
  buildSettingItems,
  type ConfigCommandAction,
  cloneDefaultConfig,
  getArgumentCompletions,
  isConfigCommandAction,
  summarizeConfig,
  syncSettingValues,
  USAGE_TEXT,
} from "./config-modal-model";
import type { CommandConfigStore } from "./config-store";
import type { Ruleset } from "./rule";

interface PermissionSystemConfigController {
  config: CommandConfigStore;
  /** Precomputed global config file path. */
  configPath: string;
  /** Returns the composed config-layer ruleset for the active agent scope. */
  getActiveAgentConfigRules(): Ruleset;
}

async function openSettingsModal(
  ctx: ExtensionCommandContext,
  controller: PermissionSystemConfigController,
): Promise<void> {
  const overlayOptions = {
    anchor: "center" as const,
    width: 82,
    maxHeight: "85%" as const,
    margin: 1,
  };

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- ctx.ui.custom<void> is valid; rule does not allow void in generic fn call type args
  await ctx.ui.custom<void>(
    (...args) => {
      const done = args[3] as () => void;
      let current = controller.config.current();
      const settingsList = new SettingsList(
        buildSettingItems(current),
        10,
        getSettingsListTheme(),
        (id, newValue) => {
          current = applySetting(current, id, newValue);
          controller.config.save(current, ctx);
          current = controller.config.current();
          syncSettingValues(settingsList, current);
        },
        () => done(),
      );

      return settingsList;
    },
    { overlay: true, overlayOptions },
  );
}

function handleArgs(args: string, ctx: ExtensionCommandContext, controller: PermissionSystemConfigController): boolean {
  const normalized = args.trim().toLowerCase();
  if (!normalized) return false;
  return handleKnownArg(normalized, ctx, controller) ?? unknownArg(ctx);
}

const COMMAND_HANDLERS: Record<
  ConfigCommandAction,
  (ctx: ExtensionCommandContext, controller: PermissionSystemConfigController) => true
> = {
  show: showConfig,
  path: showConfigPath,
  reset: resetConfig,
  help: showHelp,
};

function handleKnownArg(
  normalized: string,
  ctx: ExtensionCommandContext,
  controller: PermissionSystemConfigController,
): boolean | null {
  if (!isConfigCommandAction(normalized)) return null;
  return COMMAND_HANDLERS[normalized](ctx, controller);
}

function showConfig(ctx: ExtensionCommandContext, controller: PermissionSystemConfigController): true {
  const rules = controller.getActiveAgentConfigRules();
  ctx.ui.notify(`permission-system: ${summarizeConfig(controller.config.current(), rules)}`, "info");
  return true;
}

function showConfigPath(ctx: ExtensionCommandContext, controller: PermissionSystemConfigController): true {
  ctx.ui.notify(`permission-system config: ${controller.configPath}`, "info");
  return true;
}

function resetConfig(ctx: ExtensionCommandContext, controller: PermissionSystemConfigController): true {
  controller.config.save(cloneDefaultConfig(), ctx);
  ctx.ui.notify("Permission system settings reset to defaults.", "info");
  return true;
}

function showHelp(ctx: ExtensionCommandContext): true {
  ctx.ui.notify(USAGE_TEXT, "info");
  return true;
}

function unknownArg(ctx: ExtensionCommandContext): boolean {
  ctx.ui.notify(USAGE_TEXT, "warning");
  return true;
}

export function registerPermissionSystemCommand(pi: ExtensionAPI, controller: PermissionSystemConfigController): void {
  pi.registerCommand("permission-system", {
    description: "Configure pi-permission-system logging and yolo-mode behavior",
    getArgumentCompletions,
    handler: async (args, ctx) => {
      if (handleArgs(args, ctx, controller)) return;
      if (!ctx.hasUI) {
        ctx.ui.notify("/permission-system requires interactive TUI mode.", "warning");
        return;
      }
      await openSettingsModal(ctx, controller);
    },
  });
}
