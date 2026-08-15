import { isDenyWithReason, isPermissionState } from "../shared/common";
import { isPatternMap } from "./permission-merge";
import type { Rule, Ruleset } from "./rule";
import type { FlatPermissionConfig, PatternValue } from "./types";

export function normalizeFlatConfig(permission: FlatPermissionConfig): Ruleset {
  const rules: Rule[] = [];
  for (const [surface, value] of Object.entries(permission)) {
    if (typeof value === "string") pushStringRule(rules, surface, value);
    else if (isPatternMap(value)) pushPatternRules(rules, surface, value);
  }
  return rules;
}

function pushStringRule(rules: Rule[], surface: string, value: string): void {
  if (isPermissionState(value)) rules.push({ surface, pattern: "*", action: value, origin: "builtin" });
}

function pushPatternRules(rules: Rule[], surface: string, map: Record<string, PatternValue>): void {
  for (const [pattern, action] of Object.entries(map)) {
    if (isDenyWithReason(action)) {
      rules.push({ surface, pattern, action: "deny", reason: action.reason, origin: "builtin" });
    } else if (isPermissionState(action)) {
      rules.push({ surface, pattern, action, origin: "builtin" });
    }
  }
}
