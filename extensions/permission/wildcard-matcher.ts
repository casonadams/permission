import { expandHomePath } from "./expand-home";

export type CompiledWildcardPattern<TState> = {
  pattern: string;
  state: TState;
  regex: RegExp;
};

export type WildcardPatternMatch<TState> = {
  state: TState;
  matchedPattern: string;
  matchedName: string;
};

/**
 * Optional folding applied when matching path-surface patterns on Windows.
 *
 * - `caseInsensitive` compiles the pattern with the `i` flag so a mixed-case
 *   pattern matches a lowercased (canonicalized) path value.
 * - `windowsSeparators` rewrites `/` to `\` in the expanded pattern so a
 *   forward-slash pattern matches a backslash-separated path value.
 */
export interface WildcardMatchOptions {
  caseInsensitive?: boolean;
  windowsSeparators?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Make a trailing " *" optional so e.g. "git *" matches both "git status" and bare "git". */
function applyTrailingWildcardOptional(escaped: string): string {
  return escaped.endsWith(" .*") ? `${escaped.slice(0, -3)}( .*)?` : escaped;
}

export function compileWildcardPattern<TState>(
  pattern: string,
  state: TState,
  options?: WildcardMatchOptions,
): CompiledWildcardPattern<TState> {
  let expanded = expandHomePath(pattern);
  if (options?.windowsSeparators) {
    expanded = expanded.replaceAll("/", "\\");
  }
  const escaped = applyTrailingWildcardOptional(
    expanded
      .split("*")
      .map((part) => escapeRegExp(part).replaceAll("\\?", "."))
      .join(".*"),
  );

  return {
    pattern,
    state,
    regex: new RegExp(`^${escaped}$`, options?.caseInsensitive ? "si" : "s"),
  };
}

export function compileWildcardPatternEntries<TState>(
  entries: Iterable<readonly [string, TState]>,
): CompiledWildcardPattern<TState>[] {
  return Array.from(entries, ([pattern, state]) => compileWildcardPattern(pattern, state));
}

export function findCompiledWildcardMatch<TState>(
  patterns: readonly CompiledWildcardPattern<TState>[],
  name: string,
): WildcardPatternMatch<TState> | null {
  const match = patterns.findLast((p) => p.regex.test(name));
  if (match === undefined) return null;
  return {
    state: match.state,
    matchedPattern: match.pattern,
    matchedName: name,
  };
}

/**
 * Test whether `value` matches `pattern` using wildcard rules.
 * `*` matches any sequence of characters (including empty).
 * `?` matches exactly one character.
 * Used by evaluate() for rule matching.
 */
export function wildcardMatch(pattern: string, value: string, options?: WildcardMatchOptions): boolean {
  return compileWildcardPattern(pattern, null, options).regex.test(value);
}

export function findCompiledWildcardMatchForNames<TState>(
  patterns: readonly CompiledWildcardPattern<TState>[],
  names: readonly string[],
): WildcardPatternMatch<TState> | null {
  const normalizedNames = names.map((value) => value.trim()).filter((value) => value.length > 0);
  if (normalizedNames.length === 0) {
    return null;
  }

  for (const name of normalizedNames) {
    const match = findCompiledWildcardMatch(patterns, name);
    if (match) {
      return match;
    }
  }

  return null;
}
