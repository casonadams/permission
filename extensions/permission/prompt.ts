import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type PromptOutcome = { approved: true; always: boolean } | { approved: false; reason?: string };

const OPTIONS = ["Allow", "Always allow", "Deny with reason"] as const;

export function formatUserDenial(custom?: string): string {
  const trimmed = custom?.trim();
  if (trimmed) {
    return `Permission denied by user: "${trimmed}". Do not retry this operation.`;
  }
  return "Permission denied by user. Do not retry this operation without explicit user request.";
}

export async function promptPermission(
  ui: ExtensionContext["ui"],
  title: string,
  message: string,
): Promise<PromptOutcome> {
  const choice = await ui.select(`${title}\n${message}`, [...OPTIONS]);
  switch (choice) {
    case "Allow":
      return { approved: true, always: false };
    case "Always allow":
      return { approved: true, always: true };
    case "Deny with reason": {
      const reason = await ui.input("Reason:");
      return { approved: false, reason: formatUserDenial(reason) };
    }
    default:
      return { approved: false, reason: formatUserDenial() };
  }
}
