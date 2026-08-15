import type { SubagentSessionRegistry } from "#src/forwarding/subagents/subagent-registry";
import type { PermissionEventBus } from "#src/integrations/permission-events";
import type { ReviewLogger } from "#src/integrations/session-logger";
import type { PermissionDecisionRequester } from "./permission-forwarder-types";

export type PermissionForwarderState = {
  forwardingDir: string;
  subagentSessionsDir: string;
  registry: SubagentSessionRegistry | undefined;
  events: PermissionEventBus | undefined;
  logger: ReviewLogger;
  requestPermissionDecisionFromUi: PermissionDecisionRequester;
};
