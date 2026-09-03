import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, getPackageDir } from "@earendil-works/pi-coding-agent";
import { formatBashCommand } from "./bash";
import {
  type DecisionComponent,
  decideToolCall,
  stringInput,
  type ToolCallCheck,
  type ToolCallDecision,
} from "./decide";
import { type CompiledRule, compileRule, decideSurface } from "./match";
import { buildPolicy, loadPolicy, type Policy, saveAllowRules } from "./policy";
import { type PromptDetails, promptPermission } from "./prompt";
import { extractToolInputPath } from "./tool-paths";

const DENY_REASON = "denied by permission policy";
const NO_UI_REASON = "permission required but no interactive UI is available";
// ponytail: CONFIG_DIR_NAME is declared in pi's types but absent from the 0.79.x runtime build
const CONFIG_DIR_NAME = ".pi";

export default function permissionExtension(pi: ExtensionAPI): void {
  let policy: Policy = buildPolicy(null, null);
  let sessionRules: CompiledRule[] = [];
  let infrastructureDirs: readonly string[] = [];
  let targetPolicyPath = "";

  pi.on("session_start", (_event, ctx) => {
    sessionRules = [];
    const agentDir = getAgentDir();
    const packageDir = getPackageDir();
    infrastructureDirs = [
      agentDir,
      ...(packageDir ? [packageDir] : []),
      join(ctx.cwd, CONFIG_DIR_NAME, "npm"),
      join(ctx.cwd, CONFIG_DIR_NAME, "git"),
    ];
    const globalPath = join(agentDir, "permission.json");
    const projectPath = join(ctx.cwd, CONFIG_DIR_NAME, "agent", "permission.json");
    targetPolicyPath = existsSync(projectPath) ? projectPath : globalPath;
    policy = loadPolicy({ globalPath, projectPath }).policy;
  });

  pi.on("tool_call", async (event, ctx) => {
    const call: ToolCallCheck = {
      toolName: event.toolName,
      input: event.input,
      cwd: ctx.cwd,
      infrastructureDirs,
    };
    const toolDecision = decideToolCall(policy, sessionRules, call);
    const { decision } = toolDecision;
    if (decision.state === "allow") return undefined;
    if (decision.state === "deny") return { block: true, reason: decision.reason ?? DENY_REASON };
    if (!ctx.hasUI) return { block: true, reason: NO_UI_REASON };

    return promptAndResolveToolCall(event, ctx, toolDecision, { targetPolicyPath, sessionRules });
  });

  pi.on("input", async (event, ctx) => {
    return handleSkillInput(event.text, ctx, [...policy.rules, ...sessionRules], (name) => {
      activateRules(ctx, targetPolicyPath, sessionRules, [{ surface: "skill", pattern: name }]);
    });
  });
}

async function handleSkillInput(
  text: string,
  ctx: ExtensionContext,
  rules: readonly CompiledRule[],
  onAlwaysAllow: (name: string) => void,
): Promise<{ action: "continue" | "handled" }> {
  const skillName = extractSkillName(text);
  if (!skillName) return { action: "continue" };

  const decision = decideSurface(rules, "skill", [skillName], "first");
  if (decision.state === "allow") return { action: "continue" };
  if (decision.state === "deny") {
    if (ctx.hasUI) ctx.ui.notify(`Skill '${skillName}' is denied by permission policy`, "warning");
    return { action: "handled" };
  }
  if (!ctx.hasUI) return { action: "handled" };

  const promptMsg = `skill: ${skillName}${decision.reason ? `\n${decision.reason}` : ""}`;
  const outcome = await promptPermission(ctx.ui, "Permission required", promptMsg, {
    rawInput: skillName,
    defaultPattern: skillName,
    inputSurface: "skill",
    ruleSurface: "skill",
  });
  if (outcome.approved) {
    if (outcome.always) onAlwaysAllow(outcome.pattern ?? skillName);
    return { action: "continue" };
  }
  ctx.ui.notify(`Skill '${skillName}' blocked: ${outcome.reason ?? DENY_REASON}`, "warning");
  return { action: "handled" };
}

function activateRules(
  ctx: ExtensionContext,
  targetPath: string,
  sessionRules: CompiledRule[],
  drafts: readonly { surface: string; pattern: string }[],
): void {
  sessionRules.push(...drafts.map((draft) => compileRule({ ...draft, state: "allow" })));
  try {
    saveAllowRules(targetPath, drafts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (ctx.hasUI) ctx.ui.notify(`Failed to save permission rule: ${message}`, "warning");
  }
}

interface SessionContext {
  readonly targetPolicyPath: string;
  readonly sessionRules: CompiledRule[];
}

async function promptAndResolveToolCall(
  event: { toolName: string; input: unknown },
  ctx: ExtensionContext,
  decision: ToolCallDecision,
  session: SessionContext,
): Promise<{ block?: boolean; reason?: string } | undefined> {
  const rawCommand = event.toolName === "bash" ? stringInput(event.input, "command") : null;
  const details = buildPromptDetails(event, decision.sessionDrafts);
  const outcome = await promptPermission(
    ctx.ui,
    "Permission required",
    describeAsk(decision.components, rawCommand),
    details,
  );
  if (!outcome.approved) return { block: true, reason: outcome.reason ?? DENY_REASON };
  if (outcome.editedInput) {
    applyEditedInput(event.toolName, event.input, outcome.editedInput);
  }
  if (outcome.always) {
    const drafts =
      decision.sessionDrafts.length > 1 && outcome.pattern
        ? parseMultiDrafts(outcome.pattern, decision.sessionDrafts)
        : resolveAlwaysDrafts(decision.sessionDrafts, outcome.pattern);
    activateRules(ctx, session.targetPolicyPath, session.sessionRules, drafts);
  }
  return undefined;
}

function buildPromptDetails(
  event: { toolName: string; input: unknown },
  sessionDrafts: readonly { surface: string; pattern: string }[],
): PromptDetails {
  const rawCommand = event.toolName === "bash" ? stringInput(event.input, "command") : null;
  const rawInput = rawCommand ?? extractToolInputPath(event.toolName, event.input) ?? undefined;
  const defaultPattern =
    sessionDrafts.length > 1
      ? sessionDrafts.map((d) => `${d.surface}: ${d.pattern}`).join("\n")
      : sessionDrafts[0]?.pattern;
  const ruleSurfaces = [...new Set(sessionDrafts.map((d) => d.surface))];
  const ruleSurface = ruleSurfaces.length > 0 ? ruleSurfaces.join(" + ") : undefined;
  return { rawInput, defaultPattern, inputSurface: event.toolName, ruleSurface };
}

export function parseMultiDrafts(
  text: string,
  fallbackDrafts: readonly { surface: string; pattern: string }[],
): readonly { surface: string; pattern: string }[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return fallbackDrafts;

  const result: { surface: string; pattern: string }[] = [];
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const surface = line.slice(0, colonIndex).trim();
      const pattern = line.slice(colonIndex + 1).trim();
      if (surface && pattern) {
        result.push({ surface, pattern });
        continue;
      }
    }
    result.push({ surface: fallbackDrafts[0]?.surface ?? "bash", pattern: line });
  }
  return result.length > 0 ? result : fallbackDrafts;
}

function resolveAlwaysDrafts(
  sessionDrafts: readonly { surface: string; pattern: string }[],
  pattern?: string,
): readonly { surface: string; pattern: string }[] {
  if (pattern && sessionDrafts.length > 0) {
    return sessionDrafts.map((draft, i) => (i === 0 ? { ...draft, pattern } : draft));
  }
  return sessionDrafts;
}

function applyEditedInput(toolName: string, input: unknown, edited: string): void {
  if (typeof input !== "object" || input === null) return;
  const record = input as Record<string, unknown>;
  if (toolName === "bash" || "command" in record) {
    record.command = edited;
  } else if ("path" in record) {
    record.path = edited;
  }
}

export function extractSkillName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/skill:")) return null;
  const name = trimmed.slice("/skill:".length).trim().split(/\s/, 1)[0].trim();
  return name || null;
}

function describeAsk(components: readonly DecisionComponent[], rawCommand?: string | null): string {
  if (rawCommand && components.some((c) => c.surface === "bash")) {
    const formatted = formatBashCommand(rawCommand);
    return formatted.includes("\n") ? `bash:\n${formatted}` : `bash: ${formatted}`;
  }
  return components.map((component) => `${component.surface}: ${component.value}`).join("\n");
}
