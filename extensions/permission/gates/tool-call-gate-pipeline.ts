import type { SkillPromptEntry } from "#src/app/skill-prompt-sanitizer";
import type { ToolAccessExtractorLookup } from "#src/integrations/tool-access-extractor-registry";
import type { ToolInputFormatterLookup } from "#src/integrations/tool-input-formatter-registry";
import type { ScopedPermissionResolver } from "#src/policy/permission-resolver";
import type { PermissionCheckResult } from "#src/policy/types";
import { DEFAULT_TOOL_PREVIEW_OPTIONS, ToolPreviewFormatter } from "#src/prompting/tool-preview-formatter";
import { getNonEmptyString, toRecord } from "#src/shared/common";
import { resolveBashCommandCheck } from "./bash-command";
import { describeBashPathGate } from "./bash-path";
import { BashProgram } from "./bash-program";
import type { GateResult } from "./descriptor";
import { describePathGate } from "./path";
import type { GateRunner } from "./runner";
import { describeSkillReadGate } from "./skill-read";
import { describeToolGate } from "./tool";
import type { GateOutcome, ToolCallContext } from "./types";

export interface ToolCallGateInputs {
  getActiveSkillEntries(): SkillPromptEntry[];
  getInfrastructureReadDirs(): string[];
}

type GateProducer = () => GateResult | Promise<GateResult>;

export interface ToolCallGatePipelineDeps {
  resolver: ScopedPermissionResolver;
  inputs: ToolCallGateInputs;
  customFormatters?: ToolInputFormatterLookup;
  customExtractors?: ToolAccessExtractorLookup;
}

export class ToolCallGatePipeline {
  private readonly resolver: ScopedPermissionResolver;
  private readonly inputs: ToolCallGateInputs;
  private readonly customFormatters?: ToolInputFormatterLookup;
  private readonly customExtractors?: ToolAccessExtractorLookup;

  constructor(deps: ToolCallGatePipelineDeps) {
    this.resolver = deps.resolver;
    this.inputs = deps.inputs;
    this.customFormatters = deps.customFormatters;
    this.customExtractors = deps.customExtractors;
  }

  async evaluate(tcc: ToolCallContext, runner: GateRunner): Promise<GateOutcome> {
    const command = getNonEmptyString(toRecord(tcc.input).command);
    const bashProgram = tcc.toolName === "bash" && command ? await BashProgram.parse(command) : null;

    const formatter = new ToolPreviewFormatter(DEFAULT_TOOL_PREVIEW_OPTIONS, this.customFormatters);

    const infraDirs = this.inputs.getInfrastructureReadDirs();

    const gateProducers: GateProducer[] = [
      () => describeSkillReadGate(tcc, () => this.inputs.getActiveSkillEntries()),
      () => describePathGate(tcc, this.resolver, this.customExtractors, infraDirs),
      () => describeBashPathGate(tcc, bashProgram, this.resolver),
      () => {
        const toolCheck = this.resolveToolCheck(tcc, command, bashProgram);
        const toolDescriptor = describeToolGate(tcc, toolCheck, formatter);
        toolDescriptor.preCheck = toolCheck;
        return toolDescriptor;
      },
    ];

    return runGateProducers({ gateProducers, tcc, runner });
  }

  private resolveToolCheck(
    tcc: ToolCallContext,
    command: string | null,
    bashProgram: BashProgram | null,
  ): PermissionCheckResult {
    const agentName = tcc.agentName ?? undefined;
    const bashCommand = command ?? "";
    if (tcc.toolName === "bash" && bashProgram) {
      return resolveBashCommandCheck({
        command: bashCommand,
        commands: bashProgram.commands(),
        agentName,
        resolver: this.resolver,
      });
    }
    return this.resolver.resolve(tcc.toolName, tcc.input, agentName);
  }
}

async function runGateProducers(args: {
  gateProducers: GateProducer[];
  tcc: ToolCallContext;
  runner: GateRunner;
}): Promise<GateOutcome> {
  let toolCallApproved = false;
  for (const produce of args.gateProducers) {
    const outcome = await args.runner.run(await produce(), args.tcc.agentName, args.tcc.toolCallId, toolCallApproved);
    if (outcome.action === "block") return outcome;
    if (args.tcc.toolName === "bash" && outcome.toolCallApproved) toolCallApproved = true;
  }
  return { action: "allow" };
}
