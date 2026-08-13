import { isDenyWithReason, isPermissionState } from "../shared/common";
import type { Rule, Ruleset } from "./rule";
import type { FlatPermissionConfig, PatternValue } from "./types";

/**
 * Convert a flat permission config into a Ruleset.
 *
 * Each key is a surface name. A string value is shorthand for
 * `{ "*": action }`. An object value maps patterns to actions.
 * A pattern value may be a PermissionState string or a `DenyWithReason`
 * object (`{ action: "deny", reason?: string }`).
 * Invalid action values are silently skipped.
 *
 * The universal fallback key `"*"` is included if present — callers
 * that use `"*"` only for `synthesizeDefaults()` should strip it before
 * calling this function.
 */
export function normalizeFlatConfig(permission: FlatPermissionConfig): Ruleset {
  const rules: Rule[] = [];
  for (const [surface, value] of Object.entries(permission)) {
    if (typeof value === "string") pushStringRule(rules, surface, value);
    else if (isPatternMap(value)) pushPatternRules(rules, surface, value);
  }
  return rules;
}

/** Push the shorthand string rule when it is a valid {@link PermissionState}. */
function pushStringRule(rules: Rule[], surface: string, value: string): void {
  if (isPermissionState(value)) rules.push({ surface, pattern: "*", action: value, origin: "builtin" });
}

/** True when `value` is a non-null pattern→action map. */
function isPatternMap(value: FlatPermissionConfig[string]): value is Record<string, PatternValue> {
  return typeof value === "object" && value !== null;
}

/** Push one {@link Rule} per valid pattern→action entry in a surface map. */
function pushPatternRules(rules: Rule[], surface: string, map: Record<string, PatternValue>): void {
  for (const [pattern, action] of Object.entries(map)) {
    if (isDenyWithReason(action)) {
      rules.push({ surface, pattern, action: "deny", reason: action.reason, origin: "builtin" });
    } else if (isPermissionState(action)) {
      rules.push({ surface, pattern, action, origin: "builtin" });
    }
  }
}
