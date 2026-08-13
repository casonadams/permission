import { suggestSessionPattern } from "../prompting/pattern-suggest.ts";
import type { PromptPermissionDetails } from "../prompting/permission-prompter.ts";

export type ApprovalValue = "allow" | "allow_session" | "deny";

export function buildSessionOption(
  details: PromptPermissionDetails,
  toolName: string,
): ReturnType<typeof suggestSessionPattern> {
  const suggestion = suggestSessionPattern(toolName, promptSuggestionValue(details));
  return {
    ...suggestion,
    pattern: details.sessionPattern ?? suggestion.pattern,
    label: details.sessionLabel ?? suggestion.label,
  };
}

export function buildApprovalOptions(
  suggestion: ReturnType<typeof suggestSessionPattern>,
): Array<{ label: string; value: ApprovalValue }> {
  const base: Array<{ label: string; value: ApprovalValue }> = [{ label: "Allow", value: "allow" }];
  if (suggestion.pattern !== "*" && suggestion.pattern.length > 0) {
    base.push({ label: suggestion.label, value: "allow_session" });
  }
  return [...base, { label: "Deny", value: "deny" }];
}

function promptSuggestionValue(details: PromptPermissionDetails): string {
  return details.command ?? details.path ?? details.target ?? "";
}
