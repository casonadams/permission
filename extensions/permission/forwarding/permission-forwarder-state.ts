import type { SubagentSessionRegistry } from "#src/forwarding/subagents/subagent-registry";
import type { PermissionEventBus } from "#src/integrations/permission-events";
import type { DebugReviewLogger } from "#src/integrations/session-logger";
import type { ConfigReader } from "../config/config-store";
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
