export type GuidelineRule = {
  matches: (guideline: string) => boolean;
  shouldKeep: (allowedTools: ReadonlySet<string>) => boolean;
};

export const TOOL_GUIDELINE_RULES: readonly GuidelineRule[] = [
  {
    matches: (guideline) => guideline === "use bash for file operations like ls, rg, find",
    shouldKeep: (allowedTools) => allowedTools.has("bash"),
  },
  {
    matches: (guideline) =>
      guideline === "prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)",
    shouldKeep: (allowedTools) =>
      allowedTools.has("bash") && (allowedTools.has("grep") || allowedTools.has("find") || allowedTools.has("ls")),
  },
  {
    matches: (guideline) =>
      guideline === "use read to examine files before editing. you must use this tool instead of cat or sed." ||
      guideline === "use read to examine files instead of cat or sed.",
    shouldKeep: (allowedTools) => allowedTools.has("read"),
  },
  {
    matches: (guideline) => guideline === "use edit for precise changes (old text must match exactly)",
    shouldKeep: (allowedTools) => allowedTools.has("edit"),
  },
  {
    matches: (guideline) => guideline === "use write only for new files or complete rewrites",
    shouldKeep: (allowedTools) => allowedTools.has("write"),
  },
  {
    matches: (guideline) =>
      guideline ===
      "when summarizing your actions, output plain text directly - do not use cat or bash to display what you did",
    shouldKeep: (allowedTools) => allowedTools.has("edit") || allowedTools.has("write"),
  },
  {
    matches: (guideline) =>
      guideline ===
      "use task when work should be delegated to one or more specialized agents instead of handled entirely in the current session.",
    shouldKeep: (allowedTools) => allowedTools.has("task"),
  },
  {
    matches: (guideline) =>
      guideline ===
      "use mcp for mcp discovery first: search by capability, describe one exact tool name, then call it.",
    shouldKeep: (allowedTools) => allowedTools.has("mcp"),
  },
];
