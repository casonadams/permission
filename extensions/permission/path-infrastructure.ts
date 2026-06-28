import { join } from "node:path";
import { expandHomePath } from "./expand-home";
import { isPathWithinDirectory } from "./path-containment";
import { READ_ONLY_PATH_BEARING_TOOLS } from "./permission-surfaces";
import { wildcardMatch } from "./wildcard-matcher";

// File tools eligible for the Pi infrastructure auto-allow are defined in permission-surfaces.
export { READ_ONLY_PATH_BEARING_TOOLS } from "./permission-surfaces";

interface PiInfrastructureReadArgs {
  toolName: string;
  normalizedPath: string;
  infrastructureDirs: readonly string[];
  cwd: string;
  platform?: NodeJS.Platform;
}

export function isPiInfrastructureRead(
  ...input: [PiInfrastructureReadArgs] | [string, string, readonly string[], string, NodeJS.Platform?]
): boolean {
  const args = normalizePiInfrastructureReadArgs(input);
  if (!READ_ONLY_PATH_BEARING_TOOLS.has(args.toolName)) return false;
  if (matchesConfiguredInfrastructureDir(args)) return true;
  return matchesProjectInfrastructureDir(args);
}

function normalizePiInfrastructureReadArgs(
  input: [PiInfrastructureReadArgs] | [string, string, readonly string[], string, NodeJS.Platform?],
): PiInfrastructureReadArgs {
  if (typeof input[0] === "object") return input[0];
  const [toolName, normalizedPath, infrastructureDirs, cwd, platform] = input as [
    string,
    string,
    readonly string[],
    string,
    NodeJS.Platform?,
  ];
  return { toolName, normalizedPath, infrastructureDirs, cwd, platform };
}

function matchesConfiguredInfrastructureDir(args: PiInfrastructureReadArgs): boolean {
  return args.infrastructureDirs.some((dir) => matchesInfrastructureDir(dir, args));
}

function matchesInfrastructureDir(dir: string, args: PiInfrastructureReadArgs): boolean {
  if (containsGlobChars(dir)) return wildcardMatch(dir, args.normalizedPath, matchOptions(args.platform));
  return isPathWithinDirectory(args.normalizedPath, expandHomePath(dir), args.platform ?? process.platform);
}

function matchOptions(platform: NodeJS.Platform = process.platform) {
  return platform === "win32" ? { caseInsensitive: true, windowsSeparators: true } : undefined;
}

function matchesProjectInfrastructureDir(args: PiInfrastructureReadArgs): boolean {
  const platform = args.platform ?? process.platform;
  return [join(args.cwd, ".pi", "npm"), join(args.cwd, ".pi", "git")].some((dir) =>
    isPathWithinDirectory(args.normalizedPath, dir, platform),
  );
}

function containsGlobChars(value: string): boolean {
  return value.includes("*") || value.includes("?");
}
