import type { PermissionPromptDecision } from "./permission-dialog";
import type { PromptPermissionDetails } from "./permission-prompter";

export interface GatePrompter {
  canConfirm(): boolean;
  prompt(details: PromptPermissionDetails): Promise<PermissionPromptDecision>;
}
