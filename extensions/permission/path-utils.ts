import { normalize, relative, resolve } from "node:path";

import { canonicalizePath } from "./canonicalize-path";
import { getNonEmptyString, toRecord } from "./common";
import { expandHomePath } from "./expand-home";
import { isPathWithinDirectory } from "./path-containment";
import { PATH_BEARING_TOOLS, SPECIAL_PERMISSION_KEYS } from "./permission-surfaces";
import type { ToolAccessExtractorLookup } from "./tool-access-extractor-registry";

export { isPathWithinDirectory } from "./path-containment";
export { isPiInfrastructureRead, READ_ONLY_PATH_BEARING_TOOLS } from "./path-infrastructure";
export { PATH_BEARING_TOOLS } from "./permission-surfaces";

export function normalizePathForComparison(pathValue: string, cwd: string): string {
  const normalizedPath = cleanPathLiteral(pathValue);
  if (!normalizedPath) {
    return "";
  }

  const absolutePath = resolve(cwd, normalizedPath);
  const normalizedAbsolutePath = normalize(absolutePath);
  return process.platform === "win32" ? normalizedAbsolutePath.toLowerCase() : normalizedAbsolutePath;
}

/**
 * Returns true when `pathValue` is `directory` itself or nested inside it.
 *
 * Containment is decided with Node's platform-native `path.relative` rather
 * than a hand-rolled prefix check: on `win32` the comparison folds case (and
 * tolerates either separator), matching the case-insensitive filesystem.
 * `platform` defaults to `process.platform` and is injectable so Windows
 * behavior is testable on a POSIX CI.
 */

export interface PathPolicyValueOptions {
  /**
   * Current Pi working directory. When provided, returned values include a
   * project-relative alias for paths that resolve inside this directory.
   */
  cwd?: string;
  /**
   * Directory used to resolve `pathValue` into an absolute policy value.
   * Defaults to `cwd`. Bash uses this for tokens seen after a literal `cd`.
   */
  resolveBase?: string;
}

/**
 * Normalize a single path-like lookup value without resolving it against CWD.
 *
 * Preserves compatibility with existing relative path rules (`src/*`, `*.env`)
 * while applying the same lexical cleanup as
 * {@link normalizePathForComparison}: trim, strip simple wrapping quotes,
 * strip the OpenCode-style leading `@`, and expand `~` / `$HOME`.
 */
export function normalizePathPolicyLiteral(pathValue: string): string {
  return cleanPathLiteral(pathValue);
}

function cleanPathLiteral(pathValue: string): string {
  const trimmed = pathValue.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return "";
  const unprefixed = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return expandHomePath(unprefixed);
}

/**
 * Return equivalent lookup values for path-policy matching.
 *
 * The first value is the cwd/effective-base normalized absolute path when a
 * base is available. The later values preserve project-relative and raw
 * relative forms so existing rules like `src/*` and `*.env` continue to match.
 */
export function getPathPolicyValues(pathValue: string, options: PathPolicyValueOptions = {}): string[] {
  const literal = normalizePathPolicyLiteral(pathValue);
  if (!literal) return [];
  if (literal === "*") return ["*"];

  return [...new Set([...getAbsolutePathPolicyValues(pathValue, options), literal])];
}

function getAbsolutePathPolicyValues(pathValue: string, options: PathPolicyValueOptions): string[] {
  const resolveBase = options.resolveBase ?? options.cwd;
  if (!resolveBase) return [];

  const absolute = normalizePathForComparison(pathValue, resolveBase);
  if (!absolute) return [];

  return [absolute, ...getCwdRelativePathPolicyValues(absolute, options.cwd)];
}

function getCwdRelativePathPolicyValues(absolute: string, cwd: string | undefined): string[] {
  if (!cwd) return [];

  const normalizedCwd = normalizePathForComparison(cwd, cwd);
  if (!normalizedCwd) return [];
  if (!isWithinNormalizedCwd(absolute, normalizedCwd)) return [];

  const relativeValue = relative(normalizedCwd, absolute);
  return relativeValue ? [relativeValue] : [];
}

function isWithinNormalizedCwd(absolute: string, normalizedCwd: string): boolean {
  return absolute === normalizedCwd || isPathWithinDirectory(absolute, normalizedCwd);
}

/**
 * Paths that are universally safe and should never trigger external-directory checks.
 * These are OS device files: read returns EOF or process streams, write discards or goes to process streams.
 */
export const SAFE_SYSTEM_PATHS: ReadonlySet<string> = new Set([
  "/dev/null",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
]);

/**
 * Returns true if the given normalized path is a safe OS device file
 * that should never trigger external-directory checks.
 */
export function isSafeSystemPath(normalizedPath: string): boolean {
  return SAFE_SYSTEM_PATHS.has(normalizedPath);
}

/**
 * Surfaces whose patterns are matched against filesystem paths and therefore
 * fold case (and separators) on Windows: the path-bearing tools plus the
 * cross-cutting `path` gate and the `external_directory` boundary gate.
 */
export const PATH_SURFACES: ReadonlySet<string> = new Set([...PATH_BEARING_TOOLS, ...SPECIAL_PERMISSION_KEYS]);

export function getPathBearingToolPath(toolName: string, input: unknown): string | null {
  if (!PATH_BEARING_TOOLS.has(toolName)) {
    return null;
  }

  return getNonEmptyString(toRecord(input).path);
}

/**
 * Extract the filesystem path a tool will access, for the cross-cutting `path`
 * and `external_directory` gates.
 *
 * Unlike {@link getPathBearingToolPath} (built-in tools only), this recognizes
 * extension and MCP tools so they are no longer exempt from path gating:
 *
 * - `bash` → `null` (bash has its own token-based path gates).
 * - Built-in path-bearing tools → `input.path`.
 * - `mcp` → `input.arguments.path`.
 * - Any other tool → a registered {@link ToolAccessExtractor}'s path, else the
 *   default `input.path` convention.
 */
export function getToolInputPath(
  toolName: string,
  input: unknown,
  extractors?: ToolAccessExtractorLookup,
): string | null {
  if (toolName === "bash") {
    return null;
  }

  const record = toRecord(input);

  if (PATH_BEARING_TOOLS.has(toolName)) {
    return getNonEmptyString(record.path);
  }

  if (toolName === "mcp") {
    return getNonEmptyString(toRecord(record.arguments).path);
  }

  const customPath = getCustomToolInputPath(toolName, record, extractors);
  if (customPath !== null) return customPath;

  return getNonEmptyString(record.path);
}

function getCustomToolInputPath(
  toolName: string,
  record: Record<string, unknown>,
  extractors?: ToolAccessExtractorLookup,
): string | null {
  const custom = extractors?.get(toolName);
  if (!custom) return null;
  return getNonEmptyString(custom(record));
}

/**
 * Like {@link normalizePathForComparison} but also resolves symlinks via
 * `realpathSync` (best-effort). Use this for containment decisions where the
 * OS-followed path matters, not for pattern matching.
 */
export function canonicalNormalizePathForComparison(pathValue: string, cwd: string): string {
  const lexical = normalizePathForComparison(pathValue, cwd);
  if (!lexical) return "";
  const canonical = canonicalizePath(lexical);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function isPathOutsideWorkingDirectory(pathValue: string, cwd: string): boolean {
  const normalizedCwd = canonicalNormalizePathForComparison(cwd, cwd);
  const normalizedPath = canonicalNormalizePathForComparison(pathValue, cwd);
  if (!normalizedCwd || !normalizedPath) {
    return false;
  }
  if (isSafeSystemPath(normalizedPath)) {
    return false;
  }
  return !isPathWithinDirectory(normalizedPath, normalizedCwd);
}
