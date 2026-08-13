/**
 * Built-in tool input formatters registered through the public seam at startup.
 *
 * Each formatter here dogfoods `ToolInputFormatterRegistry.register` — it goes
 * through exactly the same path a third-party extension would use.
 */

import type { ToolInputFormatter, ToolInputFormatterRegistry } from "../integrations/tool-input-formatter-registry";
import { toRecord } from "../shared/common";
import { formatArgsSummary } from "./arg-summary";

/** Maximum total length of the generated argument summary (before "with " prefix). */
const MCP_ARGS_SUMMARY_MAX_LENGTH = 160;

/**
 * Format an MCP tool call's `arguments` payload as a human-readable summary.
 *
 * Returns `undefined` when `arguments` is absent or empty — the MCP ask-prompt
 * is then left unchanged (no suffix appended).
 *
 * Intended to be registered as the `"mcp"` formatter via
 * `registerBuiltinToolInputFormatters`.
 */
export const formatMcpInputForPrompt: ToolInputFormatter = (input: Record<string, unknown>): string | undefined => {
  const summary = formatArgsSummary(toRecord(input.arguments), MCP_ARGS_SUMMARY_MAX_LENGTH);
  return summary ? `with ${summary}` : undefined;
};

/**
 * Register all built-in tool input formatters into `registry`.
 *
 * Called once from the extension factory (`index.ts`) immediately after the
 * registry is constructed, before any third-party registration can occur.
 */
export function registerBuiltinToolInputFormatters(registry: ToolInputFormatterRegistry): void {
  registry.register("mcp", formatMcpInputForPrompt);
}
