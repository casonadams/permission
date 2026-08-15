const SUBAGENT_SESSION_REGISTRY_KEY = Symbol.for("@casonadams/permission:subagent-registry");

export function getSubagentSessionRegistry(): SubagentSessionRegistry {
  const store = globalThis as Record<symbol, unknown>;
  const existing = store[SUBAGENT_SESSION_REGISTRY_KEY] as SubagentSessionRegistry | undefined;
  if (existing) {
    return existing;
  }
  const registry = new SubagentSessionRegistry();
  store[SUBAGENT_SESSION_REGISTRY_KEY] = registry;
  return registry;
}

export interface SubagentSessionInfo {
  parentSessionId?: string;
}

export class SubagentSessionRegistry {
  private readonly sessions = new Map<string, SubagentSessionInfo>();

  register(sessionId: string, info: SubagentSessionInfo): void {
    this.sessions.set(sessionId, info);
  }

  unregister(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  get(sessionId: string): SubagentSessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}
