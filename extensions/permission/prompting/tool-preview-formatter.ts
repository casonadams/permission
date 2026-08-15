import type { ToolInputFormatterLookup } from "../integrations/tool-input-formatter-registry";
import { SEARCH_PATH_TOOLS } from "../policy/permission-surfaces";
import type { PermissionCheckResult } from "../policy/types";
import { getNonEmptyString, toRecord } from "../shared/common";
import { formatArgsSummary } from "./arg-summary";
import {
  serializeToolInputPreview,
  TOOL_INPUT_LOG_PREVIEW_MAX_LENGTH,
  TOOL_INPUT_PREVIEW_MAX_LENGTH,
  TOOL_TEXT_SUMMARY_MAX_LENGTH,
  truncateInlineText,
} from "./tool-input-preview";
import {
  formatBashInputForPrompt,
  formatEditInputForPrompt,
  formatReadInputForPrompt,
  formatSkillInputForPrompt,
  formatWriteInputForPrompt,
  getPromptPath,
} from "./tool-input-prompt-formatters";

export interface ToolPreviewFormatterOptions {
  toolInputPreviewMaxLength: number;
  toolTextSummaryMaxLength: number;
  toolInputLogPreviewMaxLength: number;
}

export const DEFAULT_TOOL_PREVIEW_OPTIONS: ToolPreviewFormatterOptions = {
  toolInputPreviewMaxLength: TOOL_INPUT_PREVIEW_MAX_LENGTH,
  toolTextSummaryMaxLength: TOOL_TEXT_SUMMARY_MAX_LENGTH,
  toolInputLogPreviewMaxLength: TOOL_INPUT_LOG_PREVIEW_MAX_LENGTH,
};

function isOmittedFromToolInputLog(result: PermissionCheckResult): boolean {
  return result.toolName === "bash" || result.toolName === "mcp" || result.source === "mcp";
}

const TOOL_INPUT_FORMATTERS: Record<string, (input: Record<string, unknown>) => string> = {
  edit: formatEditInputForPrompt,
  write: formatWriteInputForPrompt,
  read: formatReadInputForPrompt,
  bash: formatBashInputForPrompt,
  skill: formatSkillInputForPrompt,
};

function isSearchTool(toolName: string): boolean {
  return SEARCH_PATH_TOOLS.has(toolName);
}

function formatNamedPromptPart(name: string, value: string | null, sanitize: (value: string) => string): string | null {
  return value ? `${name} '${sanitize(value)}'` : null;
}

function formatPathPromptPart(path: string | null, toolName: string): string | null {
  if (path) return `path '${path}'`;
  return isSearchTool(toolName) ? "current working directory" : null;
}

export class ToolPreviewFormatter {
  constructor(
    private readonly options: ToolPreviewFormatterOptions,
    private readonly customFormatters?: ToolInputFormatterLookup,
  ) {}

  sanitizeInlineText(value: string, maxLength?: number): string {
    const limit = maxLength ?? this.options.toolTextSummaryMaxLength;
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized ? truncateInlineText(normalized, limit) : "empty text";
  }

  formatJsonInputForPrompt(input: unknown): string {
    const inline = serializeToolInputPreview(input);
    return inline ? `with input ${truncateInlineText(inline, this.options.toolInputPreviewMaxLength)}` : "";
  }

  formatArgsInputForPrompt(input: unknown): string {
    const summary = formatArgsSummary(toRecord(input), this.options.toolInputPreviewMaxLength);
    return summary ? `with ${summary}` : this.formatJsonInputForPrompt(input);
  }

  formatSearchInputForPrompt(toolName: string, input: Record<string, unknown>): string {
    const parts = [
      formatNamedPromptPart("pattern", getNonEmptyString(input.pattern), (value) => this.sanitizeInlineText(value)),
      formatNamedPromptPart("glob", getNonEmptyString(input.glob), (value) => this.sanitizeInlineText(value)),
      formatPathPromptPart(getPromptPath(input), toolName),
    ].filter((part): part is string => part !== null);

    return parts.length > 0 ? `for ${parts.join(", ")}` : "";
  }

  formatToolInputForPrompt(toolName: string, input: unknown): string {
    const inputRecord = toRecord(input);
    const customPreview = this.formatCustomInput(toolName, inputRecord);
    if (customPreview !== null) return customPreview;

    return this.formatBuiltInToolInput(toolName, input, inputRecord);
  }

  private formatCustomInput(toolName: string, input: Record<string, unknown>): string | null {
    const custom = this.customFormatters?.get(toolName);
    const rendered = custom ? custom(input) : undefined;
    return rendered === undefined ? null : rendered;
  }

  private formatBuiltInToolInput(toolName: string, input: unknown, inputRecord: Record<string, unknown>): string {
    const formatter = TOOL_INPUT_FORMATTERS[toolName];
    if (formatter) return formatter(inputRecord);
    if (isSearchTool(toolName)) return this.formatSearchInputForPrompt(toolName, inputRecord);
    if (toolName === "mcp") return "";
    return this.formatArgsInputForPrompt(input);
  }

  formatGenericToolInputForLog(input: unknown): string | undefined {
    const inline = serializeToolInputPreview(input);
    return inline ? `input ${truncateInlineText(inline, this.options.toolInputLogPreviewMaxLength)}` : undefined;
  }

  getToolInputPreviewForLog(
    result: PermissionCheckResult,
    input: unknown,
    pathBearingTools: ReadonlySet<string>,
  ): string | undefined {
    if (isOmittedFromToolInputLog(result)) return undefined;

    if (pathBearingTools.has(result.toolName)) {
      const inputPreview = this.formatToolInputForPrompt(result.toolName, input);
      return inputPreview ? truncateInlineText(inputPreview, this.options.toolInputLogPreviewMaxLength) : undefined;
    }

    return this.formatGenericToolInputForLog(input);
  }

  getPermissionLogContext(
    result: PermissionCheckResult,
    input: unknown,
    pathBearingTools: ReadonlySet<string>,
  ): {
    command?: string;
    target?: string;
    toolInputPreview?: string;
    origin?: string;
  } {
    return {
      command: result.command,
      target: result.target,
      toolInputPreview: this.getToolInputPreviewForLog(result, input, pathBearingTools),
      origin: result.origin,
    };
  }
}
