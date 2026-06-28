import { TOOL_GUIDELINE_RULES } from "./system-prompt-guideline-rules";

export interface SanitizeSystemPromptResult {
  prompt: string;
  removed: boolean;
}

type LineSection = {
  start: number;
  end: number;
};

const AVAILABLE_TOOLS_SECTION_HEADER = "Available tools:";
const GUIDELINES_SECTION_HEADER = "Guidelines:";

function normalizePrompt(prompt: string): string {
  return (prompt || "").replace(/\r\n/g, "\n");
}

function collapseExtraBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function normalizeGuidelineText(line: string): string {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isTopLevelSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && trimmed.endsWith(":") && !trimmed.startsWith("-");
}

function isSectionBodyLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true; // blank line
  if (trimmed.startsWith("- ")) return true; // bullet
  if (line !== line.trimStart()) return true; // indented
  return false;
}

function findSection(lines: readonly string[], header: string): LineSection | null {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return null;
  return { start, end: sectionEnd(lines, start) };
}

/**
 * End of the section starting at `start`: the index of the next recognised
 * section header, else the first non-body line, else `lines.length`.
 */
function sectionEnd(lines: readonly string[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isTopLevelSectionHeader(lines[index])) return index;
  }
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!isSectionBodyLine(lines[index])) return index;
  }
  return lines.length;
}

function removeLineSection(
  lines: readonly string[],
  section: LineSection | null,
): { lines: string[]; removed: boolean } {
  if (!section) {
    return { lines: [...lines], removed: false };
  }

  return {
    lines: [...lines.slice(0, section.start), ...lines.slice(section.end)],
    removed: true,
  };
}

function shouldKeepGuideline(line: string, allowedTools: ReadonlySet<string>): boolean {
  const normalized = normalizeGuidelineText(line);

  for (const rule of TOOL_GUIDELINE_RULES) {
    if (rule.matches(normalized)) {
      return rule.shouldKeep(allowedTools);
    }
  }

  return true;
}

function sanitizeGuidelinesSection(
  lines: readonly string[],
  allowedTools: ReadonlySet<string>,
): { lines: string[]; removed: boolean } {
  const section = findSection(lines, GUIDELINES_SECTION_HEADER);
  if (!section) {
    return { lines: [...lines], removed: false };
  }

  const before = lines.slice(0, section.start + 1);
  const after = lines.slice(section.end);
  const body = lines.slice(section.start + 1, section.end);
  const filteredBody = body.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      return true;
    }

    return shouldKeepGuideline(line, allowedTools);
  });

  const removed = filteredBody.length !== body.length;
  if (!removed) {
    return { lines: [...lines], removed: false };
  }

  const hasBullet = filteredBody.some((line) => line.trim().startsWith("- "));
  if (!hasBullet) {
    return {
      lines: [...lines.slice(0, section.start), ...after],
      removed: true,
    };
  }

  return {
    lines: [...before, ...filteredBody, ...after],
    removed: true,
  };
}

export function sanitizeAvailableToolsSection(
  systemPrompt: string,
  allowedToolNames: readonly string[],
): SanitizeSystemPromptResult {
  const allowedTools = new Set(allowedToolNames.map((toolName) => toolName.trim()).filter(Boolean));
  const normalizedLines = normalizePrompt(systemPrompt).split("\n");
  const removedToolsSection = removeLineSection(
    normalizedLines,
    findSection(normalizedLines, AVAILABLE_TOOLS_SECTION_HEADER),
  );
  const sanitizedGuidelines = sanitizeGuidelinesSection(removedToolsSection.lines, allowedTools);
  const removed = removedToolsSection.removed || sanitizedGuidelines.removed;

  return {
    prompt: removed ? collapseExtraBlankLines(sanitizedGuidelines.lines.join("\n")) : systemPrompt,
    removed,
  };
}
