import type { SettingItem } from "@earendil-works/pi-tui";
import type { Ruleset } from "../policy/rule";
import { MODAL_BOOLEAN_CONFIG_KEYS } from "./config-keys";
import { DEFAULT_EXTENSION_CONFIG, type PermissionSystemExtensionConfig } from "./extension-config";

const ON_OFF = ["on", "off"];
type BooleanSettingId = (typeof MODAL_BOOLEAN_CONFIG_KEYS)[number];

type BooleanSettingDefinition = {
  id: BooleanSettingId;
  label: string;
  description: string;
};

const BOOLEAN_SETTING_METADATA: Record<BooleanSettingId, Omit<BooleanSettingDefinition, "id">> = {
  yoloMode: {
    label: "YOLO mode",
    description: "Auto-approve ask-state permission checks, including subagent approval forwarding",
  },
  permissionReviewLog: {
    label: "Permission review log",
    description: "Write permission request and decision audit events to the extension logs directory",
  },
  debugLog: {
    label: "Debug logging",
    description: "Write verbose permission-system diagnostics to the extension logs directory",
  },
};

const BOOLEAN_SETTINGS: readonly BooleanSettingDefinition[] = MODAL_BOOLEAN_CONFIG_KEYS.map((id) => ({
  id,
  ...BOOLEAN_SETTING_METADATA[id],
}));

export const COMMAND_ARGUMENTS = [
  {
    value: "show",
    label: "Show active settings",
    description: "Display the current permission-system config summary",
  },
  {
    value: "path",
    label: "Show config path",
    description: "Display the config.json path used by pi-permission-system",
  },
  {
    value: "reset",
    label: "Reset defaults",
    description: "Restore default yolo/logging settings and persist them",
  },
  {
    value: "help",
    label: "Show help",
    description: "Display command usage",
  },
] as const;

export type ConfigCommandAction = (typeof COMMAND_ARGUMENTS)[number]["value"];

const COMMAND_USAGE = COMMAND_ARGUMENTS.map((item) => item.value).join("|");

export const USAGE_TEXT = `Usage: /permission-system [${COMMAND_USAGE}] (or run /permission-system with no args to open settings modal)`;

export function isConfigCommandAction(value: string): value is ConfigCommandAction {
  return COMMAND_ARGUMENTS.some((item) => item.value === value);
}

export function cloneDefaultConfig(): PermissionSystemExtensionConfig {
  const config = {} as PermissionSystemExtensionConfig;
  for (const key of MODAL_BOOLEAN_CONFIG_KEYS) {
    config[key] = DEFAULT_EXTENSION_CONFIG[key];
  }
  return config;
}

function toOnOff(value: boolean): string {
  return value ? "on" : "off";
}

function formatRulesSummary(rules: Ruleset): string {
  const configRules = rules.filter((r) => r.layer === "config" && r.origin);
  if (configRules.length === 0) return "";
  const formatted = configRules.map(formatRuleSummary).join(", ");
  return `\n  rules: ${formatted}`;
}

function formatRuleSummary(rule: Ruleset[number]): string {
  const key = rule.pattern === "*" ? rule.surface : `${rule.surface}["${rule.pattern}"]`;
  return `${key}=${rule.action} (${rule.origin})`;
}

export function summarizeConfig(config: PermissionSystemExtensionConfig, rules?: Ruleset): string {
  const knobs = BOOLEAN_SETTINGS.map((setting) => `${setting.id}=${toOnOff(config[setting.id])}`).join(", ");
  const rulesSuffix = rules ? formatRulesSummary(rules) : "";
  return `${knobs}${rulesSuffix}`;
}

export function buildSettingItems(config: PermissionSystemExtensionConfig): SettingItem[] {
  return BOOLEAN_SETTINGS.map((setting) => ({
    id: setting.id,
    label: setting.label,
    description: setting.description,
    currentValue: toOnOff(config[setting.id]),
    values: ON_OFF,
  }));
}

export function applySetting(
  config: PermissionSystemExtensionConfig,
  id: string,
  value: string,
): PermissionSystemExtensionConfig {
  if (!isBooleanSettingId(id)) return config;
  return { ...config, [id]: value === "on" };
}

export function syncSettingValues(
  settingsList: { updateValue(id: string, value: string): void },
  config: PermissionSystemExtensionConfig,
): void {
  for (const setting of BOOLEAN_SETTINGS) {
    settingsList.updateValue(setting.id, toOnOff(config[setting.id]));
  }
}

function isBooleanSettingId(id: string): id is BooleanSettingId {
  return MODAL_BOOLEAN_CONFIG_KEYS.some((key) => key === id);
}

export function getArgumentCompletions(
  argumentPrefix: string,
): Array<{ value: string; label: string; description: string }> | null {
  const normalized = argumentPrefix.trim().toLowerCase();
  if (normalized.includes(" ")) return null;
  const filtered = COMMAND_ARGUMENTS.filter((item) => item.value.startsWith(normalized));
  return filtered.length > 0 ? [...filtered] : null;
}
