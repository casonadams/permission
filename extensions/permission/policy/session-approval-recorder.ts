import type { SessionApproval } from "./session-approval";

export interface SessionApprovalRecorder {
  recordSessionApproval(approval: SessionApproval): void;
}
