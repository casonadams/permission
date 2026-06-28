/**
 * Configuration for commands whose first positional arguments are inline
 * patterns/scripts rather than filesystem paths (sed, awk, grep, rg, sd, …).
 */

export interface PatternCommandConfig {
  /** Flags that consume the next argument as a non-path value (pattern, separator, etc.) */
  readonly argConsumingFlags: ReadonlySet<string>;
  /** Flags that consume the next argument as a file path */
  readonly fileConsumingFlags: ReadonlySet<string>;
  /**
   * Number of leading positional arguments that are patterns/scripts, not paths.
   * Default: 1 (covers sed, awk, grep, rg). sd uses 2 (FIND and REPLACE_WITH).
   */
  readonly patternPositionals?: number;
}

/**
 * Commands whose first N positional arguments are inline patterns/scripts,
 * not filesystem paths. The map stores per-command flag configuration so the
 * walker can identify which arguments are consumed by flags vs. positional.
 */
export const PATTERN_FIRST_COMMANDS: ReadonlyMap<string, PatternCommandConfig> = new Map([
  ["sed", { argConsumingFlags: new Set(["-e", "-i"]), fileConsumingFlags: new Set(["-f"]) }],
  ["awk", { argConsumingFlags: new Set(["-e", "-F", "-v"]), fileConsumingFlags: new Set(["-f"]) }],
  ["gawk", { argConsumingFlags: new Set(["-e", "-F", "-v"]), fileConsumingFlags: new Set(["-f"]) }],
  ["nawk", { argConsumingFlags: new Set(["-e", "-F", "-v"]), fileConsumingFlags: new Set(["-f"]) }],
  ["grep", { argConsumingFlags: new Set(["-e", "-A", "-B", "-C", "-m"]), fileConsumingFlags: new Set(["-f"]) }],
  ["egrep", { argConsumingFlags: new Set(["-e", "-A", "-B", "-C", "-m"]), fileConsumingFlags: new Set(["-f"]) }],
  ["fgrep", { argConsumingFlags: new Set(["-e", "-A", "-B", "-C", "-m"]), fileConsumingFlags: new Set(["-f"]) }],
  [
    "rg",
    {
      argConsumingFlags: new Set(["-e", "-A", "-B", "-C", "-m", "-g", "-t", "-T", "-j", "-M", "-r", "-E"]),
      fileConsumingFlags: new Set(["-f"]),
    },
  ],
  ["sd", { argConsumingFlags: new Set(["-n", "-f"]), fileConsumingFlags: new Set([]), patternPositionals: 2 }],
]);

/**
 * Discriminated union describing what the walker should do when it encounters
 * a flag word inside a pattern-first command. The `switch` in
 * `applyFlagDirective` narrows `nextArgAction` without a non-null assertion.
 */
export type PatternCommandFlagDirective =
  | { kind: "end-of-flags" }
  | { kind: "regular-flag" }
  | { kind: "consume-arg"; nextArgAction: "skip" | "extract"; setsExplicitScript: boolean };

/** Look up the pattern-first config for a command name, if any. */
export function patternCommandConfig(commandName: string): PatternCommandConfig | undefined {
  return PATTERN_FIRST_COMMANDS.get(commandName);
}

/**
 * Classify a flag word from a pattern-first command into a directive that
 * tells the walker how to handle the flag and its following argument.
 */
export function classifyPatternCommandFlag(text: string, config: PatternCommandConfig): PatternCommandFlagDirective {
  if (text === "--") return { kind: "end-of-flags" };
  if (config.argConsumingFlags.has(text)) {
    return { kind: "consume-arg", nextArgAction: "skip", setsExplicitScript: text === "-e" || text === "-f" };
  }
  if (config.fileConsumingFlags.has(text)) {
    return { kind: "consume-arg", nextArgAction: "extract", setsExplicitScript: true };
  }
  return { kind: "regular-flag" };
}
