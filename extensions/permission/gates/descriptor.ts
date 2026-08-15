import type { PermissionDecisionEvent } from "#src/integrations/permission-events";
import type { SessionApproval } from "#src/policy/session-approval";
import type { PermissionCheckResult, PermissionState } from "#src/policy/types";
import type { DenialContext } from "#src/prompting/denial-messages";
import type { PromptPermissionDetails } from "#src/prompting/permission-prompter";

export interface GateDescriptor {
  surface: string;
  input: unknown;
  denialContext: DenialContext;
  sessionApproval?: SessionApproval;
  promptDetails: Omit<PromptPermissionDetails, "requestId">;
  decision: {
    surface: string;
    value: string;
  };
  preResolved?: {
    state: PermissionState;
  };
  preCheck?: PermissionCheckResult;
}

export interface GateBypass {
  action: "allow";
  decision?: PermissionDecisionEvent;
}

export type GateResult = GateDescriptor | GateBypass | null;

export function isGateBypass(result: GateResult): result is GateBypass {
  return result !== null && "action" in result;
}

export function isGateDescriptor(result: GateResult): result is GateDescriptor {
  return result !== null && !("action" in result);
}
