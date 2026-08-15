import { PATH_SURFACES } from "../paths/path-utils";
import type { PermissionState } from "./types";
import { wildcardMatch } from "./wildcard-matcher";

export type RuleOrigin = "global" | "project" | "agent" | "project-agent" | "builtin" | "baseline" | "session";

export interface Rule {
  surface: string;
  pattern: string;
  action: PermissionState;
  reason?: string;
  layer?: "default" | "baseline" | "config" | "session";
  origin: RuleOrigin;
}

export type Ruleset = Rule[];

type EvaluateArgs = [rules: Ruleset, defaultAction?: PermissionState, platform?: NodeJS.Platform];
type EvaluateAnyValueArgs = [rules: Ruleset, platform?: NodeJS.Platform];
type RuleMatchInput = { surface: string; value: string; platform: NodeJS.Platform };

export function evaluate(surface: string, pattern: string, ...args: EvaluateArgs): Rule {
  const [rules, defaultAction, platform = process.platform] = args;
  const rule = rules.findLast((r) => ruleMatches(r, { surface, value: pattern, platform }));
  if (rule !== undefined) return rule;
  return {
    surface,
    pattern,
    action: defaultAction ?? "ask",
    origin: "builtin",
  };
}

function pathMatchOptions(
  surface: string,
  platform: NodeJS.Platform,
): { caseInsensitive: true; windowsSeparators: true } | undefined {
  return platform === "win32" && PATH_SURFACES.has(surface)
    ? { caseInsensitive: true, windowsSeparators: true }
    : undefined;
}

function ruleMatches(rule: Rule, input: RuleMatchInput): boolean {
  const matchOptions = pathMatchOptions(input.surface, input.platform);
  return wildcardMatch(rule.surface, input.surface) && wildcardMatch(rule.pattern, input.value, matchOptions);
}

export function evaluateMostRestrictive(
  surface: string,
  values: string[],
  rules: Ruleset,
): { rule: Rule; value: string } | null {
  let worst: { rule: Rule; value: string } | null = null;
  for (const value of values) {
    const rule = evaluate(surface, value, rules);
    if (rule.action === "deny") return { rule, value };
    if (rule.action === "ask" && worst === null) {
      worst = { rule, value };
    }
  }
  return worst;
}

export function evaluateFirst(surface: string, values: string[], rules: Ruleset): { rule: Rule; value: string } {
  for (const value of values) {
    const rule = evaluate(surface, value, rules);
    if (rule.layer !== "default") {
      return { rule, value };
    }
  }
  const fallbackValue = values[0] ?? "*";
  return {
    rule: evaluate(surface, fallbackValue, rules),
    value: fallbackValue,
  };
}

export function evaluateAnyValue(
  surface: string,
  values: string[],
  ...args: EvaluateAnyValueArgs
): { rule: Rule; value: string } {
  const [rules, platform = process.platform] = args;
  const fallbackValue = values[0] ?? "*";
  const rule = rules.findLast((r) => values.some((value) => ruleMatches(r, { surface, value, platform })));
  if (rule !== undefined) {
    return {
      rule,
      value: values.find((value) => ruleMatches(rule, { surface, value, platform })) ?? fallbackValue,
    };
  }
  return {
    rule: evaluate(surface, fallbackValue, rules),
    value: fallbackValue,
  };
}
