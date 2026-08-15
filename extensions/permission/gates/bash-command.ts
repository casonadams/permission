import type { BashCommand } from "#src/gates/bash-program";
import { pickMostRestrictive } from "#src/gates/candidate-check";
import type { ScopedPermissionResolver } from "#src/policy/permission-resolver";
import type { PermissionCheckResult } from "#src/policy/types";

export interface ResolveBashCommandCheckArgs {
  command: string;
  commands: BashCommand[];
  agentName: string | undefined;
  resolver: ScopedPermissionResolver;
}

export function resolveBashCommandCheck(args: ResolveBashCommandCheckArgs): PermissionCheckResult {
  const results = args.commands.map((cmd) => {
    const result = args.resolver.resolve("bash", { command: cmd.text }, args.agentName);
    return cmd.context ? { ...result, commandContext: cmd.context } : result;
  });
  return pickMostRestrictive(results) ?? args.resolver.resolve("bash", { command: args.command }, args.agentName);
}
