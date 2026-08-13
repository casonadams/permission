import type { SkillPromptEntry } from "#src/app/skill-prompt-sanitizer";
import { findSkillPathMatch } from "#src/app/skill-prompt-sanitizer";
import { normalizePathForComparison } from "#src/paths/path-utils";
import { formatSkillPathAskPrompt } from "#src/prompting/permission-prompts";
import { toRecord } from "#src/shared/common";
import type { GateDescriptor } from "./descriptor";
import type { ToolCallContext } from "./types";

/**
 * Build a pure descriptor for the skill-read permission gate.
 *
 * Returns `null` when the gate does not apply (tool is not `read`, no active
 * skill entries, or the read path does not match any skill).
 * Returns a GateDescriptor with preResolved state from the matched skill entry.
 */
export function describeSkillReadGate(
  tcc: ToolCallContext,
  getActiveSkillEntries: () => SkillPromptEntry[],
): GateDescriptor | null {
  const activeSkillEntries = getActiveSkillEntries();

  if (tcc.toolName !== "read" || activeSkillEntries.length === 0) {
    return null;
  }

  const match = findSkillReadMatch(tcc, activeSkillEntries);
  if (!match) return null;

  return buildSkillReadDescriptor(tcc, match.skill, match.path);
}

function findSkillReadMatch(
  tcc: ToolCallContext,
  activeSkillEntries: SkillPromptEntry[],
): { skill: SkillPromptEntry; path: string } | null {
  const inputRecord = toRecord(tcc.input);
  const path = typeof inputRecord.path === "string" ? inputRecord.path : "";
  if (!path || tcc.cwd === undefined) return null;

  const normalizedReadPath = normalizePathForComparison(path, tcc.cwd);
  const skill = findSkillPathMatch(normalizedReadPath, activeSkillEntries);
  return skill ? { skill, path } : null;
}

function buildSkillReadDescriptor(tcc: ToolCallContext, matchedSkill: SkillPromptEntry, path: string): GateDescriptor {
  const message = formatSkillPathAskPrompt(matchedSkill, path, tcc.agentName ?? undefined);

  return {
    surface: "skill",
    input: { name: matchedSkill.name },
    denialContext: {
      kind: "skill_read",
      skillName: matchedSkill.name,
      readPath: path,
      agentName: tcc.agentName ?? undefined,
    },
    promptDetails: {
      source: "skill_read",
      agentName: tcc.agentName,
      message,
      toolCallId: tcc.toolCallId,
      toolName: tcc.toolName,
      skillName: matchedSkill.name,
      path,
    },
    logContext: {
      source: "skill_read",
      skillName: matchedSkill.name,
      agentName: tcc.agentName,
      path,
      message,
    },
    decision: {
      surface: "skill",
      value: matchedSkill.name,
    },
    preResolved: {
      state: matchedSkill.state,
    },
  };
}
