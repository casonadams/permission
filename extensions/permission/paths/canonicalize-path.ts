import { realpathSync } from "node:fs";
import { join, posix, win32 } from "node:path";

type PathParts = {
  root: string;
  parts: string[];
  join: (...parts: string[]) => string;
};

export function canonicalizePath(absolutePath: string): string {
  if (!absolutePath) return absolutePath;

  const path = splitAbsolutePath(absolutePath);
  for (let i = path.parts.length; i >= 0; i--) {
    const result = tryResolveCandidate(path, i);
    if (result === "bail") return absolutePath;
    if (result !== null) return result;
  }
  return absolutePath;
}

function splitAbsolutePath(absolutePath: string): PathParts {
  if (isWindowsDrivePath(absolutePath)) return splitWindowsPath(absolutePath);
  return { root: "/", parts: absolutePath.split("/").filter(Boolean), join };
}

function isWindowsDrivePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path);
}

function splitWindowsPath(absolutePath: string): PathParts {
  const parsed = win32.parse(absolutePath);
  const tail = absolutePath.slice(parsed.root.length);
  return { root: parsed.root, parts: tail.split(/[\\/]+/).filter(Boolean), join: win32.join };
}

function tryResolveCandidate(path: PathParts, i: number): string | "bail" | null {
  const candidate = buildCandidate(path, i);
  try {
    const real = realpathSync(candidate);
    const tail = path.parts.slice(i);
    return tail.length === 0 ? real : path.join(real, ...tail);
  } catch (error) {
    return isFatalFsError(error) ? "bail" : null;
  }
}

function buildCandidate(path: PathParts, i: number): string {
  if (i === 0) return path.root;
  return path.root === "/"
    ? posix.join(path.root, ...path.parts.slice(0, i))
    : path.join(path.root, ...path.parts.slice(0, i));
}

function isFatalFsError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code !== "ENOENT" && code !== "ENOTDIR";
}
