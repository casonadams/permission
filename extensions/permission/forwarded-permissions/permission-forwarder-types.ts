import type { SessionEntryView } from "#src/active-agent";
import type { ConfigReader } from "#src/config-store";
import type { PermissionDecisionUi, PermissionPromptDecision, RequestPermissionOptions } from "#src/permission-dialog";
import type { PermissionEventBus } from "#src/permission-events";
import type {
  ForwardedPermissionRequest,
  ForwardedPromptDisplay,
  PermissionForwardingLocation,
} from "#src/permission-forwarding";
import type { DebugReviewLogger } from "#src/session-logger";
import type { SubagentSessionRegistry } from "#src/subagent-registry";

export interface ForwarderContext {
  hasUI: boolean;
  ui: PermissionDecisionUi;
  sessionManager: {
    getSessionId(): string;
    getSessionDir(): string;
    getEntries(): readonly SessionEntryView[];
  };
}

export type ProcessableInbox = {
  currentSessionId: string;
  location: PermissionForwardingLocation;
  requestFiles: string[];
};

export type ProcessForwardedRequestParams = {
  ctx: ForwarderContext;
  request: ForwardedPermissionRequest;
  location: PermissionForwardingLocation;
  requestPath: string;
  currentSessionId: string;
};

export type RequestLocationPath = {
  request: ForwardedPermissionRequest;
  location: PermissionForwardingLocation;
  path: string;
};

export type ForwardedDecisionResponse = {
  request: ForwardedPermissionRequest;
  location: PermissionForwardingLocation;
  responsePath: string;
  decision: PermissionPromptDecision;
};

export type ForwardedResponseWrite = {
  location: PermissionForwardingLocation;
  responsePath: string;
  decision: PermissionPromptDecision;
  currentSessionId: string;
};

export type ForwardedResponsePoll = {
  location: PermissionForwardingLocation;
  request: ForwardedPermissionRequest;
  requestPath: string;
  responsePath: string;
};

export type ForwardedRequestWrite = {
  requestPath: string;
  request: ForwardedPermissionRequest;
};

export type ForwardedRequestBuild = {
  ctx: ForwarderContext;
  message: string;
  requesterSessionId: string;
  targetSessionId: string;
  forwarded?: ForwardedPromptDisplay;
};

export type PermissionDecisionRequest = {
  ui: PermissionDecisionUi;
  title: string;
  message: string;
  options?: RequestPermissionOptions;
};

export type PermissionDecisionRequester = (params: PermissionDecisionRequest) => Promise<PermissionPromptDecision>;

export type ApprovalRequest = {
  ctx: ForwarderContext;
  message: string;
  options?: RequestPermissionOptions;
  forwarded?: ForwardedPromptDisplay;
};

export interface PermissionForwarderDeps {
  forwardingDir: string;
  subagentSessionsDir: string;
  registry?: SubagentSessionRegistry;
  events?: PermissionEventBus;
  logger: DebugReviewLogger;
  requestPermissionDecisionFromUi: PermissionDecisionRequester;
  config: ConfigReader;
}

export interface ApprovalRequester {
  requestApproval(request: ApprovalRequest): Promise<PermissionPromptDecision>;
}

export interface InboxProcessor {
  processInbox(ctx: ForwarderContext): Promise<void>;
}
