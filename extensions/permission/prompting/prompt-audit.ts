import type { ConfigReader } from "../config/config-store";
import { emitUiPromptEvent, type PermissionEventBus } from "../integrations/permission-events";
import type { ReviewLogger } from "../integrations/session-logger";
import type { PermissionPromptDecision } from "./permission-dialog";
import type { PromptPermissionDetails } from "./permission-prompter";
import { buildDirectUiPrompt } from "./permission-ui-prompt";

export type PromptAuditDeps = {
  config: ConfigReader;
  logger: ReviewLogger;
};

/** Auto-approval has been removed; this hook is preserved for callers. */
export function maybeAutoApprovePrompt(
  _details: PromptPermissionDetails,
  _deps: PromptAuditDeps,
): PermissionPromptDecision | null {
  return null;
}

export function recordPromptWaiting(
  details: PromptPermissionDetails,
  deps: { logger: ReviewLogger; events?: PermissionEventBus },
): void {
  deps.logger.review("permission_request.waiting", buildReviewLogDetails(details));
  if (deps.events) emitUiPromptEvent(deps.events, buildDirectUiPrompt(details));
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
