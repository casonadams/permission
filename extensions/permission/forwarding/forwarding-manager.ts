import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { InboxProcessor } from "./permission-forwarder";
import { PERMISSION_FORWARDING_POLL_INTERVAL_MS } from "./permission-forwarding";
import { isSubagentExecutionContext } from "./subagents/subagent-context";
import type { SubagentSessionRegistry } from "./subagents/subagent-registry";

export interface ForwardingController {
  start(ctx: ExtensionContext): void;
  stop(): void;
}

export class ForwardingManager {
  private timer: NodeJS.Timeout | null = null;
  private context: ExtensionContext | null = null;
  private processing = false;

  constructor(
    private readonly subagentSessionsDir: string,
    private readonly forwarder: InboxProcessor,
    private readonly registry?: SubagentSessionRegistry,
  ) {}

  start(ctx: ExtensionContext): void {
    if (!ctx.hasUI || isSubagentExecutionContext(ctx, this.subagentSessionsDir, this.registry)) {
      this.stop();
      return;
    }
    this.context = ctx;
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      if (!this.context || this.processing) {
        return;
      }
      this.processing = true;
      void this.forwarder.processInbox(this.context).finally(() => {
        this.processing = false;
      });
    }, PERMISSION_FORWARDING_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.context = null;
    this.processing = false;
  }
}
