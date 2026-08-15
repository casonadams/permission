import { createPermissionRequestId } from "#src/integrations/request-id";
import type { PermissionCheckResult } from "#src/policy/types";
import type { GateRunner } from "./runner";
import { describeSkillInputGate } from "./skill-input";
import type { GateOutcome } from "./types";

export interface SkillInputGateInputs {
  checkPermission(surface: string, input: unknown, agentName?: string): PermissionCheckResult;
}

export interface GateNotifier {
  warn(message: string): void;
}

export interface SkillInputGateEvaluation {
  skillName: string;
  agentName: string | null;
  notifier: GateNotifier;
  runner: GateRunner;
}

export class SkillInputGatePipeline {
  constructor(private readonly inputs: SkillInputGateInputs) {}

  evaluate(args: SkillInputGateEvaluation): Promise<GateOutcome> {
    const check = this.inputs.checkPermission("skill", { name: args.skillName }, args.agentName ?? undefined);
    if (check.state === "deny") {
      args.notifier.warn(formatSkillDenyNotice(args.skillName, args.agentName));
    }
    return args.runner.run(
      describeSkillInputGate(args.skillName, args.agentName, check),
      args.agentName,
      createSkillInputRequestId(),
    );
  }
}

export function createSkillInputRequestId(): string {
  return createPermissionRequestId("skill-input");
}

export function formatSkillDenyNotice(skillName: string, agentName: string | null): string {
  return agentName
    ? `Skill '${skillName}' is not permitted for agent '${agentName}'.`
    : `Skill '${skillName}' is not permitted by the current skill policy.`;
}
