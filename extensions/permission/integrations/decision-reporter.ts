import { emitDecisionEvent, type PermissionDecisionEvent, type PermissionEventBus } from "./permission-events";

export interface DecisionReporter {
  emitDecision(event: PermissionDecisionEvent): void;
}

export class GateDecisionReporter implements DecisionReporter {
  constructor(private readonly events: PermissionEventBus) {}

  emitDecision(event: PermissionDecisionEvent): void {
    emitDecisionEvent(this.events, event);
  }
}
