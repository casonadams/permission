import type { PermissionPromptDecision } from "#src/prompting/permission-dialog";
import { processInbox } from "./permission-forwarder-inbox";
import { requestApproval } from "./permission-forwarder-request";
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
  constructor(private readonly deps: PermissionForwarderDeps) {}

  requestApproval(request: ApprovalRequest): Promise<PermissionPromptDecision> {
    return requestApproval(this.deps, request);
  }

  processInbox(ctx: ForwarderContext): Promise<void> {
    return processInbox(this.deps, ctx);
  }
}
