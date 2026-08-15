import type { BeforeAgentStartEventResult, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createActiveToolsCacheKey, createBeforeAgentStartPromptStateKey } from "#src/app/before-agent-start-cache";
import type { PermissionSession } from "#src/app/permission-session";
import { resolveSkillPromptEntries } from "#src/app/skill-prompt-sanitizer";
import { sanitizeAvailableToolsSection } from "#src/app/system-prompt-sanitizer";
import { getToolNameFromValue, type ToolRegistry } from "#src/integrations/tool-registry";
import type { PermissionResolver } from "#src/policy/permission-resolver";
import type { PermissionState } from "#src/policy/types";

interface BeforeAgentStartPayload {
  systemPrompt: string;
}

export function shouldExposeTool(
  toolName: string,
  agentName: string | null,
  getToolPermission: (toolName: string, agentName?: string) => PermissionState,
): boolean {
  const toolPermission = getToolPermission(toolName, agentName ?? undefined);
  return toolPermission !== "deny";
}

export class AgentPrepHandler {
  constructor(
    private readonly session: PermissionSession,
    private readonly resolver: PermissionResolver,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async handle(event: BeforeAgentStartPayload, ctx: ExtensionContext): Promise<BeforeAgentStartEventResult> {
    this.session.activate(ctx);
    this.session.refreshConfig(ctx);

    const agentName = this.session.resolveAgentName(ctx, event.systemPrompt);
    const allowedTools = this.collectAllowedTools(this.toolRegistry.getActive(), agentName);

    const activeToolsCacheKey = createActiveToolsCacheKey(allowedTools);
    this.session.activeToolsGate.runIfChanged(activeToolsCacheKey, () => {
      this.toolRegistry.setActive(allowedTools);
    });

    const promptStateCacheKey = createBeforeAgentStartPromptStateKey({
      agentName,
      cwd: ctx.cwd,
      permissionStamp: this.resolver.getPolicyCacheStamp(agentName ?? undefined),
      systemPrompt: event.systemPrompt,
      allowedToolNames: allowedTools,
    });

    const promptResult = this.session.promptStateGate.runIfChanged(promptStateCacheKey, () => {
      const toolPromptResult = sanitizeAvailableToolsSection(event.systemPrompt, allowedTools);
      const skillPromptResult = resolveSkillPromptEntries(toolPromptResult.prompt, this.resolver, agentName, ctx.cwd);
      this.session.setActiveSkillEntries(skillPromptResult.entries);
      return skillPromptResult.prompt !== event.systemPrompt ? { systemPrompt: skillPromptResult.prompt } : {};
    });
    return promptResult ?? {};
  }

  private collectAllowedTools(activeTools: readonly unknown[], agentName: string | null): string[] {
    const allowed: string[] = [];
    for (const tool of activeTools) {
      const toolName = getToolNameFromValue(tool);
      if (!toolName) continue;
      if (shouldExposeTool(toolName, agentName, (t, a) => this.resolver.getToolPermission(t, a)))
        allowed.push(toolName);
    }
    return allowed;
  }
}
