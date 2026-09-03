import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type PromptOutcome =
  | { approved: true; always: boolean; editedInput?: string; pattern?: string }
  | { approved: false; reason?: string };

const OPTIONS = ["Allow", "Edit / View", "Always allow", "Deny with reason"] as const;

export function formatUserDenial(custom?: string): string {
  const trimmed = custom?.trim();
  if (trimmed) {
    return `Permission denied by user: "${trimmed}". Do not retry this operation.`;
  }
  return "Permission denied by user. Do not retry this operation without explicit user request.";
}

export interface PromptDetails {
  readonly rawInput?: string;
  readonly defaultPattern?: string;
}

export async function promptPermission(
  ui: ExtensionContext["ui"],
  title: string,
  message: string,
  details?: PromptDetails,
): Promise<PromptOutcome> {
  const choice = await ui.select(`${title}\n${message}`, [...OPTIONS]);
  switch (choice) {
    case "Allow":
      return { approved: true, always: false };
    case "Edit / View":
      return resolveEditView(ui, details?.rawInput);
    case "Always allow":
      return resolveAlwaysAllow(ui, details?.defaultPattern ?? details?.rawInput);
    case "Deny with reason": {
      const reason = await ui.input("Reason:");
      return { approved: false, reason: formatUserDenial(reason) };
    }
    default:
      return { approved: false, reason: formatUserDenial() };
  }
}

async function resolveEditView(ui: ExtensionContext["ui"], rawInput?: string): Promise<PromptOutcome> {
  if (!rawInput) {
    return { approved: true, always: false };
  }
  const promptEditor = typeof ui.editor === "function" ? ui.editor.bind(ui) : ui.input?.bind(ui);
  if (typeof promptEditor !== "function") {
    return { approved: true, always: false, editedInput: rawInput };
  }
  const edited = await promptEditor("Edit command / arguments before running:", rawInput);
  if (edited === undefined) {
    return { approved: false, reason: formatUserDenial() };
  }
  return { approved: true, always: false, editedInput: edited.trim() || rawInput };
}

async function resolveAlwaysAllow(ui: ExtensionContext["ui"], defaultPattern?: string): Promise<PromptOutcome> {
  if (!defaultPattern) {
    return { approved: true, always: true };
  }
  const promptEditor = typeof ui.editor === "function" ? ui.editor.bind(ui) : ui.input?.bind(ui);
  if (typeof promptEditor !== "function") {
    return { approved: true, always: true, pattern: defaultPattern };
  }
  const edited = await promptEditor("Rule pattern to always allow:", defaultPattern);
  if (edited === undefined) {
    return { approved: false, reason: formatUserDenial() };
  }
  return { approved: true, always: true, pattern: edited.trim() || defaultPattern };
}
