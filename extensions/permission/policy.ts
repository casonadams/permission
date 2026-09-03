import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BASELINE_BASH_ALLOW, BASELINE_TOOL_ALLOW } from "./baseline";
import { type CompiledRule, compileRule, type PermissionState, type PolicyRule } from "./match";

export interface Policy {
  readonly rules: readonly CompiledRule[];
}

export interface LoadPolicyOptions {
  readonly globalPath: string;
  readonly projectPath?: string | null;
}

export interface LoadPolicyResult {
  readonly policy: Policy;
  readonly issues: readonly string[];
}

export interface ScopeRules {
  readonly rules: readonly PolicyRule[];
  readonly universal?: PermissionState;
}

export function parsePolicyScope(raw: unknown): { scope: ScopeRules; issues: string[] } {
  const issues: string[] = [];
  return { scope: normalizeScope(raw, issues), issues };
}

interface ScopeFile {
  readonly scope: ScopeRules | null;
  readonly issues: readonly string[];
}

export function loadPolicy(options: LoadPolicyOptions): LoadPolicyResult {
  const issues: string[] = [];
  const global = readScopeFile(options.globalPath, issues);
  const project = options.projectPath ? readScopeFile(options.projectPath, issues) : null;
  const policy = buildPolicy(global.scope, project?.scope ?? null);
  return { policy, issues };
}

export function buildPolicy(global: ScopeRules | null, project: ScopeRules | null): Policy {
  const merged = mergeScopeRules(global?.rules ?? [], project?.rules ?? []);
  const universal = project?.universal ?? global?.universal ?? "ask";
  const defaultRule: PolicyRule = { surface: "*", pattern: "*", state: universal, synthetic: true };

  const baselineToolRules: PolicyRule[] = BASELINE_TOOL_ALLOW.filter(
    (tool) => !merged.some((rule) => rule.surface === tool),
  ).map((surface) => ({ surface, pattern: "*", state: "allow", synthetic: true }));

  const baselineBashRules: PolicyRule[] = BASELINE_BASH_ALLOW.map((pattern) => ({
    surface: "bash",
    pattern,
    state: "allow",
    synthetic: true,
  }));

  const catchAlls = merged.filter((rule) => rule.pattern === "*");
  const specifics = merged.filter((rule) => rule.pattern !== "*");

  return {
    rules: [defaultRule, ...catchAlls, ...baselineToolRules, ...baselineBashRules, ...specifics].map(compileRule),
  };
}

function mergeScopeRules(base: readonly PolicyRule[], override: readonly PolicyRule[]): PolicyRule[] {
  const result = [...base];
  const indexByKey = new Map(result.map((rule, index) => [ruleKey(rule), index]));
  for (const rule of override) {
    const existing = indexByKey.get(ruleKey(rule));
    if (existing === undefined) {
      indexByKey.set(ruleKey(rule), result.length);
      result.push(rule);
    } else {
      result[existing] = rule;
    }
  }
  return result;
}

function ruleKey(rule: PolicyRule): string {
  return `${rule.surface}\u0000${rule.pattern}`;
}

function readScopeFile(path: string, issues: string[]): ScopeFile {
  if (!existsSync(path)) return { scope: null, issues: [] };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed: unknown = JSON.parse(stripJsonComments(raw));
    return { scope: normalizeScope(parsed, issues), issues: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { scope: null, issues: [`Failed to read config at '${path}': ${message}`] };
  }
}

function normalizeScope(raw: unknown, issues: string[]): ScopeRules {
  const record = isPlainRecord(raw) ? raw : {};
  const permission = record.permission;
  if (permission === undefined) return { rules: [] };
  if (!isPlainRecord(permission)) {
    issues.push("Invalid permission config at 'permission': expected an object");
    return { rules: [] };
  }

  const rules: PolicyRule[] = [];
  let universal: PermissionState | undefined;
  for (const [surface, value] of Object.entries(permission)) {
    if (surface === "*") {
      universal = normalizeUniversal(value, issues);
      continue;
    }
    rules.push(...normalizeSurfaceRules(surface, value, issues));
  }
  return { rules, universal };
}

function normalizeUniversal(value: unknown, issues: string[]): PermissionState | undefined {
  if (typeof value === "string") return normalizeState(value, issues, "permission.*");
  if (isPlainRecord(value)) normalizeSurfaceRules("*", value, issues);
  return undefined;
}

function normalizeSurfaceRules(surface: string, value: unknown, issues: string[]): PolicyRule[] {
  if (typeof value === "string") return normalizeStateRule(surface, "*", value, issues);
  if (!isPlainRecord(value)) {
    issues.push(`Invalid permission config at 'permission.${surface}': expected allow, deny, ask, or pattern map`);
    return [];
  }
  const rules: PolicyRule[] = [];
  for (const [pattern, action] of Object.entries(value)) {
    rules.push(...normalizePatternRule(surface, pattern, action, issues));
  }
  return rules;
}

function normalizePatternRule(surface: string, pattern: string, action: unknown, issues: string[]): PolicyRule[] {
  if (isPlainRecord(action)) return normalizeDenyObjectRule(surface, pattern, action, issues);
  return normalizeStateRule(surface, pattern, action, issues);
}

function normalizeStateRule(surface: string, pattern: string, action: unknown, issues: string[]): PolicyRule[] {
  if (!isPermissionState(action)) {
    issues.push(
      `Invalid permission config at 'permission.${surface}.${pattern}': expected allow, deny, ask, or deny object`,
    );
    return [];
  }
  return [{ surface, pattern, state: action }];
}

function normalizeDenyObjectRule(
  surface: string,
  pattern: string,
  action: Record<string, unknown>,
  issues: string[],
): PolicyRule[] {
  if (action.action !== "deny" || (action.reason !== undefined && typeof action.reason !== "string")) {
    issues.push(
      `Invalid permission config at 'permission.${surface}.${pattern}': expected allow, deny, ask, or deny object`,
    );
    return [];
  }
  const reason = typeof action.reason === "string" ? action.reason : undefined;
  return [{ surface, pattern, state: "deny", reason }];
}

function normalizeState(value: unknown, issues: string[], location: string): PermissionState | undefined {
  if (isPermissionState(value)) return value;
  issues.push(`Invalid permission config at '${location}': expected allow, deny, or ask`);
  return undefined;
}

export function stripJsonComments(input: string): string {
  let output = "";
  let index = 0;
  while (index < input.length) {
    const segment = consumeSegment(input, index);
    output += segment.output;
    index = segment.nextIndex;
  }
  return output;
}

interface ScanSegment {
  output: string;
  nextIndex: number;
}

function consumeSegment(input: string, index: number): ScanSegment {
  const char = input[index];
  const next = input[index + 1] ?? "";
  if (char === "/" && next === "/") return consumeLineComment(input, index);
  if (char === "/" && next === "*") return consumeBlockComment(input, index);
  if (char === '"' || char === "'") return consumeString(input, index);
  return { output: char, nextIndex: index + 1 };
}

function consumeLineComment(input: string, start: number): ScanSegment {
  const newlineIndex = input.indexOf("\n", start);
  if (newlineIndex === -1) return { output: "", nextIndex: input.length };
  return { output: "\n", nextIndex: newlineIndex + 1 };
}

function consumeBlockComment(input: string, start: number): ScanSegment {
  const closeIndex = input.indexOf("*/", start + 2);
  if (closeIndex === -1) return { output: "", nextIndex: input.length };
  return { output: "", nextIndex: closeIndex + 2 };
}

function consumeString(input: string, start: number): ScanSegment {
  const quote = input[start];
  let output = quote;
  let index = start + 1;
  let escaping = false;
  while (index < input.length) {
    const char = input[index];
    output += char;
    index++;
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === quote) break;
  }
  return { output, nextIndex: index };
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPermissionState(value: unknown): value is PermissionState {
  return value === "allow" || value === "deny" || value === "ask";
}

function applyAllowRule(permission: Record<string, unknown>, surface: string, pattern: string): void {
  const current = permission[surface];
  const isObj = isPlainRecord(current);

  if (pattern === "*") {
    if (isObj) (current as Record<string, unknown>)["*"] = "allow";
    else permission[surface] = "allow";
    return;
  }

  if (isObj) {
    (current as Record<string, unknown>)[pattern] = "allow";
  } else if (typeof current === "string") {
    permission[surface] = { "*": current, [pattern]: "allow" };
  } else {
    permission[surface] = { [pattern]: "allow" };
  }
}

function loadDocForSaving(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(stripJsonComments(raw));
    return isPlainRecord(parsed) ? parsed : {};
  } catch {
    throw new Error(`Cannot save rule: '${filePath}' is malformed`);
  }
}

function ensurePermissionRoot(doc: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainRecord(doc.permission)) {
    const root: Record<string, unknown> = {};
    doc.permission = root;
    return root;
  }
  return doc.permission;
}

export function saveAllowRules(filePath: string, rules: readonly { surface: string; pattern: string }[]): void {
  if (rules.length === 0) return;
  const doc = loadDocForSaving(filePath);
  const permission = ensurePermissionRoot(doc);

  for (const { surface, pattern } of rules) {
    applyAllowRule(permission, surface, pattern);
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf-8");
}
