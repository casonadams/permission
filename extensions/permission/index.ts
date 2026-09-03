import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, getPackageDir } from "@earendil-works/pi-coding-agent";
import { type DecisionComponent, decideToolCall, type ToolCallCheck } from "./decide";
import { type CompiledRule, compileRule, decideSurface } from "./match";
import { buildPolicy, loadPolicy, type Policy, saveAllowRules } from "./policy";
import { promptPermission } from "./prompt";

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
    const { decision, components, sessionDrafts } = decideToolCall(policy, sessionRules, call);
    if (decision.state === "allow") return undefined;
    if (decision.state === "deny") return { block: true, reason: decision.reason ?? DENY_REASON };
    if (!ctx.hasUI) return { block: true, reason: NO_UI_REASON };

    const defaultPattern = sessionDrafts[0]?.pattern;
    const outcome = await promptPermission(ctx.ui, "Permission required", describeAsk(components), defaultPattern);
    if (!outcome.approved) return { block: true, reason: outcome.reason ?? DENY_REASON };
    if (outcome.always) {
      const pattern = outcome.pattern;
      const drafts =
        pattern && sessionDrafts.length > 0
          ? sessionDrafts.map((draft, i) => (i === 0 ? { ...draft, pattern } : draft))
          : sessionDrafts;
      activateRules(ctx, targetPolicyPath, sessionRules, drafts);
    }
    return undefined;
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
  const outcome = await promptPermission(ctx.ui, "Permission required", promptMsg, skillName);
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

export function extractSkillName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/skill:")) return null;
  const name = trimmed.slice("/skill:".length).trim().split(/\s/, 1)[0].trim();
  return name || null;
}

function describeAsk(components: readonly DecisionComponent[]): string {
  return components.map((component) => `${component.surface}: ${component.value}`).join("\n");
}
