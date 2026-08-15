export type GateOutcome = { action: "allow"; toolCallApproved?: true } | { action: "block"; reason: string };

export interface ToolCallContext {
  toolName: string;
  agentName: string | null;
  input: unknown;
  toolCallId: string;
  cwd: string | undefined;
}
