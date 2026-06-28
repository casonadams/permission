import type { ConfigReader } from "../config-store.ts";
import { createAutoApprovedPermissionDecision, type PermissionPromptDecision } from "../permission-dialog.ts";
import { emitUiPromptEvent, type PermissionEventBus } from "../permission-events.ts";
import type { PromptPermissionDetails } from "../permission-prompter.ts";
import { buildDirectUiPrompt } from "../permission-ui-prompt.ts";
import type { ReviewLogger } from "../session-logger.ts";
import { shouldAutoApprovePermissionState } from "../yolo-mode.ts";

export type LocalPromptAuditDeps = {
  config: ConfigReader;
  events: PermissionEventBus;
  logger: ReviewLogger;
};

export function maybeAutoApprovePrompt(
  details: PromptPermissionDetails,
  deps: LocalPromptAuditDeps,
): PermissionPromptDecision | null {
  if (!shouldAutoApprovePermissionState("ask", deps.config.current())) return null;
  deps.logger.review("permission_request.auto_approved", buildReviewLogDetails(details));
  return createAutoApprovedPermissionDecision();
}

export function recordPromptWaiting(details: PromptPermissionDetails, deps: LocalPromptAuditDeps): void {
  deps.logger.review("permission_request.waiting", buildReviewLogDetails(details));
  emitUiPromptEvent(deps.events, buildDirectUiPrompt(details));
}

export function recordPromptDecision(
  details: PromptPermissionDetails,
  decision: PermissionPromptDecision,
  logger: ReviewLogger,
): void {
  logger.review(decision.approved ? "permission_request.approved" : "permission_request.denied", {
    ...buildReviewLogDetails(details),
    resolution: decision.state,
    denialReason: optionalLogValue(decision.denialReason),
  });
}

function buildReviewLogDetails(details: PromptPermissionDetails): Record<string, unknown> {
  return {
    requestId: details.requestId,
    source: details.source,
    agentName: details.agentName,
    message: details.message,
    toolCallId: optionalLogValue(details.toolCallId),
    toolName: optionalLogValue(details.toolName),
    skillName: optionalLogValue(details.skillName),
    path: optionalLogValue(details.path),
    command: optionalLogValue(details.command),
    target: optionalLogValue(details.target),
    toolInputPreview: optionalLogValue(details.toolInputPreview),
    promptSurface: optionalLogValue(details.promptSurface),
    promptValue: optionalLogValue(details.promptValue),
    sessionPattern: optionalLogValue(details.sessionPattern),
    resolution: null,
    denialReason: null,
  };
}

function optionalLogValue(value: string | undefined): string | null {
  return value ?? null;
}
