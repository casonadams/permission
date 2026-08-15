import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CacheKeyGate } from "#src/app/cache-key-gate";
import type { SessionConfigStore } from "../config/config-store";
import type { ForwardingController } from "../forwarding/forwarding-manager";
import type { ToolCallGateInputs } from "../gates/tool-call-gate-pipeline";
import type { ScopedPermissionManager } from "../policy/permission-manager";
import type { SessionRules } from "../policy/session-rules";
import type { PromptingGatewayLifecycle } from "../prompting/prompting-gateway";
import { getActiveAgentName, getActiveAgentNameFromSystemPrompt } from "./active-agent";
import type { ExtensionPaths } from "./extension-paths";
import type { SkillPromptEntry } from "./skill-prompt-sanitizer";

export interface PermissionSessionDeps {
  paths: ExtensionPaths;
  forwarding: ForwardingController;
  permissionManager: ScopedPermissionManager;
  sessionRules: SessionRules;
  configStore: SessionConfigStore;
  gateway: PromptingGatewayLifecycle;
}

export class PermissionSession implements ToolCallGateInputs {
  private context: ExtensionContext | null = null;
  private skillEntries: SkillPromptEntry[] = [];
  private knownAgentName: string | null = null;
  readonly activeToolsGate = new CacheKeyGate();
  readonly promptStateGate = new CacheKeyGate();

  constructor(private readonly deps: PermissionSessionDeps) {}

  activate(ctx: ExtensionContext): void {
    this.context = ctx;
    this.deps.forwarding.start(ctx);
    this.deps.gateway.activate(ctx);
  }

  deactivate(): void {
    this.context = null;
    this.deps.forwarding.stop();
    this.deps.gateway.deactivate();
  }

  getRuntimeContext(): ExtensionContext | null {
    return this.context;
  }

  notify(message: string): void {
    this.context?.ui.notify(message, "warning");
  }

  resetForNewSession(ctx: ExtensionContext): void {
    this.deps.permissionManager.configureForCwd(ctx.cwd);
    this.knownAgentName = null;
    this.resetDerivedState();
    this.activate(ctx);
  }

  shutdown(): void {
    this.deps.sessionRules.clear();
    this.knownAgentName = null;
    this.resetDerivedState();
    this.deactivate();
  }

  reload(): void {
    this.deps.permissionManager.configureForCwd(this.context?.cwd);
    this.resetDerivedState();
  }

  private resetDerivedState(): void {
    this.skillEntries = [];
    this.activeToolsGate.reset();
    this.promptStateGate.reset();
  }

  getActiveSkillEntries(): SkillPromptEntry[] {
    return this.skillEntries;
  }

  setActiveSkillEntries(entries: SkillPromptEntry[]): void {
    this.skillEntries = entries;
  }

  resolveAgentName(ctx: ExtensionContext, systemPrompt?: string): string | null {
    const fromSession = getActiveAgentName(ctx);
    if (fromSession) {
      this.knownAgentName = fromSession;
      return fromSession;
    }
    const fromSystemPrompt = getActiveAgentNameFromSystemPrompt(systemPrompt);
    if (fromSystemPrompt) {
      this.knownAgentName = fromSystemPrompt;
      return fromSystemPrompt;
    }
    return this.knownAgentName;
  }

  get lastKnownActiveAgentName(): string | null {
    return this.knownAgentName;
  }

  refreshConfig(ctx?: ExtensionContext): void {
    this.deps.configStore.refresh(ctx);
  }

  getInfrastructureReadDirs(): readonly string[] {
    return this.deps.paths.piInfrastructureDirs;
  }
}
