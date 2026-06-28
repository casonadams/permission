import type { DenyWithReason, PermissionState } from "./types";

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Returns `raw` if it is an array of strings; otherwise `undefined`. */
export function normalizeOptionalStringArray(raw: unknown): string[] | undefined {
  return Array.isArray(raw) && raw.every((p): p is string => typeof p === "string") ? raw : undefined;
}

/** Returns `raw` if it is a positive integer; otherwise `undefined`. */
export function normalizeOptionalPositiveInt(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

export function isPermissionState(value: unknown): value is PermissionState {
  return value === "allow" || value === "deny" || value === "ask";
}

/**
 * Narrow type guard: a raw value representing a DenyWithReason object.
 * Accepts `{ action: "deny" }` and `{ action: "deny", reason: "…" }`.
 * Rejects a non-string `reason` to keep malformed config out of the rule set.
 */
export function isDenyWithReason(value: unknown): value is DenyWithReason {
  if (!isPlainRecord(value)) return false;

  return value.action === "deny" && hasValidDenyReason(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidDenyReason(value: Record<string, unknown>): boolean {
  return value.reason === undefined || typeof value.reason === "string";
}

type StackNode = { indent: number; target: Record<string, unknown> };

type ParsedYamlLine = { indent: number; key: string; rawValue: string };

export function parseSimpleYamlMap(input: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: StackNode[] = [{ indent: -1, target: root }];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = parseYamlLine(rawLine);
    if (!line) continue;
    addYamlLineToStack(line, stack);
  }

  return root;
}

function parseYamlLine(rawLine: string): ParsedYamlLine | null {
  const trimmedStart = rawLine.trimStart();
  if (!trimmedStart.trim() || trimmedStart.startsWith("#")) return null;

  const line = rawLine.trim();
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) return null;

  return {
    indent: rawLine.length - trimmedStart.length,
    key: unquoteScalar(line.slice(0, separatorIndex).trim()),
    rawValue: line.slice(separatorIndex + 1).trim(),
  };
}

function addYamlLineToStack(line: ParsedYamlLine, stack: StackNode[]): void {
  while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) {
    stack.pop();
  }

  const current = stack[stack.length - 1].target;
  if (line.rawValue) {
    current[line.key] = unquoteScalar(line.rawValue);
    return;
  }

  const child: Record<string, unknown> = {};
  current[line.key] = child;
  stack.push({ indent: line.indent, target: child });
}

function unquoteScalar(value: string): string {
  const quoted = hasMatchingQuotes(value, '"') || hasMatchingQuotes(value, "'");
  return quoted ? value.slice(1, -1) : value;
}

function hasMatchingQuotes(value: string, quote: string): boolean {
  return value.startsWith(quote) && value.endsWith(quote);
}

export function extractFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return "";
  }

  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    return "";
  }

  return normalized.slice(4, end);
}
