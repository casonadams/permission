import { homedir } from "node:os";
import { join } from "node:path";

export type PermissionState = "allow" | "deny" | "ask";

export interface PolicyRule {
  readonly surface: string;
  readonly pattern: string;
  readonly state: PermissionState;
  readonly reason?: string;
  readonly synthetic?: boolean;
}

export interface CompiledRule {
  readonly rule: PolicyRule;
  readonly surfaceRe: RegExp;
  readonly patternRe: RegExp;
}

export interface Decision {
  readonly state: PermissionState;
  readonly reason?: string;
  /** Undefined when no configured rule matched and only the universal fallback applied. */
  readonly matchedPattern?: string;
}

const HOME_PREFIXES = ["~/", "$HOME/"] as const;

export function expandHomePath(value: string): string {
  if (value === "~" || value === "$HOME") return homedir();
  for (const prefix of HOME_PREFIXES) {
    if (value.startsWith(prefix)) return join(homedir(), value.slice(prefix.length));
  }
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trailingWildcardOptional(escaped: string): string {
  if (escaped.endsWith(" .*")) return `${escaped.slice(0, -3)}( .*)?`;
  if (escaped.endsWith("/.*") && escaped.length > 3) return `${escaped.slice(0, -3)}(?:/.*)?`;
  return escaped;
}

export function compilePattern(pattern: string): RegExp {
  const escaped = trailingWildcardOptional(
    expandHomePath(pattern)
      .split("*")
      .map((part) => escapeRegExp(part).replaceAll("\\?", "."))
      .join(".*"),
  );
  return new RegExp(`^${escaped}$`, "s");
}

export function compileRule(rule: PolicyRule): CompiledRule {
  return { rule, surfaceRe: compilePattern(rule.surface), patternRe: compilePattern(rule.pattern) };
}

function ruleMatches(compiled: CompiledRule, surface: string, value: string): boolean {
  return compiled.surfaceRe.test(surface) && compiled.patternRe.test(value);
}

function lastMatch(rules: readonly CompiledRule[], surface: string, value: string): Decision | null {
  for (let i = rules.length - 1; i >= 0; i--) {
    const compiled = rules[i];
    if (!ruleMatches(compiled, surface, value)) continue;
    const { rule } = compiled;
    return {
      state: rule.state,
      reason: rule.reason,
      matchedPattern: rule.synthetic ? undefined : rule.pattern,
    };
  }
  return null;
}

function lastMatchAny(rules: readonly CompiledRule[], surface: string, values: readonly string[]): Decision | null {
  for (let i = rules.length - 1; i >= 0; i--) {
    const compiled = rules[i];
    if (!values.some((value) => ruleMatches(compiled, surface, value))) continue;
    const { rule } = compiled;
    return {
      state: rule.state,
      reason: rule.reason,
      matchedPattern: rule.synthetic ? undefined : rule.pattern,
    };
  }
  return null;
}

/**
 * v1-compatible evaluation over a value set. "first" (tool/bash/mcp/skill surfaces)
 * returns the first value with a real rule match; "any" (path surface) takes the last
 * rule matching any projection. Both fall back to the universal default state.
 */
export function decideSurface(
  rules: readonly CompiledRule[],
  surface: string,
  values: readonly string[],
  kind: "first" | "any",
): Decision {
  if (kind === "any") {
    return lastMatchAny(rules, surface, values) ?? { state: "ask" };
  }
  for (const value of values) {
    const match = lastMatch(rules, surface, value);
    if (match && match.matchedPattern !== undefined) return match;
  }
  return lastMatch(rules, surface, values[0] ?? "*") ?? { state: "ask" };
}

export function foldMostRestrictive(decisions: readonly Decision[]): Decision | null {
  let worst: Decision | null = null;
  for (const decision of decisions) {
    if (decision.state === "deny") return decision;
    if (decision.state === "ask" && worst === null) worst = decision;
  }
  return worst;
}

export function isMostRestrictive(a: Decision, b: Decision): Decision {
  const rank: Record<PermissionState, number> = { allow: 0, ask: 1, deny: 2 };
  return rank[a.state] >= rank[b.state] ? a : b;
}
