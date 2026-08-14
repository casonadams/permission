import { applyPermissionGate, type PermissionGateResult } from "#src/gates/permission-gate";
import type { DecisionReporter } from "#src/integrations/decision-reporter";
import type { ScopedPermissionResolver } from "#src/policy/permission-resolver";
import type { SessionApprovalRecorder } from "#src/policy/session-approval-recorder";
import type { PermissionCheckResult } from "#src/policy/types";
import { formatDenyReason, formatUnavailableReason, formatUserDeniedReason } from "#src/prompting/denial-messages";
import type { GatePrompter } from "#src/prompting/gate-prompter";
import { getInstalledGatePrompter } from "#src/prompting/gate-prompter-registry";
import type { PermissionPromptDecision } from "#src/prompting/permission-dialog";
import type { GateDescriptor, GateResult } from "./descriptor";
import { isGateBypass } from "./descriptor";
import { buildDecisionEvent, deriveResolution } from "./helpers";
import type { GateOutcome } from "./types";

export interface GateRunnerDeps {
  resolver: ScopedPermissionResolver;
  recorder: SessionApprovalRecorder;
  defaultPrompter: GatePrompter;
  reporter: DecisionReporter;
}

type DescriptorRunContext = { descriptor: GateDescriptor; agentName: string | null; toolCallId: string };
type GateRunArgs = [agentName: string | null, toolCallId: string, toolCallApproved?: boolean];
type AppliedDescriptorGate = { gateResult: PermissionGateResult; canConfirm: boolean; autoApproved: boolean };

export class GateRunner {
  constructor(private readonly deps: GateRunnerDeps) {}

  private activePrompter(): GatePrompter {
    return getInstalledGatePrompter() ?? this.deps.defaultPrompter;
  }

  async run(gate: GateResult, ...args: GateRunArgs): Promise<GateOutcome> {
    const [agentName, toolCallId] = args;
    const toolCallApproved = args[2] === true;
    if (!gate) {
      return { action: "allow" };
    }
    if (isGateBypass(gate)) {
      if (gate.log) {
        this.deps.reporter.writeReviewLog(gate.log.event, gate.log.details);
      }
      if (gate.decision) {
        this.deps.reporter.emitDecision(gate.decision);
      }
      return { action: "allow" };
    }
    return this.runDescriptor({ descriptor: gate, agentName, toolCallId }, toolCallApproved);
  }

  private async runDescriptor(ctx: DescriptorRunContext, toolCallApproved: boolean): Promise<GateOutcome> {
    const check = this.resolveDescriptorCheck(ctx);
    if (toolCallApproved && check.state === "ask") return { action: "allow" };
    const sessionHit = this.handleSessionHit(ctx, check);
    if (sessionHit) return sessionHit;

    const applied = await this.applyDescriptorGate(ctx, check);
    this.emitGateDecision(ctx, check, applied);
    this.recordSessionApproval(ctx.descriptor, applied.gateResult);
    return toGateOutcome(applied.gateResult, check.state === "ask");
  }

  private resolveDescriptorCheck(ctx: DescriptorRunContext): PermissionCheckResult {
    if (ctx.descriptor.preCheck) return ctx.descriptor.preCheck;
    if (ctx.descriptor.preResolved) {
      return {
        state: ctx.descriptor.preResolved.state,
        toolName: ctx.descriptor.surface,
        source: "tool",
        origin: "builtin",
      };
    }
    return this.deps.resolver.resolve(ctx.descriptor.surface, ctx.descriptor.input, ctx.agentName ?? undefined);
  }

  private handleSessionHit(ctx: DescriptorRunContext, check: PermissionCheckResult): GateOutcome | null {
    if (check.source !== "session") return null;
    this.deps.reporter.writeReviewLog("permission_request.session_approved", {
      ...ctx.descriptor.logContext,
      agentName: ctx.agentName,
      resolution: "session_approved",
      sessionApprovalPattern: check.matchedPattern,
    });
    this.deps.reporter.emitDecision(
      buildDecisionEvent({
        decision: ctx.descriptor.decision,
        check,
        agentName: ctx.agentName,
        result: "allow",
        resolution: "session_approved",
      }),
    );
    return { action: "allow" };
  }

  private async applyDescriptorGate(
    ctx: DescriptorRunContext,
    check: PermissionCheckResult,
  ): Promise<AppliedDescriptorGate> {
    const prompter = this.activePrompter();
    const canConfirm = prompter.canConfirm();
    let autoApproved = false;
    const gateResult = await applyPermissionGate({
      state: check.state,
      canConfirm,
      sessionApproval: ctx.descriptor.sessionApproval?.toGateApproval(),
      promptForApproval: async () => {
        const decision = await prompter.prompt({ requestId: ctx.toolCallId, ...ctx.descriptor.promptDetails });
        autoApproved = decision.autoApproved === true;
        return decision;
      },
      writeLog: (event, details) => this.deps.reporter.writeReviewLog(event, details),
      logContext: { ...ctx.descriptor.logContext, agentName: ctx.agentName },
      messages: buildGateMessages(ctx.descriptor),
    });
    return { gateResult, canConfirm, autoApproved };
  }

  private emitGateDecision(
    ctx: DescriptorRunContext,
    check: PermissionCheckResult,
    applied: AppliedDescriptorGate,
  ): void {
    this.deps.reporter.emitDecision(
      buildDecisionEvent({
        decision: ctx.descriptor.decision,
        check,
        agentName: ctx.agentName,
        result: applied.gateResult.action === "allow" ? "allow" : "deny",
        resolution: deriveResolution({
          state: check.state,
          action: applied.gateResult.action,
          hasSession: hasSessionApproval(applied.gateResult),
          canConfirm: applied.canConfirm,
          autoApproved: applied.autoApproved,
        }),
      }),
    );
  }

  private recordSessionApproval(descriptor: GateDescriptor, gateResult: PermissionGateResult): void {
    if (hasSessionApproval(gateResult) && descriptor.sessionApproval)
      this.deps.recorder.recordSessionApproval(descriptor.sessionApproval);
  }
}

function buildGateMessages(descriptor: GateDescriptor) {
  return {
    denyReason: formatDenyReason(descriptor.denialContext),
    unavailableReason: formatUnavailableReason(descriptor.denialContext),
    userDeniedReason: (decision: PermissionPromptDecision) =>
      formatUserDeniedReason(descriptor.denialContext, decision.denialReason),
  };
}
function hasSessionApproval(r: PermissionGateResult): boolean {
  return r.action === "allow" && r.sessionApproval !== undefined;
}
function toGateOutcome(gateResult: PermissionGateResult, asked: boolean): GateOutcome {
  if (gateResult.action === "block") return { action: "block", reason: gateResult.reason };
  return asked ? { action: "allow", toolCallApproved: true } : { action: "allow" };
}
