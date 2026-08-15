import { prefix } from "../gates/bash-arity";
import { PATH_BEARING_TOOLS } from "../paths/path-utils";
import { deriveApprovalPattern } from "../policy/session-rules";

export interface SessionApprovalSuggestion {
  surface: string;
  pattern: string;
  label: string;
}

export function suggestBashPattern(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) return trimmed;
  const meaningful = prefix(tokens);
  if (meaningful.length >= tokens.length) {
    return `${trimmed}*`;
  }
  return `${meaningful.join(" ")} *`;
}

export function suggestMcpPattern(target: string): string {
  const trimmed = target.trim();

  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    return `${trimmed.slice(0, colonIndex)}:*`;
  }

  const underscoreIndex = trimmed.indexOf("_");
  if (underscoreIndex > 0) {
    return `${trimmed.slice(0, underscoreIndex)}_*`;
  }

  return "*";
}

function buildSessionLabel(pattern: string): string {
  return `Session: ${truncateSessionPattern(pattern, SESSION_LABEL_MAX_LENGTH)}`;
}

const SESSION_LABEL_MAX_LENGTH = 50;
const SESSION_LABEL_ELLIPSIS = "\u2026";

function truncateSessionPattern(pattern: string, maxLength: number): string {
  if (pattern.length <= maxLength) return pattern;
  const cut = findTruncationBoundary(pattern, maxLength);
  return `${pattern.slice(0, cut)}${SESSION_LABEL_ELLIPSIS}`;
}

function findTruncationBoundary(pattern: string, maxLength: number): number {
  const slice = pattern.slice(0, maxLength);
  const lastWildcard = Math.max(slice.lastIndexOf("*"), slice.lastIndexOf(" "));
  return lastWildcard > 0 ? lastWildcard : maxLength;
}

const PATTERN_BUILDERS: Record<string, (value: string) => string> = {
  bash: suggestBashPattern,
  mcp: suggestMcpPattern,
  skill: (value) => value,
  path: deriveApprovalPattern,
};

export function suggestSessionPattern(surface: string, value: string): SessionApprovalSuggestion {
  const pattern = buildSessionPattern(surface, value);
  return { surface, pattern, label: buildSessionLabel(pattern) };
}

function buildSessionPattern(surface: string, value: string): string {
  const builder = PATTERN_BUILDERS[surface];
  if (builder) return builder(value);
  if (PATH_BEARING_TOOLS.has(surface) && value !== "*") return deriveApprovalPattern(value);
  return "*";
}
