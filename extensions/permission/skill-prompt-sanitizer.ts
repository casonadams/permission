import { dirname } from "node:path";

import { normalizePathForComparison } from "./path-utils";
import {
  type ParsedSkillPromptEntry,
  parseAllSkillPromptSections,
  renderAvailableSkillsSection,
  type SkillPromptSection,
} from "./skill-prompt-xml";
import type { PermissionCheckResult, PermissionState } from "./types";

export { findSkillPathMatch } from "./skill-path-match";
export { parseAllSkillPromptSections, type SkillPromptSection } from "./skill-prompt-xml";

export interface SkillPermissionChecker {
  checkPermission(surface: string, input: unknown, agentName?: string): PermissionCheckResult;
}

export type SkillPromptEntry = {
  name: string;
  description: string;
  location: string;
  state: PermissionState;
  normalizedLocation: string;
  normalizedBaseDir: string;
};

function resolvePermissionState(args: {
  skillName: string;
  permissionManager: SkillPermissionChecker;
  agentName: string | null;
  cache: Map<string, PermissionState>;
}): PermissionState {
  const cachedState = args.cache.get(args.skillName);
  if (cachedState) return cachedState;

  const state = args.permissionManager.checkPermission(
    "skill",
    { name: args.skillName },
    args.agentName ?? undefined,
  ).state;
  args.cache.set(args.skillName, state);
  return state;
}

function createResolvedSkillEntry(
  entry: ParsedSkillPromptEntry,
  state: PermissionState,
  cwd: string,
): SkillPromptEntry {
  return {
    name: entry.name,
    description: entry.description,
    location: entry.location,
    state,
    normalizedLocation: normalizePathForComparison(entry.location, cwd),
    normalizedBaseDir: normalizePathForComparison(dirname(entry.location), cwd),
  };
}

function removePromptRange(prompt: string, start: number, end: number): string {
  const beforeSection = prompt.slice(0, start).replace(/\n+$/, "");
  const afterSection = prompt.slice(end);
  return `${beforeSection}${afterSection}`;
}

export function resolveSkillPromptEntries(
  ...args: [prompt: string, permissionManager: SkillPermissionChecker, agentName: string | null, cwd: string]
): { prompt: string; entries: SkillPromptEntry[] } {
  const [prompt, permissionManager, agentName, cwd] = args;
  const sections = parseAllSkillPromptSections(prompt);
  if (sections.length === 0) return { prompt, entries: [] };

  const resolved = resolveSkillPromptSections({ sections, permissionManager, agentName, cwd });
  return {
    prompt: resolved.replacements.length > 0 ? applySkillPromptReplacements(prompt, resolved.replacements) : prompt,
    entries: resolved.visibleEntries,
  };
}

type SkillSectionReplacement = { start: number; end: number; content: string };

type ResolveSkillPromptSectionsArgs = {
  sections: SkillPromptSection[];
  permissionManager: SkillPermissionChecker;
  agentName: string | null;
  cwd: string;
};

type SkillPromptResolution = {
  visibleEntries: SkillPromptEntry[];
  replacements: SkillSectionReplacement[];
};

function resolveSkillPromptSections(args: ResolveSkillPromptSectionsArgs): SkillPromptResolution {
  const permissionCache = new Map<string, PermissionState>();
  return args.sections.reduce(
    (result, section) => appendResolvedSkillSection({ result, section, args, permissionCache }),
    { visibleEntries: [], replacements: [] } as SkillPromptResolution,
  );
}

function appendResolvedSkillSection(args: {
  result: SkillPromptResolution;
  section: SkillPromptSection;
  args: ResolveSkillPromptSectionsArgs;
  permissionCache: Map<string, PermissionState>;
}): SkillPromptResolution {
  const resolvedEntries = resolveSectionEntries(args.section, args.args, args.permissionCache);
  const visibleSectionEntries = resolvedEntries.filter((entry) => entry.state !== "deny");
  args.result.visibleEntries.push(...visibleSectionEntries);
  const replacement = buildSectionReplacement(args.section, resolvedEntries, visibleSectionEntries);
  if (replacement) args.result.replacements.push(replacement);
  return args.result;
}

function resolveSectionEntries(
  section: SkillPromptSection,
  args: ResolveSkillPromptSectionsArgs,
  permissionCache: Map<string, PermissionState>,
): SkillPromptEntry[] {
  return section.entries.map((entry) => {
    const state = resolvePermissionState({
      skillName: entry.name,
      permissionManager: args.permissionManager,
      agentName: args.agentName,
      cache: permissionCache,
    });
    return createResolvedSkillEntry(entry, state, args.cwd);
  });
}

function buildSectionReplacement(
  section: SkillPromptSection,
  resolvedEntries: SkillPromptEntry[],
  visibleEntries: SkillPromptEntry[],
): SkillSectionReplacement | null {
  if (visibleEntries.length === resolvedEntries.length) return null;
  return {
    start: section.start,
    end: section.end,
    content: visibleEntries.length > 0 ? renderAvailableSkillsSection(visibleEntries) : "",
  };
}

function applySkillPromptReplacements(prompt: string, replacements: SkillSectionReplacement[]): string {
  return replacements.reduceRight((sanitizedPrompt, replacement) => {
    if (!replacement.content) return removePromptRange(sanitizedPrompt, replacement.start, replacement.end);
    return `${sanitizedPrompt.slice(0, replacement.start)}${replacement.content}${sanitizedPrompt.slice(replacement.end)}`;
  }, prompt);
}
