export interface PatternCommandConfig {
  readonly argConsumingFlags: ReadonlySet<string>;
  readonly fileConsumingFlags: ReadonlySet<string>;
  readonly patternPositionals?: number;
}
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
export type PatternCommandFlagDirective =
  | { kind: "end-of-flags" }
  | { kind: "regular-flag" }
  | { kind: "consume-arg"; nextArgAction: "skip" | "extract"; setsExplicitScript: boolean };
export function patternCommandConfig(commandName: string): PatternCommandConfig | undefined {
  return PATTERN_FIRST_COMMANDS.get(commandName);
}
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
