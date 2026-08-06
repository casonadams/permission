/**
 * Compact `key: value` rendering for tool-call arguments in permission prompts.
 *
 * Shared by the MCP formatter and the fallback for tools with no dedicated
 * formatter, so every prompt body reads the same way instead of some showing
 * raw JSON.
 */

import { truncateInlineText } from "./tool-input-preview";

/** Maximum length of a single string argument value (before quoting). */
const ARG_VALUE_MAX_LENGTH = 60;

function isInlinePrimitive(value: unknown): boolean {
  return typeof value === "number" || typeof value === "boolean";
}

function isNestedObject(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

/**
 * Render a single argument value as a compact, readable fragment.
 *
 * - Strings: quoted and truncated.
 * - Numbers / booleans: plain string conversion.
 * - Arrays: `[N items]`.
 * - Objects: `{…}`.
 * - Everything else: plain string conversion.
 */
function renderArgValue(value: unknown): string {
  if (typeof value === "string") return `"${truncateInlineText(value, ARG_VALUE_MAX_LENGTH)}"`;
  if (isInlinePrimitive(value)) return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (isNestedObject(value)) return "{…}";
  return String(value);
}

/**
 * Summarize an argument record as `key: value, key: value`, truncated to
 * `maxLength`. Returns `undefined` for an empty record so callers can omit the
 * suffix entirely.
 */
export function formatArgsSummary(args: Record<string, unknown>, maxLength: number): string | undefined {
  const entries = Object.entries(args);
  if (entries.length === 0) return undefined;

  const parts = entries.map(([key, value]) => `${key}: ${renderArgValue(value)}`);
  return truncateInlineText(parts.join(", "), maxLength);
}
