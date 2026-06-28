import type { ConfigReader } from "#src/config-store";
import type { PermissionEventBus } from "#src/permission-events";
import type { DebugReviewLogger } from "#src/session-logger";
import type { SubagentSessionRegistry } from "#src/subagent-registry";
import type { PermissionDecisionRequester } from "./permission-forwarder-types";

export type PermissionForwarderState = {
  forwardingDir: string;
  subagentSessionsDir: string;
  registry: SubagentSessionRegistry | undefined;
  events: PermissionEventBus | undefined;
  logger: DebugReviewLogger;
  requestPermissionDecisionFromUi: PermissionDecisionRequester;
  config: ConfigReader;
};
