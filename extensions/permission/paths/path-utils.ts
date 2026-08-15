import { normalize, relative, resolve } from "node:path";
import type { ToolAccessExtractorLookup } from "../integrations/tool-customizations";
import { PATH_BEARING_TOOLS, SPECIAL_PERMISSION_KEYS } from "../policy/permission-surfaces";
import { getNonEmptyString, toRecord } from "../shared/common";
import { canonicalizePath } from "./canonicalize-path";
import { expandHomePath } from "./expand-home";
import { isPathWithinDirectory } from "./path-containment";

export { PATH_BEARING_TOOLS } from "../policy/permission-surfaces";
export { isPathWithinDirectory } from "./path-containment";
export { isPiInfrastructureRead, READ_ONLY_PATH_BEARING_TOOLS } from "./path-infrastructure";

export function normalizePathForComparison(pathValue: string, cwd: string): string {
  const normalizedPath = cleanPathLiteral(pathValue);
  if (!normalizedPath) {
    return "";
  }

  const absolutePath = resolve(cwd, normalizedPath);
  const normalizedAbsolutePath = normalize(absolutePath);
  return process.platform === "win32" ? normalizedAbsolutePath.toLowerCase() : normalizedAbsolutePath;
}

export interface PathPolicyValueOptions {
  cwd?: string;
  resolveBase?: string;
}

export function normalizePathPolicyLiteral(pathValue: string): string {
  return cleanPathLiteral(pathValue);
}

function cleanPathLiteral(pathValue: string): string {
  const trimmed = pathValue.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return "";
  const unprefixed = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return expandHomePath(unprefixed);
}

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

export const SAFE_SYSTEM_PATHS: ReadonlySet<string> = new Set([
  "/dev/null",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
]);

export function isSafeSystemPath(normalizedPath: string): boolean {
  return SAFE_SYSTEM_PATHS.has(normalizedPath);
}

export const PATH_SURFACES: ReadonlySet<string> = new Set([...PATH_BEARING_TOOLS, ...SPECIAL_PERMISSION_KEYS]);

export function getPathBearingToolPath(toolName: string, input: unknown): string | null {
  if (!PATH_BEARING_TOOLS.has(toolName)) {
    return null;
  }

  return getNonEmptyString(toRecord(input).path);
}

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
