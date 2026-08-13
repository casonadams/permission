import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ConfigReader } from "../config/config-store";
import type { ApprovalRequester } from "../forwarding/permission-forwarder";
import { emitUiPromptEvent, type PermissionEventBus } from "../integrations/permission-events";
import type { ReviewLogger } from "../integrations/session-logger";
import { createAutoApprovedPermissionDecision, type PermissionPromptDecision } from "./permission-dialog";
import { buildDirectUiPrompt } from "./permission-ui-prompt";
import { shouldAutoApprovePermissionState } from "./yolo-mode";

export type PermissionReviewSource = "tool_call" | "skill_input" | "skill_read";

type PermissionReviewLogDetails = PromptPermissionDetails & {
  resolution?: string;
  denialReason?: string;
};

/** Details passed when prompting the user for a permission decision. */
export interface PromptPermissionDetails {
  requestId: string;
  source: PermissionReviewSource;
  agentName: string | null;
  message: string;
  toolCallId?: string;
  toolName?: string;
  skillName?: string;
  path?: string;
  command?: string;
  target?: string;
  toolInputPreview?: string;
  /** Normalized permission surface for prompt broadcasts, when it differs from the tool name. */
  promptSurface?: string;
  /** Normalized permission value for prompt broadcasts, when it differs from the displayed input value. */
  promptValue?: string;
  /** Override label for the "for this session" dialog option. */
  sessionLabel?: string;
  /** Pattern that the descriptor will record when session approval is selected. */
  sessionPattern?: string;
}

/** Mockable contract for permission prompting. */
export interface PermissionPrompterApi {
  prompt(ctx: ExtensionContext, details: PromptPermissionDetails): Promise<PermissionPromptDecision>;
}

/**
 * Dependencies required by PermissionPrompter.
 *
 * Keeps the prompter's external surface narrow: callers provide config
 * access, a review logger, the UI-prompt event bus, and the forwarder
 * that owns the UI/subagent-forwarding branching logic.
 */
export interface PermissionPrompterDeps {
  /** Read current config for yolo-mode check (called at prompt time). */
  config: ConfigReader;
  /** Write structured entries to the permission review log. */
  logger: ReviewLogger;
  /** Event bus used for UI prompt broadcasts. */
  events: PermissionEventBus;
  /** Resolves the permission decision: direct UI dialog or forwarded to parent. */
  forwarder: ApprovalRequester;
}

/**
 * Encapsulates the full permission-prompt flow:
 *   1. Yolo-mode auto-approval check.
 *   2. Review-log "waiting" entry.
 *   3. UI-present vs. subagent-forwarding branching (via confirmPermission).
 *   4. Review-log "approved" / "denied" entry.
 *
 * Injecting a single PermissionPrompter instance means adding a new prompt
 * parameter (e.g. a future sessionLabel variant) only requires changing
 * PromptPermissionDetails and this class — not the full threading chain.
 */
export class PermissionPrompter implements PermissionPrompterApi {
  constructor(private readonly deps: PermissionPrompterDeps) {}

  async prompt(ctx: ExtensionContext, details: PromptPermissionDetails): Promise<PermissionPromptDecision> {
    if (shouldAutoApprovePermissionState("ask", this.deps.config.current())) {
      this.writeReviewEntry("permission_request.auto_approved", details);
      return createAutoApprovedPermissionDecision();
    }

    this.writeReviewEntry("permission_request.waiting", details);

    // Build the event once. When this session has UI it broadcasts directly;
    // when it does not (a forwarding subagent), the display fields ride along
    // to the parent so the parent emits a non-degraded event from the
    // forwarded path instead of here.
    const uiPrompt = buildDirectUiPrompt(details);
    if (ctx.hasUI) {
      emitUiPromptEvent(this.deps.events, uiPrompt);
    }

    const decision = await this.deps.forwarder.requestApproval({
      ctx,
      message: details.message,
      options: details.sessionLabel ? { sessionLabel: details.sessionLabel } : undefined,
      forwarded: {
        source: uiPrompt.source,
        surface: uiPrompt.surface,
        value: uiPrompt.value,
      },
    });

    this.writeReviewEntry(decision.approved ? "permission_request.approved" : "permission_request.denied", {
      ...details,
      resolution: decision.state,
      denialReason: decision.denialReason,
    });

    return decision;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private writeReviewEntry(event: string, details: PermissionReviewLogDetails): void {
    this.deps.logger.review(event, buildReviewLogDetails(details));
  }
}

function buildReviewLogDetails(details: PermissionReviewLogDetails): Record<string, unknown> {
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
    resolution: optionalLogValue(details.resolution),
    denialReason: optionalLogValue(details.denialReason),
  };
}

function optionalLogValue(value: string | undefined): string | null {
  return value ?? null;
}
