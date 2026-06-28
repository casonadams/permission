import { posix as posixPath, win32 as winPath } from "node:path";

export function isPathWithinDirectory(
  pathValue: string,
  directory: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (!pathValue || !directory) return false;
  if (pathValue === directory) return true;
  return isRelativeChild(pathValue, directory, platform);
}

function isRelativeChild(pathValue: string, directory: string, platform: NodeJS.Platform): boolean {
  const impl = platform === "win32" ? winPath : posixPath;
  const relativePath = impl.relative(directory, pathValue);
  return isContainedRelativePath(relativePath, impl);
}

function isContainedRelativePath(relativePath: string, impl: typeof posixPath | typeof winPath): boolean {
  if (!relativePath || relativePath === "..") return false;
  if (relativePath.startsWith(`..${impl.sep}`)) return false;
  return !impl.isAbsolute(relativePath);
}
