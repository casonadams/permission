import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Expand `~` and `$HOME` prefixes in a pattern to the OS home directory.
 *
 * Supported forms:
 * - `~`          → `homedir()`
 * - `~/path`     → `homedir()/path`
 * - `~\path`     → `homedir()\path` (Windows)
 * - `$HOME`      → `homedir()`
 * - `$HOME/path` → `homedir()/path`
 * - `$HOME\path` → `homedir()\path` (Windows)
 *
 * All other patterns are returned unchanged.
 */
const HOME_PREFIXES = ["~/", "~\\", "$HOME/", "$HOME\\"] as const;

export function expandHomePath(pattern: string): string {
  if (pattern === "~" || pattern === "$HOME") return homedir();
  for (const prefix of HOME_PREFIXES) {
    if (pattern.startsWith(prefix)) return join(homedir(), pattern.slice(prefix.length));
  }
  return pattern;
}
