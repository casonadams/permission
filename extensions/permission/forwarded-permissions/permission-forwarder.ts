import type { PermissionPromptDecision } from "#src/permission-dialog";
import { processInbox } from "./permission-forwarder-inbox";
import { requestApproval } from "./permission-forwarder-request";
import type { PermissionForwarderState } from "./permission-forwarder-state";
import type {
  ApprovalRequest,
  ApprovalRequester,
  ForwarderContext,
  InboxProcessor,
  PermissionForwarderDeps,
} from "./permission-forwarder-types";

export type {
  ApprovalRequest,
  ApprovalRequester,
  ForwarderContext,
  InboxProcessor,
  PermissionForwarderDeps,
} from "./permission-forwarder-types";

export class PermissionForwarder implements ApprovalRequester, InboxProcessor {
  private readonly state: PermissionForwarderState;

  constructor(deps: PermissionForwarderDeps) {
    this.state = {
      forwardingDir: deps.forwardingDir,
      subagentSessionsDir: deps.subagentSessionsDir,
      registry: deps.registry,
      events: deps.events,
      logger: deps.logger,
      requestPermissionDecisionFromUi: deps.requestPermissionDecisionFromUi,
      config: deps.config,
    };
  }

  requestApproval(request: ApprovalRequest): Promise<PermissionPromptDecision> {
    return requestApproval(this.state, request);
  }

  processInbox(ctx: ForwarderContext): Promise<void> {
    return processInbox(this.state, ctx);
  }
}
