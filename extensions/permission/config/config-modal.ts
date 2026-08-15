import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Ruleset } from "../policy/rule";

interface PermissionSystemConfigController {
  /** Precomputed global config file path. */
  configPath: string;
  /** Returns the composed config-layer ruleset for the active agent scope. */
  getActiveAgentConfigRules(): Ruleset;
  /** Returns a short summary of the currently effective permission rules. */
  summarizeConfig(): string;
}

const USAGE_TEXT = "Usage: /permission-system [show|path|help]";

type Subcommand = "show" | "path" | "help";

function isSubcommand(value: string): value is Subcommand {
  return value === "show" || value === "path" || value === "help";
}

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
  switch (normalized) {
    case "show":
      ctx.ui.notify(`permission-system: ${controller.summarizeConfig()}`, "info");
      return true;
    case "path":
      ctx.ui.notify(`permission-system config: ${controller.configPath}`, "info");
      return true;
    case "help":
      ctx.ui.notify(USAGE_TEXT, "info");
      return true;
  }
}

export function registerPermissionSystemCommand(pi: ExtensionAPI, controller: PermissionSystemConfigController): void {
  pi.registerCommand("permission-system", {
    description: "Show the active permission config summary, its file path, or command help.",
    handler: async (args, ctx) => {
      handleSubcommand(args, ctx, controller);
    },
  });
}