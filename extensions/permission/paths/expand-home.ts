import { homedir } from "node:os";
import { join } from "node:path";

const HOME_PREFIXES = ["~/", "~\\", "$HOME/", "$HOME\\"] as const;

export function expandHomePath(pattern: string): string {
  if (pattern === "~" || pattern === "$HOME") return homedir();
  for (const prefix of HOME_PREFIXES) {
    if (pattern.startsWith(prefix)) return join(homedir(), pattern.slice(prefix.length));
  }
  return pattern;
}
