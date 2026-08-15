import { truncateInlineText } from "./tool-input-preview";

const ARG_VALUE_MAX_LENGTH = 60;

function isInlinePrimitive(value: unknown): boolean {
  return typeof value === "number" || typeof value === "boolean";
}

function isNestedObject(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function renderArgValue(value: unknown): string {
  if (typeof value === "string") return `'${truncateInlineText(value, ARG_VALUE_MAX_LENGTH)}'`;
  if (isInlinePrimitive(value)) return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (isNestedObject(value)) return "{…}";
  return String(value);
}

export function formatArgsSummary(args: Record<string, unknown>, maxLength: number): string | undefined {
  const entries = Object.entries(args);
  if (entries.length === 0) return undefined;

  const parts = entries.map(([key, value]) => `${key}: ${renderArgValue(value)}`);
  return truncateInlineText(parts.join(", "), maxLength);
}
