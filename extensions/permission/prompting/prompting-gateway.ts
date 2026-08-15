import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { isSubagentExecutionContext } from "../forwarding/subagents/subagent-context";
import type { SubagentSessionRegistry } from "../forwarding/subagents/subagent-registry";
import type { GatePrompter } from "./gate-prompter";
import type { PermissionPromptDecision } from "./permission-dialog";
import type { PermissionPrompterApi, PromptPermissionDetails } from "./permission-prompter";

export interface PromptingGatewayDeps {
  subagentSessionsDir: string;
  registry?: SubagentSessionRegistry;
  prompter: PermissionPrompterApi;
}

export interface PromptingGatewayLifecycle {
  activate(ctx: ExtensionContext): void;
  deactivate(): void;
}

export class PromptingGateway implements GatePrompter, PromptingGatewayLifecycle {
  private context: ExtensionContext | null = null;

  constructor(private readonly deps: PromptingGatewayDeps) {}

  activate(ctx: ExtensionContext): void {
    this.context = ctx;
  }

  deactivate(): void {
    this.context = null;
  }

  canConfirm(): boolean {
    if (this.context === null) return false;
    return (
      this.context.hasUI || isSubagentExecutionContext(this.context, this.deps.subagentSessionsDir, this.deps.registry)
    );
  }

  prompt(details: PromptPermissionDetails): Promise<PermissionPromptDecision> {
    if (this.context === null) {
      return Promise.reject(new Error("prompt called before the session was activated"));
    }
    return this.deps.prompter.prompt(this.context, details);
  }
}
