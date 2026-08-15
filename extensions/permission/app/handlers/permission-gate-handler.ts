import type { ExtensionContext, InputEventResult } from "@earendil-works/pi-coding-agent";
import type { PermissionSession } from "#src/app/permission-session";
import {
  checkRequestedToolRegistration,
  getToolNameFromValue,
  type ToolRegistry,
} from "#src/integrations/tool-registry";
import { formatMissingToolNameReason, formatUnknownToolReason } from "#src/prompting/permission-prompts";
import { toRecord } from "#src/shared/common";
import type { GateRunner } from "../../gates/runner";
import type { GateNotifier, SkillInputGatePipeline } from "../../gates/skill-input-gate-pipeline";
import type { ToolCallGatePipeline } from "../../gates/tool-call-gate-pipeline";
import type { ToolCallContext } from "../../gates/types";

interface InputPayload {
  text: string;
}

export interface PermissionGateHandlerDeps {
  session: PermissionSession;
  toolRegistry: ToolRegistry;
  pipeline: ToolCallGatePipeline;
  skillInputPipeline: SkillInputGatePipeline;
  runner: GateRunner;
}

export class PermissionGateHandler {
  private readonly session: PermissionSession;
  private readonly toolRegistry: ToolRegistry;
  private readonly pipeline: ToolCallGatePipeline;
  private readonly skillInputPipeline: SkillInputGatePipeline;
  private readonly runner: GateRunner;

  constructor(deps: PermissionGateHandlerDeps) {
    this.session = deps.session;
    this.toolRegistry = deps.toolRegistry;
    this.pipeline = deps.pipeline;
    this.skillInputPipeline = deps.skillInputPipeline;
    this.runner = deps.runner;
  }

  async handleToolCall(event: unknown, ctx: ExtensionContext): Promise<{ block?: true; reason?: string }> {
    this.session.activate(ctx);

    const validation = validateRequestedTool(event, this.toolRegistry.getAll());
    if (validation.status === "block") {
      return { block: true, reason: validation.reason };
    }
    const toolName = validation.toolName;

    const agentName = this.session.resolveAgentName(ctx);

    const input = getEventInput(event);
    const toolCallId =
      typeof (event as Record<string, unknown>).toolCallId === "string"
        ? ((event as Record<string, unknown>).toolCallId as string)
        : "";

    const tcc: ToolCallContext = {
      toolName,
      agentName,
      input,
      toolCallId,
      cwd: ctx.cwd,
    };

    const outcome = await this.pipeline.evaluate(tcc, this.runner);
    return outcome.action === "block" ? { block: true, reason: outcome.reason } : {};
  }

  async handleInput(event: InputPayload, ctx: ExtensionContext): Promise<InputEventResult> {
    this.session.activate(ctx);

    const skillName = extractSkillNameFromInput(event.text);
    if (!skillName) {
      return { action: "continue" };
    }

    const agentName = this.session.resolveAgentName(ctx);
    const notifier: GateNotifier = {
      warn: (message) => {
        if (ctx.hasUI) {
          ctx.ui.notify(message, "warning");
        }
      },
    };
    const outcome = await this.skillInputPipeline.evaluate({
      skillName,
      agentName,
      notifier,
      runner: this.runner,
    });
    return outcome.action === "block" ? { action: "handled" } : { action: "continue" };
  }
}

export type RequestedToolValidation = { status: "ok"; toolName: string } | { status: "block"; reason: string };

export function validateRequestedTool(event: unknown, availableTools: readonly unknown[]): RequestedToolValidation {
  const toolName = getToolNameFromValue(event);
  if (!toolName) {
    return { status: "block", reason: formatMissingToolNameReason() };
  }
  const check = checkRequestedToolRegistration(toolName, availableTools);
  if (check.status === "missing-tool-name") {
    return { status: "block", reason: formatMissingToolNameReason() };
  }
  if (check.status === "unregistered") {
    return {
      status: "block",
      reason: formatUnknownToolReason(check.requestedToolName, check.availableToolNames),
    };
  }
  return { status: "ok", toolName };
}

/** Pi SDK versions expose tool input as either `input` or `arguments`. */
export function getEventInput(event: unknown): unknown {
  const record = toRecord(event);

  if (record.input !== undefined) {
    return record.input;
  }

  if (record.arguments !== undefined) {
    return record.arguments;
  }

  return {};
}

export function extractSkillNameFromInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/skill:")) {
    return null;
  }

  const afterPrefix = trimmed.slice("/skill:".length);
  if (!afterPrefix) {
    return null;
  }

  const firstWhitespace = afterPrefix.search(/\s/);
  const skillName = (firstWhitespace === -1 ? afterPrefix : afterPrefix.slice(0, firstWhitespace)).trim();
  return skillName || null;
}
