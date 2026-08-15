import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PermissionSession } from "#src/app/permission-session";
import { PERMISSION_SYSTEM_STATUS_KEY } from "#src/app/status";
import type { PermissionNotifier } from "#src/integrations/notifier";
import type { ServiceLifecycle } from "#src/integrations/service-lifecycle";
import type { PermissionResolver } from "#src/policy/permission-resolver";

interface SessionStartPayload {
  reason: string;
}

interface ResourcesDiscoverPayload {
  reason: string;
}

export interface SessionLifecycleHandlerDeps {
  session: PermissionSession;
  resolver: PermissionResolver;
  serviceLifecycle: ServiceLifecycle;
  notifier: PermissionNotifier;
}

export class SessionLifecycleHandler {
  private readonly session: PermissionSession;
  private readonly resolver: PermissionResolver;
  private readonly serviceLifecycle: ServiceLifecycle;
  private readonly notifier: PermissionNotifier;

  constructor(deps: SessionLifecycleHandlerDeps) {
    this.session = deps.session;
    this.resolver = deps.resolver;
    this.serviceLifecycle = deps.serviceLifecycle;
    this.notifier = deps.notifier;
  }

  handleSessionStart(_event: SessionStartPayload, ctx: ExtensionContext): Promise<void> {
    this.session.resetForNewSession(ctx);
    this.session.refreshConfig(ctx);
    const agentName = this.session.resolveAgentName(ctx);
    const policyIssues = this.resolver.getConfigIssues(agentName ?? undefined);
    for (const issue of policyIssues) {
      this.notifier.warn(issue);
    }

    this.serviceLifecycle.activate(ctx);
    return Promise.resolve();
  }

  handleResourcesDiscover(event: ResourcesDiscoverPayload): Promise<void> {
    if (event.reason !== "reload") {
      return Promise.resolve();
    }

    this.session.reload();
    return Promise.resolve();
  }

  handleSessionShutdown(): Promise<void> {
    const ctx = this.session.getRuntimeContext();
    if (ctx) {
      ctx.ui.setStatus(PERMISSION_SYSTEM_STATUS_KEY, undefined);
    }
    this.session.shutdown();
    this.serviceLifecycle.teardown();
    return Promise.resolve();
  }
}
