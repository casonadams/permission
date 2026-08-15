import type { PermissionCheckResult } from "#src/policy/types";
import { formatSkillAskPrompt } from "#src/prompting/permission-prompts";
import type { GateDescriptor } from "./descriptor";

export function describeSkillInputGate(
  skillName: string,
  agentName: string | null,
  preCheck: PermissionCheckResult,
): GateDescriptor {
  const message = formatSkillAskPrompt(skillName, agentName ?? undefined);
  return {
    surface: "skill",
    input: { name: skillName },
    preCheck,
    denialContext: {
      kind: "skill_input",
      skillName,
      agentName: agentName ?? undefined,
    },
    promptDetails: {
      source: "skill_input",
      agentName,
      message,
      skillName,
    },
    decision: {
      surface: "skill",
      value: skillName,
    },
  };
}
