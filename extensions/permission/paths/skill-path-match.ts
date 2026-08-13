import type { SkillPromptEntry } from "../app/skill-prompt-sanitizer";
import { isPathWithinDirectory } from "./path-utils";

export function findSkillPathMatch(
  normalizedPath: string,
  entries: readonly SkillPromptEntry[],
): SkillPromptEntry | null {
  if (!normalizedPath || entries.length === 0) return null;
  return findExactSkillPathMatch(normalizedPath, entries) ?? findBestSkillBaseDirMatch(normalizedPath, entries);
}

function findExactSkillPathMatch(
  normalizedPath: string,
  entries: readonly SkillPromptEntry[],
): SkillPromptEntry | null {
  return entries.find((entry) => entry.normalizedLocation && normalizedPath === entry.normalizedLocation) ?? null;
}

function findBestSkillBaseDirMatch(
  normalizedPath: string,
  entries: readonly SkillPromptEntry[],
): SkillPromptEntry | null {
  return matchingBaseDirEntries(normalizedPath, entries).reduce<SkillPromptEntry | null>(pickMoreSpecificEntry, null);
}

function matchingBaseDirEntries(normalizedPath: string, entries: readonly SkillPromptEntry[]): SkillPromptEntry[] {
  return entries.filter(
    (entry) => entry.normalizedBaseDir && isPathWithinDirectory(normalizedPath, entry.normalizedBaseDir),
  );
}

function pickMoreSpecificEntry(best: SkillPromptEntry | null, entry: SkillPromptEntry): SkillPromptEntry {
  if (!best) return entry;
  return entry.normalizedBaseDir.length > best.normalizedBaseDir.length ? entry : best;
}
