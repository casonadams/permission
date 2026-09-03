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
  readonly askReason?: string;
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
    const decision = decideSurface(rules, "bash", [command], "first");
    const askReason =
      decision.state === "ask"
        ? decision.matchedPattern
          ? `rule '${decision.matchedPattern}'`
          : "unlisted command"
        : undefined;
    components.push({
      surface: "bash",
      value: command,
      decision,
      askReason,
    });
  }
  if (analysis.suspicious) {
    const full = stringInput(call.input, "command") ?? "";
    components.push({
      surface: "bash",
      value: full,
      decision: { state: "ask" },
      askReason: "dynamic substitution or syntax",
    });
  }
  components.push(...pathComponents(rules, analysis.pathTokens, call));
  return components;
}

function nonBashComponents(rules: readonly CompiledRule[], call: ToolCallCheck): DecisionComponent[] {
  const components: DecisionComponent[] = [];
  const toolPath = extractToolInputPath(call.toolName, call.input);
  const mcpPath = call.toolName === "mcp" ? extractMcpInputPath(call.input) : null;
  const pathValue = toolPath ?? mcpPath;

  components.push(call.toolName === "mcp" ? mcpComponent(rules, call) : standardToolComponent(rules, call, toolPath));

  if (pathValue && !isInfrastructureRead(call.toolName, pathValue, call.cwd, call.infrastructureDirs ?? [])) {
    components.push(...pathComponents(rules, [pathValue], call));
  }
  return components;
}

function mcpComponent(rules: readonly CompiledRule[], call: ToolCallCheck): DecisionComponent {
  const targets = extractMcpTargets(call.input);
  const decision = decideSurface(rules, "mcp", targets.length > 0 ? targets : ["*"], "first");
  const askReason = decision.state === "ask" ? "unlisted MCP tool" : undefined;
  return { surface: "mcp", value: targets[0] ?? "*", decision, askReason };
}

function standardToolComponent(
  rules: readonly CompiledRule[],
  call: ToolCallCheck,
  toolPath: string | null,
): DecisionComponent {
  if (toolPath) {
    const values = pathPolicyValues(toolPath, call.cwd);
    const decision = decideSurface(rules, call.toolName, values.length > 0 ? values : ["*"], "first");
    const askReason = decision.state === "ask" ? `unlisted ${call.toolName} tool` : undefined;
    return { surface: call.toolName, value: toolPath, decision, askReason };
  }
  const decision = decideSurface(rules, call.toolName, ["*"], "first");
  const askReason = decision.state === "ask" ? `unlisted tool '${call.toolName}'` : undefined;
  return { surface: call.toolName, value: "*", decision, askReason };
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
    const isOutside = !covered && isPathOutsideWorkingDirectory(token, call.cwd);
    const state = covered ? decision.state : isOutside ? "ask" : "allow";
    const askReason =
      state === "ask" ? (covered ? `rule '${decision.matchedPattern}'` : "outside workspace") : undefined;
    components.push({ surface: "path", value: token, decision: { ...decision, state }, askReason });
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
