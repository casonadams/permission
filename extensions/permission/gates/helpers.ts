import type { PermissionDecisionEvent, PermissionDecisionResolution } from "#src/integrations/permission-events";
import type { PermissionCheckResult } from "#src/policy/types";

/**
 * Derive the human-readable value for a decision event from a check result.
 * Bash → extracted command; MCP → qualified target;
 * path-bearing tools → file path; others → tool name.
 */
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

/**
 * Build a `PermissionDecisionEvent` from the gate's inputs.
 *
 * Centralises the `origin / agentName / matchedPattern ?? null` normalization
 * that is otherwise duplicated across the session-hit path and the gate-result
 * path in `runGateCheck`.
 */
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

/**
 * Map the gate outcome back to a PermissionDecisionResolution.
 *
 * @param state     - The permission state passed to the gate.
 * @param action    - The gate's resulting action ("allow" | "block").
 * @param hasSession - True when the gate result carries a sessionApproval
 *                    (indicates the user chose "for this session").
 * @param canConfirm - Whether an interactive prompt was available.
 */
export interface DeriveResolutionArgs {
  state: "allow" | "deny" | "ask";
  action: "allow" | "block";
  hasSession: boolean;
  canConfirm: boolean;
  autoApproved?: boolean;
}

export function deriveResolution(args: DeriveResolutionArgs): PermissionDecisionResolution {
  if (args.state === "allow") return "policy_allow";
  if (args.state === "deny") return "policy_deny";

  return deriveAskResolution({
    action: args.action,
    hasSession: args.hasSession,
    canConfirm: args.canConfirm,
    autoApproved: args.autoApproved ?? false,
  });
}

function deriveAskResolution(params: {
  action: "allow" | "block";
  hasSession: boolean;
  canConfirm: boolean;
  autoApproved: boolean;
}): PermissionDecisionResolution {
  if (params.action === "allow") {
    if (params.autoApproved) return "auto_approved";
    return params.hasSession ? "user_approved_for_session" : "user_approved";
  }
  return params.canConfirm ? "user_denied" : "confirmation_unavailable";
}
