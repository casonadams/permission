import { homedir } from "node:os";
import { join } from "node:path";

const HOME_PREFIXES = ["~/", "~\\", "$HOME/", "$HOME\\"] as const;

export function abbreviateHomePath(path: string): string {
  const home = homedir();
  if (path === home) return "~";
  const prefix = home.endsWith("/") ? home : `${home}/`;
  return path.startsWith(prefix) ? `~/${path.slice(prefix.length)}` : path;
}

export function expandHomePath(pattern: string): string {
  if (pattern === "~" || pattern === "$HOME") return homedir();
  for (const prefix of HOME_PREFIXES) {
    if (pattern.startsWith(prefix)) return join(homedir(), pattern.slice(prefix.length));
  }
  return pattern;
}
