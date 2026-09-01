import { homedir } from "node:os";
import { join } from "node:path";

export type PermissionState = "allow" | "deny" | "ask";

export interface PolicyRule {
  readonly surface: string;
  readonly pattern: string;
  readonly state: PermissionState;
  readonly reason?: string;
}

export interface CompiledRule {
  readonly rule: PolicyRule;
  readonly surfaceRe: RegExp;
  readonly patternRe: RegExp;
}

export interface Decision {
  readonly state: PermissionState;
  readonly reason?: string;
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

export function decideValue(rules: readonly CompiledRule[], surface: string, value: string): Decision {
  for (let i = rules.length - 1; i >= 0; i--) {
    if (ruleMatches(rules[i], surface, value)) {
      return { state: rules[i].rule.state, reason: rules[i].rule.reason };
    }
  }
  return { state: "ask" };
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
