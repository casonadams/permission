export function safeJsonStringify(value: unknown): string | undefined {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, currentValue) => jsonValue(currentValue, seen));
}

function jsonValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === "bigint") return value.toString();
  return markCircularReference(value, seen);
}

function markCircularReference(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  return value;
}
