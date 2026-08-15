import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { emitUiPromptEvent, type PermissionEventBus } from "../integrations/permission-events.ts";
import {
  createApprovedPermissionDecision,
  createDeniedPermissionDecision,
  createSessionApprovedPermissionDecision,
  type PermissionPromptDecision,
} from "../prompting/permission-dialog.ts";
import type { PermissionPrompterApi, PromptPermissionDetails } from "../prompting/permission-prompter.ts";
import { buildDirectUiPrompt } from "../prompting/permission-ui-prompt.ts";
import { type GatePrompter, setGatePrompter } from "../service.ts";
import { previewToolCall, promptBody, toolTitle } from "./preview.ts";
import { chooseHorizontalApproval, renderPromptBody } from "./prompt/horizontal.ts";
import { queueDialog } from "./prompt/queue.ts";
import { type ApprovalValue, buildApprovalOptions, buildSessionOption } from "./prompt-options.ts";

type LocalPrompterDeps = {
  prompter: PermissionPrompterApi;
  canResolve: (ctx: ExtensionContext) => boolean;
  events: PermissionEventBus;
};

function makeGatePromter(getCtx: () => ExtensionContext | null, deps: LocalPrompterDeps): GatePrompter {
  return {
    canConfirm(): boolean {
      const ctx = getCtx();
      if (ctx === null) return false;
      return deps.canResolve(ctx);
    },
    async prompt(details: PromptPermissionDetails): Promise<PermissionPromptDecision> {
      const ctx = getCtx();
      if (ctx === null) {
        return createDeniedPermissionDecision();
      }

      if (ctx.hasUI) {
        return promptWithHorizontalPicker(ctx, details, deps.events);
      }

      return deps.prompter.prompt(ctx, details);
    },
  };
}

function promptWithHorizontalPicker(
  ctx: ExtensionContext,
  details: PromptPermissionDetails,
  events: PermissionEventBus,
): Promise<PermissionPromptDecision> {
  emitUiPromptEvent(events, buildDirectUiPrompt(details));
  return promptForHorizontalDecision(ctx, details);
}

function promptForHorizontalDecision(
  ctx: ExtensionContext,
  details: PromptPermissionDetails,
): Promise<PermissionPromptDecision> {
  const promptDetails = buildHorizontalPromptDetails(details);
  return queueDialog(
    () =>
      chooseHorizontalApproval(
        ctx,
        promptDetails.title,
        {
          body: renderPromptBody(promptDetails.preview),
          options: buildApprovalOptions(promptDetails.suggestion),
        },
        "deny",
      ).then((value) => resolveApprovalDecision(value, ctx, promptDetails.title)),
    createDeniedPermissionDecision(),
  );
}

function buildHorizontalPromptDetails(details: PromptPermissionDetails) {
  const toolName = details.toolName ?? "tool";
  const title = toolTitle(toolName, details);
  return {
    title,
    preview: promptBody(title, details.toolInputPreview ?? previewToolCall(toolName, details)),
    suggestion: buildSessionOption(details, toolName),
  };
}

async function resolveApprovalDecision(
  value: ApprovalValue,
  ctx: ExtensionContext,
  title: string,
): Promise<PermissionPromptDecision> {
  if (value === "allow") return createApprovedPermissionDecision();
  if (value === "allow_session") return createSessionApprovedPermissionDecision();
  return askDenialReason(ctx, title);
}

async function askDenialReason(ctx: ExtensionContext, title: string): Promise<PermissionPromptDecision> {
  const reason = await ctx.ui.input(
    `${title}\nShare why this request was denied (optional).`,
    "Reason shown back to the agent",
  );
  const trimmed = reason?.trim() ?? "";
  return createDeniedPermissionDecision(trimmed);
}

export function installLocalPrompter(
  api: ExtensionAPI,
  deps: {
    prompter: PermissionPrompterApi;
    canResolve: (ctx: ExtensionContext) => boolean;
  },
): void {
  let currentCtx: ExtensionContext | null = null;
  const prompter = makeGatePromter(() => currentCtx, {
    prompter: deps.prompter,
    canResolve: deps.canResolve,
    events: api.events,
  });

  api.on("session_start", (_event, ctx) => {
    currentCtx = ctx;
  });
  api.on("session_shutdown", () => {
    currentCtx = null;
  });

  setGatePrompter(prompter);
}
