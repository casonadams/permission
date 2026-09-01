import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, getPackageDir } from "@earendil-works/pi-coding-agent";
import { type DecisionComponent, decideToolCall, type ToolCallCheck } from "./decide";
import { type CompiledRule, compileRule, decideSurface } from "./match";
import { buildPolicy, loadPolicy, type Policy } from "./policy";
import { promptPermission } from "./prompt";

const DENY_REASON = "denied by permission policy";
const NO_UI_REASON = "permission required but no interactive UI is available";
// ponytail: CONFIG_DIR_NAME is declared in pi's types but absent from the 0.79.x runtime build
const CONFIG_DIR_NAME = ".pi";

export default function permissionExtension(pi: ExtensionAPI): void {
  let policy: Policy = buildPolicy(null, null);
  let sessionRules: CompiledRule[] = [];
  let infrastructureDirs: readonly string[] = [];

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
    policy = loadPolicy({
      globalPath: join(agentDir, "permission.json"),
      projectPath: join(ctx.cwd, CONFIG_DIR_NAME, "agent", "permission.json"),
    }).policy;
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

    const outcome = await promptPermission(ctx.ui, "Permission required", describeAsk(components));
    if (!outcome.approved) return { block: true, reason: outcome.reason ?? DENY_REASON };
    if (outcome.forSession) {
      sessionRules.push(...sessionDrafts.map((draft) => compileRule({ ...draft, state: "allow" })));
    }
    return undefined;
  });

  pi.on("input", async (event, ctx) => {
    const skillName = extractSkillName(event.text);
    if (!skillName) return { action: "continue" };

    const decision = decideSurface([...policy.rules, ...sessionRules], "skill", [skillName], "first");
    if (decision.state === "allow") return { action: "continue" };
    if (decision.state === "deny") {
      if (ctx.hasUI) ctx.ui.notify(`Skill '${skillName}' is denied by permission policy`, "warning");
      return { action: "handled" };
    }
    if (!ctx.hasUI) {
      notifyBlockedSkill(ctx, skillName);
      return { action: "handled" };
    }

    const outcome = await promptPermission(
      ctx.ui,
      "Permission required",
      `skill: ${skillName}${decision.reason ? `\n${decision.reason}` : ""}`,
    );
    if (outcome.approved) {
      if (outcome.forSession) sessionRules.push(compileRule({ surface: "skill", pattern: skillName, state: "allow" }));
      return { action: "continue" };
    }
    ctx.ui.notify(`Skill '${skillName}' blocked: ${outcome.reason ?? DENY_REASON}`, "warning");
    return { action: "handled" };
  });
}

function notifyBlockedSkill(ctx: ExtensionContext, skillName: string): void {
  if (ctx.hasUI) ctx.ui.notify(`Skill '${skillName}' requires approval but no UI is available`, "warning");
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
