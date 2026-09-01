import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type PromptOutcome = { approved: true; forSession: boolean } | { approved: false; reason?: string };

const OPTIONS = ["Allow", "Allow for this session", "Deny", "Deny with reason"] as const;

export async function promptPermission(
  ui: ExtensionContext["ui"],
  title: string,
  message: string,
): Promise<PromptOutcome> {
  const choice = await ui.select(`${title}\n${message}`, [...OPTIONS]);
  switch (choice) {
    case "Allow":
      return { approved: true, forSession: false };
    case "Allow for this session":
      return { approved: true, forSession: true };
    case "Deny with reason": {
      const reason = await ui.input("Reason:");
      return { approved: false, reason: reason?.trim() || "denied by user" };
    }
    default:
      return { approved: false };
  }
}
