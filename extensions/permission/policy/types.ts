export type PermissionState = "allow" | "deny" | "ask";

import type { RuleOrigin } from "./rule";

export type { RuleOrigin };

export interface DenyWithReason {
  action: "deny";
  reason?: string;
}

export type PatternValue = PermissionState | DenyWithReason;

export type FlatPermissionConfig = Record<string, PermissionState | Record<string, PatternValue>>;

export interface ScopeConfig {
  permission?: FlatPermissionConfig;
}

export type BashCommandContext = "command_substitution" | "process_substitution" | "subshell";

export interface PermissionCheckResult {
  toolName: string;
  state: PermissionState;
  reason?: string;
  matchedPattern?: string;
  command?: string;
  target?: string;
  source: "tool" | "bash" | "mcp" | "skill" | "special" | "default" | "session";
  origin: RuleOrigin;
  commandContext?: BashCommandContext;
}
