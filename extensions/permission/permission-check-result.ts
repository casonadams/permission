import { PATH_SURFACES } from "./path-utils";
import { BUILT_IN_TOOL_PERMISSION_NAMES, SPECIAL_PERMISSION_KEYS } from "./permission-surfaces";
import type { Rule, Ruleset } from "./rule";
import { evaluateAnyValue, evaluateFirst } from "./rule";
import type { PermissionCheckResult } from "./types";

export interface BuildCheckResultArgs {
  surface: string;
  values: string[];
  resultExtras: Record<string, unknown>;
  normalizedToolName: string;
  toolName: string;
  fullRules: Ruleset;
}

export function buildCheckResult(args: BuildCheckResultArgs): PermissionCheckResult {
  const { rule, value } = evaluateSurfaceValues(args.surface, args.values, args.fullRules);
  const extras = args.surface === "mcp" ? { ...args.resultExtras, target: value } : args.resultExtras;

  return {
    toolName: args.toolName,
    state: rule.action,
    reason: rule.reason,
    matchedPattern: isConfigOrSessionRule(rule) ? rule.pattern : undefined,
    source: deriveSource(rule, args.normalizedToolName),
    origin: rule.origin,
    ...extras,
  };
}

function evaluateSurfaceValues(surface: string, values: string[], fullRules: Ruleset) {
  return PATH_SURFACES.has(surface)
    ? evaluateAnyValue(surface, values, fullRules)
    : evaluateFirst(surface, values, fullRules);
}

function isConfigOrSessionRule(rule: Rule): boolean {
  return rule.layer === "config" || rule.layer === "session";
}

const FIXED_SOURCES: Record<string, PermissionCheckResult["source"]> = {
  skill: "skill",
  bash: "bash",
};

function deriveSource(rule: Rule, toolName: string): PermissionCheckResult["source"] {
  if (rule.layer === "session") return "session";
  if (toolName === "mcp") return deriveMcpSource(rule);
  if (SPECIAL_PERMISSION_KEYS.has(toolName)) return "special";
  return FIXED_SOURCES[toolName] ?? deriveToolSource(rule, toolName);
}

function deriveMcpSource(rule: Rule): PermissionCheckResult["source"] {
  return rule.layer === "default" ? "default" : "mcp";
}

function deriveToolSource(rule: Rule, toolName: string): PermissionCheckResult["source"] {
  if (BUILT_IN_TOOL_PERMISSION_NAMES.has(toolName)) return "tool";
  return rule.layer === "default" ? "default" : "tool";
}
