import type { SkillPromptEntry } from "#src/app/skill-prompt-sanitizer";
import type { ToolAccessExtractorLookup } from "#src/integrations/tool-access-extractor-registry";
import type { ToolInputFormatterLookup } from "#src/integrations/tool-input-formatter-registry";
import type { ScopedPermissionResolver } from "#src/policy/permission-resolver";
import type { PermissionCheckResult } from "#src/policy/types";
import { ToolPreviewFormatter, type ToolPreviewFormatterOptions } from "#src/prompting/tool-preview-formatter";
import { getNonEmptyString, toRecord } from "#src/shared/common";
import { resolveBashCommandCheck } from "./bash-command";
import { describeBashExternalDirectoryGate } from "./bash-external-directory";
import { describeBashPathGate } from "./bash-path";
import { BashProgram } from "./bash-program";
import type { GateResult } from "./descriptor";
import { describeExternalDirectoryGate } from "./external-directory";
import { describePathGate } from "./path";
import type { GateRunner } from "./runner";
import { describeSkillReadGate } from "./skill-read";
import { describeToolGate } from "./tool";
import type { GateOutcome, ToolCallContext } from "./types";

/**
 * Narrow interface the pipeline needs from its session-side dependency.
 *
 * The three query methods needed to assemble gate inputs.
 * The resolver is injected separately as a constructor parameter.
 *
 * `PermissionSession` satisfies this structurally at the construction call
 * site; no `implements` clause is needed and would create a layer-inversion
 * import from the domain module into the handler layer.
 */
export interface ToolCallGateInputs {
  /** Active skill prompt entries for the skill-read gate. */
  getActiveSkillEntries(): SkillPromptEntry[];
  /** Combined infrastructure read directories (static + config-derived). */
  getInfrastructureReadDirs(): string[];
  /** Resolved tool-preview formatter options from the current config. */
  getToolPreviewLimits(): ToolPreviewFormatterOptions;
}

/**
 * Owns the ordered tool-call gate-producer assembly and the run loop.
 *
 * Constructed once in the composition root and injected into
 * `PermissionGateHandler`. `evaluate(tcc, runner)` encapsulates:
 * - bash-command extraction and single `BashProgram.parse` (#308)
 * - `ToolPreviewFormatter` construction from `getToolPreviewLimits()`
 * - infrastructure-dir list from `getInfrastructureReadDirs()`
 * - all six gate producers in their prescribed order
 * - the run loop that returns the first block outcome, or allow
 */
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
    // Parse the bash command exactly once per evaluate; the three bash gates
    // share this single BashProgram instead of each re-parsing (#308).
    const command = getNonEmptyString(toRecord(tcc.input).command);
    const bashProgram = tcc.toolName === "bash" && command ? await BashProgram.parse(command) : null;

    const formatter = new ToolPreviewFormatter(this.inputs.getToolPreviewLimits(), this.customFormatters);

    const infraDirs = this.inputs.getInfrastructureReadDirs();

    const gateProducers: Array<() => GateResult | Promise<GateResult>> = [
      () => describeSkillReadGate(tcc, () => this.inputs.getActiveSkillEntries()),
      () => describePathGate(tcc, this.resolver, this.customExtractors),
      () => describeExternalDirectoryGate(tcc, infraDirs, this.customExtractors),
      () => describeBashExternalDirectoryGate(tcc, bashProgram, this.resolver),
      () => describeBashPathGate(tcc, bashProgram, this.resolver),
      () => {
        const toolCheck = this.resolveToolCheck(tcc, command, bashProgram);
        const toolDescriptor = describeToolGate(tcc, toolCheck, formatter);
        toolDescriptor.preCheck = toolCheck;
        return toolDescriptor;
      },
    ];

    for (const produce of gateProducers) {
      const outcome = await runner.run(await produce(), tcc.agentName, tcc.toolCallId);
      if (outcome.action === "block") {
        return outcome;
      }
    }

    return { action: "allow" };
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
