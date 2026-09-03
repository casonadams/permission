import { realpathSync } from "node:fs";
import { posix } from "node:path";
import { expandHomePath } from "./match";
import { isPlainRecord } from "./policy";

export const READ_ONLY_PATH_TOOLS = new Set(["read", "grep", "find", "ls"]);
export const PATH_BEARING_TOOLS = new Set([...READ_ONLY_PATH_TOOLS, "write", "edit"]);

const SAFE_SYSTEM_PATHS = new Set(["/dev/null", "/dev/stdin", "/dev/stdout", "/dev/stderr"]);

export function extractToolInputPath(toolName: string, input: unknown): string | null {
  if (!PATH_BEARING_TOOLS.has(toolName)) return null;
  const record = isPlainRecord(input) ? input : {};
  const path = record.path;
  return typeof path === "string" && path.trim().length > 0 ? path : null;
}

export function extractMcpInputPath(input: unknown): string | null {
  if (!isPlainRecord(input)) return null;
  const args = input.arguments;
  if (!isPlainRecord(args)) return null;
  const path = args.path;
  return typeof path === "string" && path.trim().length > 0 ? path : null;
}

export function extractMcpTargets(input: unknown): string[] {
  if (!isPlainRecord(input)) return [];
  const server = typeof input.server === "string" ? input.server.trim() : "";
  const tool = typeof input.tool === "string" ? input.tool.trim() : "";
  const targets: string[] = [];
  if (server && tool) targets.push(`${server}:${tool}`);
  if (server) targets.push(server);
  if (!server && tool) targets.push(tool);
  return targets;
}

export function pathPolicyValues(pathValue: string, cwd?: string): string[] {
  const literal = cleanPathLiteral(pathValue);
  if (!literal) return [];
  if (literal === "*") return ["*"];
  const values = new Set([literal]);
  const absolute = absolutePathFor(literal, cwd);
  if (absolute) {
    values.add(absolute);
    const relative = cwdRelativeValue(absolute, cwd);
    if (relative) values.add(relative);
  }
  return [...values];
}

function cleanPathLiteral(pathValue: string): string {
  const trimmed = pathValue.trim();
  return trimmed ? expandHomePath(trimmed) : "";
}

function absolutePathFor(literal: string, cwd?: string): string | null {
  if (!cwd) return posix.isAbsolute(literal) ? posix.normalize(literal) : null;
  return canonicalPath(literal, cwd);
}

function cwdRelativeValue(absolute: string, cwd?: string): string | null {
  if (!cwd) return null;
  const canonicalCwd = canonicalPath(cwd, cwd);
  if (!canonicalCwd || !isPathWithinDirectory(absolute, canonicalCwd)) return null;
  return posix.relative(canonicalCwd, absolute);
}

export function canonicalPath(pathValue: string, cwd: string): string {
  const expanded = expandHomePath(pathValue.trim());
  const absolute = posix.isAbsolute(expanded) ? posix.normalize(expanded) : posix.resolve(cwd, expanded);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

export function isPathWithinDirectory(pathValue: string, directory: string): boolean {
  if (!pathValue || !directory) return false;
  if (pathValue === directory) return true;
  const relative = posix.relative(directory, pathValue);
  if (!relative || relative === "..") return false;
  if (relative.startsWith("../")) return false;
  return !posix.isAbsolute(relative);
}

export function isPathOutsideWorkingDirectory(pathValue: string, cwd?: string): boolean {
  if (!cwd) return false;
  const canonical = canonicalPath(pathValue, cwd);
  if (!canonical || SAFE_SYSTEM_PATHS.has(canonical)) return false;
  const canonicalCwd = canonicalPath(cwd, cwd);
  if (!canonicalCwd) return false;
  return !isPathWithinDirectory(canonical, canonicalCwd);
}

export function parentDirectoryGlob(pathValue: string, cwd?: string): string | null {
  const absolute = absolutePathFor(cleanPathLiteral(pathValue), cwd);
  if (!absolute) return null;
  const parent = posix.dirname(absolute);
  if (parent === "/" || parent === ".") return null;
  return `${parent}/*`;
}

export function isInfrastructureRead(
  toolName: string,
  pathValue: string,
  cwd: string | undefined,
  infrastructureDirs: readonly string[],
): boolean {
  if (!READ_ONLY_PATH_TOOLS.has(toolName)) return false;
  const base = cwd ?? process.cwd();
  const canonical = canonicalPath(expandHomePath(pathValue.trim()), base);
  return infrastructureDirs.some((dir) => isPathWithinDirectory(canonical, canonicalPath(expandHomePath(dir), base)));
}
