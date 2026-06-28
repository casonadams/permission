import { getNonEmptyString, toRecord } from "./common";
import { createMcpPermissionTargets } from "./mcp-targets";
import { getPathPolicyValues, PATH_BEARING_TOOLS } from "./path-utils";
import { SPECIAL_PERMISSION_KEYS } from "./permission-surfaces";

/**
 * Construct a surface-appropriate input object from a raw value string.
 *
 * This is the inverse of `normalizeInput()` — it builds the minimal input
 * object that `PermissionManager.checkPermission()` expects for a given
 * surface, from a single string value.
 *
 * Used by the event-bus RPC handler and the `Symbol.for()` service accessor
 * so external callers can query policy with `(surface, value)` instead of
 * constructing a full tool-call input payload.
 *
 * Note: MCP inputs are complex (server name + tool name derivation). Callers
 * providing an MCP surface receive a best-effort policy evaluation using the
 * value as a pre-qualified target string. Pass the fully-qualified target
 * (e.g. "exa:search" or "exa") directly.
 */
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

/**
 * Surface-normalized representation of a tool invocation used by
 * `checkPermission()` to feed a single `evaluateFirst()` call.
 */
export interface NormalizedInput {
  /** The permission surface for `evaluate()` (e.g. "bash", "mcp", "skill"). */
  surface: string;
  /**
   * Candidate lookup values in priority order (most-specific first).
   * Most surfaces produce a single-element array; MCP produces a
   * multi-candidate list derived from the invocation input.
   */
  values: string[];
  /**
   * Surface-specific fields forwarded verbatim into `PermissionCheckResult`
   * (e.g. `{ command }` for bash, `{ target }` for mcp).
   */
  resultExtras: Record<string, unknown>;
}

type NormalizeInputArgs = [configuredMcpServerNames: readonly string[], cwd?: string];

type NormalizeInputContext = {
  toolName: string;
  input: unknown;
  configuredMcpServerNames: readonly string[];
  cwd?: string;
};

/**
 * Map a raw tool invocation to the surface/values/extras triple needed by
 * `checkPermission()`.
 *
 * @param toolName - Normalized (trimmed) tool name from the tool-call event.
 * @param input    - Raw input payload from the tool-call event.
 * @param configuredMcpServerNames - Ordered list of MCP server names from the
 *   global MCP config, used to derive server-qualified MCP targets.
 */
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

/**
 * Extract and normalize the path lookup values shared by every path surface
 * (`path`, `external_directory`, and the path-bearing tools).
 *
 * Missing, empty, or whitespace-only paths collapse to the surface catch-all
 * `"*"`. When CWD is known, a relative path also produces a normalized
 * absolute policy value and a project-relative alias while keeping its legacy
 * relative value, so values match home- and cwd-anchored patterns
 * symmetrically with how the patterns themselves are expanded (#350).
 *
 * Only `input.path` is read — policy values are never sourced from any other
 * (potentially attacker-controlled) field on the raw tool input.
 */
function normalizePathSurfaceValues(input: unknown, cwd?: string): string[] {
  const path = getNonEmptyString(toRecord(input).path);
  if (path === null) return ["*"];
  const values = getPathPolicyValues(path, cwd ? { cwd } : {});
  return values.length > 0 ? values : ["*"];
}
