export function formatApprovalGuidance(surface: string, pattern: string | undefined): string | undefined {
  if (!pattern) return undefined;

  return `To allow this ${guidanceSubject(surface)} without prompting in the future, add under "permission.${surface}":\n\n${JSON.stringify(pattern)}: "allow"`;
}

function guidanceSubject(surface: string): string {
  if (surface === "bash") return "command";
  if (surface === "mcp") return "MCP target";
  if (surface === "skill") return "skill";
  if (surface === "path") return "path";
  return `tool '${surface}'`;
}
