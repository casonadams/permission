import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { collectLegacyConfigIssues } from "./config-loader";
import { EXTENSION_ROOT } from "./extension-config";

export interface SessionConfigStore {
  refresh(ctx?: ExtensionContext): void;
}

export interface ConfigPolicyProvider {
  getConfigIssues(): string[];
}

export interface ConfigStoreDeps {
  agentDir: string;
  policyPaths: ConfigPolicyProvider;
}

export class ConfigStore implements SessionConfigStore {
  private lastConfigWarning: string | null = null;

  constructor(private readonly deps: ConfigStoreDeps) {}

  refresh(ctx?: ExtensionContext): void {
    const issues = [
      ...collectLegacyConfigIssues(this.deps.agentDir, ctx?.cwd ?? "", EXTENSION_ROOT),
      ...this.deps.policyPaths.getConfigIssues(),
    ];
    this.updateConfigWarning(issues, ctx);
  }

  private updateConfigWarning(issues: readonly string[], ctx?: ExtensionContext): void {
    const warning = issues.length > 0 ? issues.join("\n") : undefined;
    if (warning) {
      this.notifyNewWarning(warning, ctx);
      return;
    }
    this.lastConfigWarning = null;
  }

  private notifyNewWarning(warning: string, ctx?: ExtensionContext): void {
    if (warning === this.lastConfigWarning) return;
    this.lastConfigWarning = warning;
    ctx?.ui.notify(warning, "warning");
  }
}
