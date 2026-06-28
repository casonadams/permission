/**
 * Pure, synchronous token-classification helpers for bash path extraction.
 *
 * Exports two classifiers consumed by `bash-program.ts`:
 *   - `classifyTokenAsPathCandidate` — strict gate for the external-directory guard.
 *   - `classifyTokenAsRuleCandidate` — broader gate for cross-cutting `path` rules.
 *
 * Both classifiers share the private `rejectNonPathToken` predicate that captures
 * the seven rejection cases common to both (the production clone this module was
 * extracted to eliminate).
 */

// ── Public classifiers ─────────────────────────────────────────────────────

/**
 * Strict path-candidate classifier for the external-directory guard.
 *
 * Accepts tokens that unambiguously look like filesystem paths:
 * - Absolute paths (starting with `/`)
 * - Home-relative paths (starting with `~/`)
 * - Parent-traversal paths (containing `..`)
 *
 * Returns the raw token string if it qualifies, or `null` to skip.
 */
export function classifyTokenAsPathCandidate(token: string): string | null {
  if (rejectNonPathToken(token)) return null;

  if (token.startsWith("/")) return token;
  if (token.startsWith("~/")) return token;
  if (token.includes("..")) return token;

  return null;
}

/**
 * Broader token classifier for cross-cutting `path` permission rules.
 *
 * Accepts the same shapes as `classifyTokenAsPathCandidate`, plus:
 * - Dot-files and `./`-relative paths (starting with `.`)
 * - Any relative path containing `/` (e.g. `src/foo.ts`)
 *
 * The `~/foo` case is covered by `includes("/")` — no separate `~/` branch needed.
 *
 * Does NOT require the strict "must start with `/` or `~/` or contain `..`"
 * gate that the external-directory classifier uses.
 *
 * Returns the raw token string if it qualifies, or `null` to skip.
 */
export function classifyTokenAsRuleCandidate(token: string): string | null {
  if (rejectNonPathToken(token)) return null;

  if (token.startsWith(".")) return token;
  if (token.includes("/")) return token; // covers ~/ paths and all relative paths with /
  if (token.includes("..")) return token; // bare ".." (no slash)

  return null;
}

// ── Private rejection predicate ────────────────────────────────────────────

/**
 * URL pattern to skip tokens that look like URLs rather than paths.
 */
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Regex metacharacter sequences that are never found in real filesystem paths.
 * If a token contains any of these, it is almost certainly a regex pattern
 * (e.g. a grep argument) rather than a path.
 */
const REGEX_METACHAR_PATTERN = /\.\*|\.\+|\\\||\\\(|\\\)|\[.*?\]|\^\//;

/**
 * Shared rejection prelude: returns `true` when a token can never be a
 * filesystem path, regardless of which classifier is asking.
 *
 * Rejects: empty tokens, flags (leading `-`), env assignments (`FOO=/bar`),
 * URLs, `@scope/package` patterns, bare-slash tokens, and regex metacharacter
 * sequences.
 */
const BARE_SLASH_PATTERN = /^\/+$/;

const TOKEN_REJECTORS: Array<(token: string) => boolean> = [
  (token) => !token,
  (token) => token.startsWith("-"),
  isEnvAssignmentToken,
  (token) => URL_PATTERN.test(token),
  isScopedPackageToken,
  (token) => BARE_SLASH_PATTERN.test(token),
  (token) => REGEX_METACHAR_PATTERN.test(token),
];

function rejectNonPathToken(token: string): boolean {
  return TOKEN_REJECTORS.some((rejects) => rejects(token));
}

function isEnvAssignmentToken(token: string): boolean {
  const eqIndex = token.indexOf("=");
  const slashIndex = token.indexOf("/");
  return eqIndex !== -1 && (slashIndex === -1 || eqIndex < slashIndex);
}

function isScopedPackageToken(token: string): boolean {
  return token.startsWith("@") && !token.startsWith("@/");
}
