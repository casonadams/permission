import type { PermissionPromptDecision } from "../prompting/permission-dialog";

export type PermissionGateResult =
  | { action: "allow"; sessionApproval?: { surface: string; pattern: string } }
  | { action: "block"; reason: string };

export interface PermissionGateParams {
  state: "allow" | "deny" | "ask";

  canConfirm: boolean;

  promptForApproval: () => Promise<PermissionPromptDecision>;

  sessionApproval?: { surface: string; pattern: string };

  messages: {
    denyReason: string;
    unavailableReason: string;
    userDeniedReason: (decision: PermissionPromptDecision) => string;
  };
}

export async function applyPermissionGate(params: PermissionGateParams): Promise<PermissionGateResult> {
  const { state, messages } = params;

  if (state === "deny") return { action: "block", reason: messages.denyReason };

  if (state === "ask") return handleAskState(params);

  return { action: "allow" };
}

async function handleAskState(params: PermissionGateParams): Promise<PermissionGateResult> {
  const { canConfirm, promptForApproval, messages } = params;
  if (!canConfirm) return { action: "block", reason: messages.unavailableReason };
  const decision = await promptForApproval();
  if (!decision.approved) return { action: "block", reason: messages.userDeniedReason(decision) };
  if (decision.state === "approved_for_session" && params.sessionApproval) {
    return { action: "allow", sessionApproval: params.sessionApproval };
  }
  return { action: "allow" };
}
