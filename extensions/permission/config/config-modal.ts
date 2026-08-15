import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Ruleset } from "../policy/rule";

interface PermissionSystemConfigController {
  configPath: string;
  getActiveAgentConfigRules(): Ruleset;
  summarizeConfig(): string;
}

const USAGE_TEXT = "Usage: /permission [show|path|help]";

type Subcommand = "show" | "path" | "help";

function isSubcommand(value: string): value is Subcommand {
  return value === "show" || value === "path" || value === "help";
}

const SUBCOMMAND_HANDLERS: Record<
  Subcommand,
  (ctx: ExtensionCommandContext, controller: PermissionSystemConfigController) => void
> = {
  show: (ctx, controller) => ctx.ui.notify(`permission: ${controller.summarizeConfig()}`, "info"),
  path: (ctx, controller) => ctx.ui.notify(`permission config: ${controller.configPath}`, "info"),
  help: (ctx) => ctx.ui.notify(USAGE_TEXT, "info"),
};

function handleSubcommand(
  args: string,
  ctx: ExtensionCommandContext,
  controller: PermissionSystemConfigController,
): boolean {
  const normalized = args.trim().toLowerCase();
  if (!normalized) return false;
  if (!isSubcommand(normalized)) {
    ctx.ui.notify(USAGE_TEXT, "warning");
    return true;
  }
  SUBCOMMAND_HANDLERS[normalized](ctx, controller);
  return true;
}

export function registerPermissionSystemCommand(pi: ExtensionAPI, controller: PermissionSystemConfigController): void {
  pi.registerCommand("permission", {
    description: "Show the active permission config summary, its file path, or command help.",
    handler: async (args, ctx) => {
      handleSubcommand(args, ctx, controller);
    },
  });
}
