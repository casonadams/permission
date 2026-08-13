import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ConfigReader } from "../config/config-store";
import type { ApprovalRequester } from "../forwarding/permission-forwarder";
import { emitUiPromptEvent, type PermissionEventBus } from "../integrations/permission-events";
import type { ReviewLogger } from "../integrations/session-logger";
import type { PermissionPromptDecision } from "./permission-dialog";
import { buildDirectUiPrompt } from "./permission-ui-prompt";
import { maybeAutoApprovePrompt, recordPromptDecision, recordPromptWaiting } from "./prompt-audit";

export type PermissionReviewSource = "tool_call" | "skill_input" | "skill_read";

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

export interface PermissionPrompterDeps {
  config: ConfigReader;
  logger: ReviewLogger;
  events: PermissionEventBus;
  forwarder: ApprovalRequester;
}

export class PermissionPrompter implements PermissionPrompterApi {
  constructor(private readonly deps: PermissionPrompterDeps) {}

  async prompt(ctx: ExtensionContext, details: PromptPermissionDetails): Promise<PermissionPromptDecision> {
    const autoDecision = maybeAutoApprovePrompt(details, this.deps);
    if (autoDecision) return autoDecision;

    recordPromptWaiting(details, { logger: this.deps.logger });

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

    recordPromptDecision(details, decision, this.deps.logger);
    return decision;
  }
}
