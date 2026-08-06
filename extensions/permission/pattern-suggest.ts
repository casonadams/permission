import { prefix } from "./bash-arity";
import { PATH_BEARING_TOOLS } from "./path-utils";
import { deriveApprovalPattern } from "./session-rules";

/** The suggestion returned for a "Yes, for this session" dialog option. */
export interface SessionApprovalSuggestion {
  /** The permission surface this approval applies to. */
  surface: string;
  /** The wildcard pattern to store as a session rule. */
  pattern: string;
  /** Human-readable label for the "for session" dialog option. */
  label: string;
}

/**
 * Suggest a bash session-approval pattern from a command string.
 *
 * Uses the arity table (`src/bash-arity.ts`) to identify the semantically
 * meaningful prefix tokens for the command, then produces a wildcard pattern:
 *
 * - Single bare token (no args): exact command (`ls`).
 * - Arity prefix covers all tokens: trailing wildcard (`npm run build*`).
 * - Arity prefix shorter than token list: space + wildcard (`git checkout *`).
 * - Unknown command: first token + space wildcard (`mytool *`).
 */
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

/**
 * Suggest an MCP session-approval pattern from a resolved target string.
 *
 * - Qualified target (`server:tool`) → `server:*`
 * - Munged target (`server_tool`) → `server_*`
 * - Bare target (no separator) → `*`
 */
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

/**
 * Label for the session-approval option.
 *
 * Kept to the pattern alone: the prompt title already names the surface and
 * subject, and the option sits inline between `Allow` and `Deny`, where a long
 * label is truncated.
 */
function buildSessionLabel(pattern: string): string {
  return `Session: ${pattern}`;
}

/**
 * Suggest a session-approval pattern for the given permission surface and value.
 *
 * Returns a `SessionApprovalSuggestion` with the surface, the wildcard pattern
 * to store in `SessionRules`, and a human-readable dialog label.
 */
const PATTERN_BUILDERS: Record<string, (value: string) => string> = {
  bash: suggestBashPattern,
  mcp: suggestMcpPattern,
  skill: (value) => value,
  external_directory: deriveApprovalPattern,
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
