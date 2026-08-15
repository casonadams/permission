import type { ToolInputFormatter, ToolInputFormatterRegistrar } from "../integrations/tool-customizations";
import { toRecord } from "../shared/common";
import { formatArgsSummary } from "./arg-summary";

const MCP_ARGS_SUMMARY_MAX_LENGTH = 160;

export const formatMcpInputForPrompt: ToolInputFormatter = (input: Record<string, unknown>): string | undefined => {
  const summary = formatArgsSummary(toRecord(input.arguments), MCP_ARGS_SUMMARY_MAX_LENGTH);
  return summary ? `with ${summary}` : undefined;
};

export function registerBuiltinToolInputFormatters(registry: ToolInputFormatterRegistrar): void {
  registry.register("mcp", formatMcpInputForPrompt);
}
