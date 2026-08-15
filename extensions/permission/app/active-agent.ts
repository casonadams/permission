export interface SessionEntryView {
  type: string;
  customType?: string;
  data?: unknown;
}

export interface ActiveAgentContext {
  sessionManager: { getEntries(): readonly SessionEntryView[] };
}

/** Matches the active-agent tag injected by pi-agent-router. */
export const ACTIVE_AGENT_TAG_REGEX = /<active_agent\s+name=["']([^"']+)["'][^>]*>/i;

export function normalizeAgentName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getActiveAgentName(ctx: ActiveAgentContext): string | null {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const result = agentNameFromEntry(entries[i]);
    if (result !== undefined) return result;
  }
  return null;
}

function agentNameFromEntry(entry: SessionEntryView): string | null | undefined {
  if (!isAgentEntry(entry)) return undefined;
  const data = entry.data as { name?: unknown } | undefined;
  return resolveAgentName(data === undefined ? undefined : data.name);
}

function isAgentEntry(entry: SessionEntryView): boolean {
  return entry.type === "custom" && entry.customType === "active_agent";
}

function resolveAgentName(name: unknown): string | null | undefined {
  if (name === null) return null;
  const normalized = normalizeAgentName(name);
  return normalized === null ? undefined : normalized;
}

export function getActiveAgentNameFromSystemPrompt(systemPrompt: string | undefined): string | null {
  if (!systemPrompt) {
    return null;
  }

  const match = ACTIVE_AGENT_TAG_REGEX.exec(systemPrompt);
  if (!match?.[1]) {
    return null;
  }

  return normalizeAgentName(match[1]);
}
