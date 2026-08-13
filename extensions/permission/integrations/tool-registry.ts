import { getNonEmptyString, toRecord } from "../shared/common";

/** Narrow interface for the Pi tool API subset used by handler classes. */
export interface ToolRegistry {
  /** All registered tools (`pi.getAllTools()` — `ToolInfo[]`); kept defensively wide. */
  getAll(): unknown[];
  /** Currently active tool names (`pi.getActiveTools()`). */
  getActive(): string[];
  setActive(names: string[]): void;
}

export type ToolRegistrationCheckResult =
  | {
      status: "missing-tool-name";
    }
  | {
      status: "registered";
      requestedToolName: string;
      normalizedToolName: string;
    }
  | {
      status: "unregistered";
      requestedToolName: string;
      normalizedToolName: string;
      availableToolNames: string[];
    };

function normalizeToolName(toolName: string, aliases: Record<string, string>): string {
  return aliases[toolName] || toolName;
}

function buildReverseAliases(aliases: Record<string, string>): Map<string, string[]> {
  const reverse = new Map<string, string[]>();

  for (const [alias, canonical] of Object.entries(aliases)) {
    const existing = reverse.get(canonical) ?? [];
    if (!existing.includes(alias)) {
      existing.push(alias);
    }
    reverse.set(canonical, existing);
  }

  return reverse;
}

interface ToolNameVariantContext {
  aliases: Record<string, string>;
  reverseAliases: ReadonlyMap<string, readonly string[]>;
}

function addToolNameVariants(value: string, names: Set<string>, ctx: ToolNameVariantContext): void {
  names.add(value);

  const normalized = normalizeToolName(value, ctx.aliases);
  names.add(normalized);

  const canonicalFromAlias = ctx.aliases[value];
  if (canonicalFromAlias) {
    names.add(canonicalFromAlias);
  }

  addAliasValues(names, ctx.reverseAliases.get(value));
  addAliasValues(names, ctx.reverseAliases.get(normalized));
}

function addAliasValues(names: Set<string>, aliases: readonly string[] | undefined): void {
  if (!aliases) return;
  for (const alias of aliases) {
    names.add(alias);
  }
}

function collectRegisteredToolNames(
  registeredTools: readonly unknown[],
  aliases: Record<string, string>,
  reverseAliases: ReadonlyMap<string, readonly string[]>,
): { registeredLookup: Set<string>; availableToolNames: Set<string> } {
  const registeredLookup = new Set<string>();
  const availableToolNames = new Set<string>();

  for (const tool of registeredTools) {
    const name = getToolNameFromValue(tool);
    if (!name) continue;
    availableToolNames.add(name);
    addToolNameVariants(name, registeredLookup, { aliases, reverseAliases });
  }

  return { registeredLookup, availableToolNames };
}

function isRegisteredTool(
  requested: string,
  normalizedToolName: string,
  registeredLookup: ReadonlySet<string>,
): boolean {
  return registeredLookup.has(requested) || registeredLookup.has(normalizedToolName);
}

export function getToolNameFromValue(value: unknown): string | null {
  const direct = getNonEmptyString(value);
  if (direct) {
    return direct;
  }

  const record = toRecord(value);
  const candidates = [record.toolName, record.name, record.tool];

  for (const candidate of candidates) {
    const stringValue = getNonEmptyString(candidate);
    if (stringValue) {
      return stringValue;
    }
  }

  return null;
}

export function checkRequestedToolRegistration(
  requestedToolName: string | null,
  registeredTools: readonly unknown[],
  aliases: Record<string, string> = {},
): ToolRegistrationCheckResult {
  const requested = getNonEmptyString(requestedToolName);
  if (!requested) {
    return {
      status: "missing-tool-name",
    };
  }

  const normalizedToolName = normalizeToolName(requested, aliases);
  const reverseAliases = buildReverseAliases(aliases);

  const { registeredLookup, availableToolNames } = collectRegisteredToolNames(registeredTools, aliases, reverseAliases);

  if (isRegisteredTool(requested, normalizedToolName, registeredLookup)) {
    return {
      status: "registered",
      requestedToolName: requested,
      normalizedToolName,
    };
  }

  return {
    status: "unregistered",
    requestedToolName: requested,
    normalizedToolName,
    availableToolNames: [...availableToolNames].sort((a, b) => a.localeCompare(b)),
  };
}
