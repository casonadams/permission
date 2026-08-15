// Channels and payloads must match @gotgenes/pi-subagents/src/lifecycle/child-lifecycle.ts.
// The session-created handler must stay synchronous because it runs immediately before bindExtensions().

import type { SubagentSessionRegistry } from "./subagent-registry";

export const SUBAGENT_CHILD_SESSION_CREATED = "subagents:child:session-created";

export const SUBAGENT_CHILD_DISPOSED = "subagents:child:disposed";

interface LifecycleEventBus {
  on(channel: string, handler: (data: unknown) => void): () => void;
}

interface ChildSessionCreatedEvent {
  sessionId: string;
  parentSessionId?: string;
}

interface ChildDisposedEvent {
  sessionId: string;
}

export function subscribeSubagentLifecycle(events: LifecycleEventBus, registry: SubagentSessionRegistry): () => void {
  const unsubCreated = events.on(SUBAGENT_CHILD_SESSION_CREATED, (data) => {
    const event = data as ChildSessionCreatedEvent;
    registry.register(event.sessionId, {
      parentSessionId: event.parentSessionId,
    });
  });

  const unsubDisposed = events.on(SUBAGENT_CHILD_DISPOSED, (data) => {
    const event = data as ChildDisposedEvent;
    registry.unregister(event.sessionId);
  });

  return () => {
    unsubCreated();
    unsubDisposed();
  };
}
