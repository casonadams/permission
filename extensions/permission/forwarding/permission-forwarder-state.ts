import type { SubagentSessionRegistry } from "#src/forwarding/subagents/subagent-registry";
import type { PermissionNotifier } from "#src/integrations/notifier";
import type { PermissionEventBus } from "#src/integrations/permission-events";
import type { PermissionDecisionRequester } from "./permission-forwarder-types";

export type PermissionForwarderState = {
  forwardingDir: string;
  subagentSessionsDir: string;
  registry: SubagentSessionRegistry | undefined;
  events: PermissionEventBus | undefined;
  notifier: PermissionNotifier;
  requestPermissionDecisionFromUi: PermissionDecisionRequester;
};
