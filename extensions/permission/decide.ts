import { analyzeBashCommand, type BashAnalysis } from "./bash";
import { type CompiledRule, type Decision, decideSurface, foldMostRestrictive } from "./match";
import type { Policy } from "./policy";
import {
  extractMcpInputPath,
  extractMcpTargets,
  extractToolInputPath,
  isInfrastructureRead,
  isPathOutsideWorkingDirectory,
  parentDirectoryGlob,
  pathPolicyValues,
} from "./tool-paths";

export interface ToolCallCheck {
  readonly toolName: string;
  readonly input: unknown;
  readonly cwd?: string;
  readonly infrastructureDirs?: readonly string[];
}

export interface DecisionComponent {
  readonly surface: string;
  readonly value: string;
  readonly decision: Decision;
}

export interface ToolCallDecision {
  readonly decision: Decision;
  readonly components: readonly DecisionComponent[];
  readonly bash: BashAnalysis | null;
  /** Session-rule additions that would cover the components that resolved to ask. */
  readonly sessionDrafts: readonly { surface: string; pattern: string }[];
}

export function decideToolCall(
  policy: Policy,
  sessionRules: readonly CompiledRule[],
  call: ToolCallCheck,
): ToolCallDecision {
  const rules = [...policy.rules, ...sessionRules];
  const components = call.toolName === "bash" ? bashComponents(rules, call) : nonBashComponents(rules, call);
  const decision = foldMostRestrictive(components.map((component) => component.decision)) ??
    components[0]?.decision ?? { state: "allow" };
  const sessionDrafts = components
    .filter((component) => component.decision.state === "ask")
    .map((component) => sessionDraft(component, call.cwd));
  return { decision, components, bash: call.toolName === "bash" ? bashAnalysis(call) : null, sessionDrafts };
}

function bashAnalysis(call: ToolCallCheck): BashAnalysis {
  return analyzeBashCommand(stringInput(call.input, "command") ?? "");
}

function bashComponents(rules: readonly CompiledRule[], call: ToolCallCheck): DecisionComponent[] {
  const analysis = bashAnalysis(call);
  const components: DecisionComponent[] = [];
  for (const command of analysis.commands) {
    components.push({
      surface: "bash",
      value: command,
      decision: decideSurface(rules, "bash", [command], "first"),
    });
  }
  if (analysis.suspicious) {
    const full = stringInput(call.input, "command") ?? "";
    components.push({ surface: "bash", value: full, decision: { state: "ask" } });
  }
  components.push(...pathComponents(rules, analysis.pathTokens, call));
  return components;
}

function nonBashComponents(rules: readonly CompiledRule[], call: ToolCallCheck): DecisionComponent[] {
  const components: DecisionComponent[] = [];
  const toolPath = extractToolInputPath(call.toolName, call.input);
  const mcpPath = call.toolName === "mcp" ? extractMcpInputPath(call.input) : null;
  const pathValue = toolPath ?? mcpPath;

  if (call.toolName === "mcp") {
    const targets = extractMcpTargets(call.input);
    components.push({
      surface: "mcp",
      value: targets[0] ?? "*",
      decision: decideSurface(rules, "mcp", targets.length > 0 ? targets : ["*"], "first"),
    });
  } else if (toolPath) {
    const values = pathPolicyValues(toolPath, call.cwd);
    components.push({
      surface: call.toolName,
      value: toolPath,
      decision: decideSurface(rules, call.toolName, values.length > 0 ? values : ["*"], "first"),
    });
  } else {
    components.push({
      surface: call.toolName,
      value: "*",
      decision: decideSurface(rules, call.toolName, ["*"], "first"),
    });
  }

  if (pathValue && !isInfrastructureRead(call.toolName, pathValue, call.cwd, call.infrastructureDirs ?? [])) {
    components.push(...pathComponents(rules, [pathValue], call));
  }
  return components;
}

function pathComponents(
  rules: readonly CompiledRule[],
  tokens: readonly string[],
  call: ToolCallCheck,
): DecisionComponent[] {
  const components: DecisionComponent[] = [];
  for (const token of tokens) {
    const decision = decideSurface(rules, "path", pathPolicyValues(token, call.cwd), "any");
    const covered = decision.matchedPattern !== undefined;
    const state = covered ? decision.state : isPathOutsideWorkingDirectory(token, call.cwd) ? "ask" : "allow";
    components.push({ surface: "path", value: token, decision: { ...decision, state } });
  }
  return components;
}

function sessionDraft(component: DecisionComponent, cwd?: string): { surface: string; pattern: string } {
  if (component.surface === "path") {
    return { surface: "path", pattern: parentDirectoryGlob(component.value, cwd) ?? component.value };
  }
  if (component.surface === "bash" || component.surface === "mcp") {
    return { surface: component.surface, pattern: component.value };
  }
  return { surface: component.surface, pattern: "*" };
}

export function stringInput(input: unknown, key: string): string | null {
  if (typeof input !== "object" || input === null) return null;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
