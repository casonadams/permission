import { getPathPolicyValues, PATH_BEARING_TOOLS } from "../paths/path-utils";
import { getNonEmptyString, toRecord } from "../shared/common";
import { createMcpPermissionTargets } from "./mcp/mcp-targets";
import { SPECIAL_PERMISSION_KEYS } from "./permission-surfaces";

type PublicInputBuilder = (value: string) => unknown;

const VALUE_INPUT_BUILDERS: Record<string, PublicInputBuilder> = {
  bash: (value) => ({ command: value }),
  skill: (value) => ({ name: value }),
  mcp: (value) => (value.trim() ? { tool: value } : {}),
};

export function buildInputForSurface(surface: string, value: string | undefined): unknown {
  if (usesPathPolicyValues(surface)) return { path: value ?? "" };
  const builder = VALUE_INPUT_BUILDERS[surface];
  return builder ? builder(value ?? "") : {};
}

export interface NormalizedInput {
  surface: string;
  values: string[];
  resultExtras: Record<string, unknown>;
}

type NormalizeInputArgs = [configuredMcpServerNames: readonly string[], cwd?: string];

type NormalizeInputContext = {
  toolName: string;
  input: unknown;
  configuredMcpServerNames: readonly string[];
  cwd?: string;
};

export function normalizeInput(toolName: string, input: unknown, ...args: NormalizeInputArgs): NormalizedInput {
  const [configuredMcpServerNames, cwd] = args;
  return normalizeInputCore({ toolName, input, configuredMcpServerNames, cwd });
}

function normalizeInputCore(ctx: NormalizeInputContext): NormalizedInput {
  if (usesPathPolicyValues(ctx.toolName)) return normalizePathInput(ctx.toolName, ctx.input, ctx.cwd);
  if (ctx.toolName === "skill") return normalizeSkillInput(ctx.input);
  if (ctx.toolName === "bash") return normalizeBashInput(ctx.input);
  if (ctx.toolName === "mcp") return normalizeMcpInput(ctx.input, ctx.configuredMcpServerNames);
  return { surface: ctx.toolName, values: ["*"], resultExtras: {} };
}

function usesPathPolicyValues(toolName: string): boolean {
  return SPECIAL_PERMISSION_KEYS.has(toolName) || PATH_BEARING_TOOLS.has(toolName);
}

function normalizePathInput(surface: string, input: unknown, cwd: string | undefined): NormalizedInput {
  return { surface, values: normalizePathSurfaceValues(input, cwd), resultExtras: {} };
}

function normalizeSkillInput(input: unknown): NormalizedInput {
  const skillName = toRecord(input).name;
  const lookupValue = typeof skillName === "string" ? skillName : "*";
  return { surface: "skill", values: [lookupValue], resultExtras: {} };
}

function normalizeBashInput(input: unknown): NormalizedInput {
  const commandValue = toRecord(input).command;
  const command = typeof commandValue === "string" ? commandValue : "";
  return { surface: "bash", values: [command], resultExtras: { command } };
}

function normalizeMcpInput(input: unknown, configuredMcpServerNames: readonly string[]): NormalizedInput {
  const mcpTargets = [...createMcpPermissionTargets(input, configuredMcpServerNames), "mcp"];
  const fallbackTarget = mcpTargets[0] ?? "mcp";
  return { surface: "mcp", values: mcpTargets, resultExtras: { target: fallbackTarget } };
}

function normalizePathSurfaceValues(input: unknown, cwd?: string): string[] {
  const path = getNonEmptyString(toRecord(input).path);
  if (path === null) return ["*"];
  const values = getPathPolicyValues(path, cwd ? { cwd } : {});
  return values.length > 0 ? values : ["*"];
}
