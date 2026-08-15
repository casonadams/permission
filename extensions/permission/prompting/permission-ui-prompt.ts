import type { PermissionUiPromptEvent, PermissionUiPromptSource } from "../integrations/permission-events";

export interface DirectPromptInput {
  requestId: string;
  source: "tool_call" | "skill_input" | "skill_read";
  agentName: string | null;
  message: string;
  toolName?: string;
  skillName?: string;
  path?: string;
  command?: string;
  target?: string;
  promptSurface?: string;
  promptValue?: string;
}

export interface RpcPromptInput {
  requestId: string;
  surface?: string | null;
  value?: string | null;
  agentName?: string | null;
  message: string;
}

export interface ForwardedPromptInput {
  requestId: string;
  message: string;
  requesterAgentName: string | null;
  requesterSessionId: string | null;
  source?: PermissionUiPromptSource | null;
  surface?: string | null;
  value?: string | null;
}

function directSurface(input: DirectPromptInput): string | null {
  if (input.promptSurface !== undefined) return input.promptSurface;
  if (input.source === "skill_input" || input.source === "skill_read") {
    return "skill";
  }
  return input.toolName ?? null;
}

function firstNonNullValue(values: readonly (string | undefined | null)[]): string | null {
  for (const value of values) if (value != null) return value;
  return null;
}

function directValue(input: DirectPromptInput): string | null {
  return firstNonNullValue([
    input.promptValue,
    input.command,
    input.path,
    input.target,
    input.skillName,
    input.toolName,
  ]);
}

export function buildDirectUiPrompt(input: DirectPromptInput): PermissionUiPromptEvent {
  return {
    requestId: input.requestId,
    source: input.source,
    surface: directSurface(input),
    value: directValue(input),
    agentName: input.agentName,
    message: input.message,
    forwarding: null,
  };
}

export function buildRpcUiPrompt(input: RpcPromptInput): PermissionUiPromptEvent {
  return {
    requestId: input.requestId,
    source: "rpc_prompt",
    surface: input.surface ?? null,
    value: input.value ?? null,
    agentName: input.agentName ?? null,
    message: input.message,
    forwarding: null,
  };
}

export function buildForwardedUiPrompt(input: ForwardedPromptInput): PermissionUiPromptEvent {
  return {
    requestId: input.requestId,
    source: input.source ?? "tool_call",
    surface: input.surface ?? null,
    value: input.value ?? null,
    agentName: input.requesterAgentName,
    message: input.message,
    forwarding: {
      requesterAgentName: input.requesterAgentName,
      requesterSessionId: input.requesterSessionId,
    },
  };
}
