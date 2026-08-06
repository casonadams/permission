import { getNonEmptyString, toRecord } from "./common";
import { countTextLines, formatCount } from "./tool-input-preview";

export function getPromptPath(input: Record<string, unknown>): string | null {
  return getNonEmptyString(input.path) ?? getNonEmptyString(input.file_path);
}

/**
 * Show the command itself rather than its JSON envelope. The title names the
 * sub-command that triggered the gate; this is the full command it came from.
 */
export function formatBashInputForPrompt(input: Record<string, unknown>): string {
  return getNonEmptyString(input.command) ?? "";
}

/** The skill name already appears in the prompt title, so add nothing here. */
export function formatSkillInputForPrompt(): string {
  return "";
}

type PromptEdit = { oldText: string; newText: string };

export function formatEditInputForPrompt(input: Record<string, unknown>): string {
  const pathPart = formatPathPart(getPromptPath(input));
  const edits = getPromptEdits(input);

  if (edits.length === 0) {
    return pathPart ? `${pathPart} with edit input` : "with edit input";
  }

  const summary = formatEditSummary(edits);
  return pathPart ? `${pathPart} ${summary}` : summary;
}

function getPromptEdits(input: Record<string, unknown>): PromptEdit[] {
  return getRawPromptEdits(input)
    .map((edit) => toRecord(edit))
    .filter(isPromptEdit);
}

function getRawPromptEdits(input: Record<string, unknown>): unknown[] {
  if (Array.isArray(input.edits)) return input.edits;
  if (typeof input.oldText === "string" && typeof input.newText === "string") {
    return [{ oldText: input.oldText, newText: input.newText }];
  }
  return [];
}

function isPromptEdit(edit: Record<string, unknown>): edit is PromptEdit {
  return typeof edit.oldText === "string" && typeof edit.newText === "string";
}

function formatPathPart(path: string | null): string {
  return path ? `for '${path}'` : "";
}

function formatEditSummary(edits: PromptEdit[]): string {
  const firstEdit = edits[0];
  const firstEditSummary = `edit #1 replaces ${formatLineCount(firstEdit.oldText)} with ${formatLineCount(
    firstEdit.newText,
  )}`;
  const extraEdits = formatExtraEdits(edits.length);
  return `(${formatCount(edits.length, "replacement", "replacements")}: ${firstEditSummary}${extraEdits})`;
}

function formatLineCount(text: string): string {
  return formatCount(countTextLines(text), "line", "lines");
}

function formatExtraEdits(editCount: number): string {
  return editCount > 1 ? `, plus ${formatCount(editCount - 1, "additional edit", "additional edits")}` : "";
}

export function formatWriteInputForPrompt(input: Record<string, unknown>): string {
  const path = getPromptPath(input);
  const content = typeof input.content === "string" ? input.content : "";
  const summary = `(${formatCount(countTextLines(content), "line", "lines")}, ${formatCount(content.length, "character", "characters")})`;
  return path ? `for '${path}' ${summary}` : summary;
}

export function formatReadInputForPrompt(input: Record<string, unknown>): string {
  const path = getPromptPath(input);
  const parts = path ? [`path '${path}'`] : [];
  if (typeof input.offset === "number") {
    parts.push(`offset ${input.offset}`);
  }
  if (typeof input.limit === "number") {
    parts.push(`limit ${input.limit}`);
  }
  return parts.length > 0 ? `for ${parts.join(", ")}` : "";
}
