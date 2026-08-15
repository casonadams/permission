import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isRegisteredSubagentChild } from "../forwarding/subagents/subagent-context";
import type { SubagentSessionRegistry } from "../forwarding/subagents/subagent-registry";
import { type PermissionsService, publishPermissionsService, unpublishPermissionsService } from "../service";
import { emitReadyEvent, type PermissionEventBus } from "./permission-events";

export interface ServiceLifecycle {
  activate(ctx: ExtensionContext): void;
  teardown(): void;
}

export interface PermissionServiceLifecycleDeps {
  service: PermissionsService;
  registry: SubagentSessionRegistry;
  events: PermissionEventBus;
  subscriptions: readonly (() => void)[];
}

export class PermissionServiceLifecycle implements ServiceLifecycle {
  private readonly service: PermissionsService;
  private readonly registry: SubagentSessionRegistry;
  private readonly events: PermissionEventBus;
  private readonly subscriptions: readonly (() => void)[];
  private isTornDown = false;

  constructor(deps: PermissionServiceLifecycleDeps) {
    this.service = deps.service;
    this.registry = deps.registry;
    this.events = deps.events;
    this.subscriptions = deps.subscriptions;
  }

  activate(ctx: ExtensionContext): void {
    if (!isRegisteredSubagentChild(ctx, this.registry)) {
      publishPermissionsService(this.service);
    }
    emitReadyEvent(this.events);
  }

  teardown(): void {
    if (this.isTornDown) {
      return;
    }

    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    unpublishPermissionsService(this.service);
    this.isTornDown = true;
  }
}
