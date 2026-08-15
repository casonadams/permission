import type { PermissionDecisionEvent, PermissionDecisionResolution } from "#src/integrations/permission-events";
import type { PermissionCheckResult } from "#src/policy/types";

export function deriveDecisionValue(
  toolName: string,
  check: Pick<PermissionCheckResult, "command" | "target">,
  path?: string,
): string {
  if (toolName === "bash") return fallbackToToolName(check.command, toolName);
  if (toolName === "mcp") return fallbackToToolName(check.target, toolName);
  if (path) return path;
  return toolName;
}

function fallbackToToolName(value: string | undefined, toolName: string): string {
  return value ?? toolName;
}

export interface BuildDecisionEventArgs {
  decision: { surface: string; value: string };
  check: Pick<PermissionCheckResult, "origin" | "matchedPattern">;
  agentName: string | null;
  result: "allow" | "deny";
  resolution: PermissionDecisionResolution;
}

export function buildDecisionEvent(args: BuildDecisionEventArgs): PermissionDecisionEvent {
  return {
    surface: args.decision.surface,
    value: args.decision.value,
    result: args.result,
    resolution: args.resolution,

    origin: args.check.origin ?? null,
    agentName: args.agentName ?? null,
    matchedPattern: args.check.matchedPattern ?? null,
  };
}

export interface DeriveResolutionArgs {
  state: "allow" | "deny" | "ask";
  action: "allow" | "block";
  hasSession: boolean;
  canConfirm: boolean;
}

export function deriveResolution(args: DeriveResolutionArgs): PermissionDecisionResolution {
  if (args.state === "allow") return "policy_allow";
  if (args.state === "deny") return "policy_deny";

  return deriveAskResolution({
    action: args.action,
    hasSession: args.hasSession,
    canConfirm: args.canConfirm,
  });
}

function deriveAskResolution(params: {
  action: "allow" | "block";
  hasSession: boolean;
  canConfirm: boolean;
}): PermissionDecisionResolution {
  if (params.action === "allow") {
    return params.hasSession ? "user_approved_for_session" : "user_approved";
  }
  return params.canConfirm ? "user_denied" : "confirmation_unavailable";
}
