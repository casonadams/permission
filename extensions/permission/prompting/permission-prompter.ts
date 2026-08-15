import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ApprovalRequester } from "../forwarding/permission-forwarder";
import { emitUiPromptEvent, type PermissionEventBus } from "../integrations/permission-events";
import type { PermissionPromptDecision } from "./permission-dialog";
import { buildDirectUiPrompt } from "./permission-ui-prompt";

export type PermissionReviewSource = "tool_call" | "skill_input" | "skill_read";

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
  promptSurface?: string;
  promptValue?: string;
  sessionLabel?: string;
  sessionPattern?: string;
}

export interface PermissionPrompterApi {
  prompt(ctx: ExtensionContext, details: PromptPermissionDetails): Promise<PermissionPromptDecision>;
}

export interface PermissionPrompterDeps {
  events: PermissionEventBus;
  forwarder: ApprovalRequester;
}

export class PermissionPrompter implements PermissionPrompterApi {
  constructor(private readonly deps: PermissionPrompterDeps) {}

  async prompt(ctx: ExtensionContext, details: PromptPermissionDetails): Promise<PermissionPromptDecision> {
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

    return decision;
  }
}
