/**
 * Parse a qualified MCP tool name of the form `server:tool`.
 *
 * Returns `{ server, tool }` when the string contains exactly one colon with
 * non-empty text on both sides; otherwise returns `null`.
 */
export function parseQualifiedMcpToolName(value: string): { server: string; tool: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const colonIndex = trimmed.indexOf(":");
  if (!hasQualifiedSeparator(trimmed, colonIndex)) return null;

  const server = trimmed.slice(0, colonIndex).trim();
  const tool = trimmed.slice(colonIndex + 1).trim();
  if (!hasQualifiedParts(server, tool)) return null;

  return { server, tool };
}

function hasQualifiedSeparator(value: string, colonIndex: number): boolean {
  return colonIndex > 0 && colonIndex < value.length - 1;
}

function hasQualifiedParts(server: string, tool: string): boolean {
  return Boolean(server && tool);
}
