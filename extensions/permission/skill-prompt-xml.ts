export const AVAILABLE_SKILLS_OPEN_TAG = "<available_skills>";
export const AVAILABLE_SKILLS_CLOSE_TAG = "</available_skills>";
const SKILL_BLOCK_PATTERN = "<skill>([\\s\\S]*?)<\\/skill>";
const SKILL_NAME_REGEX = /<name>([\s\S]*?)<\/name>/;
const SKILL_DESCRIPTION_REGEX = /<description>([\s\S]*?)<\/description>/;
const SKILL_LOCATION_REGEX = /<location>([\s\S]*?)<\/location>/;

export type ParsedSkillPromptEntry = {
  name: string;
  description: string;
  location: string;
};

export type SkillPromptSection = {
  start: number;
  end: number;
  entries: ParsedSkillPromptEntry[];
};

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseSkillEntries(sectionBody: string): ParsedSkillPromptEntry[] {
  const entries: ParsedSkillPromptEntry[] = [];
  const skillBlockRegex = new RegExp(SKILL_BLOCK_PATTERN, "g");

  for (const match of sectionBody.matchAll(skillBlockRegex)) {
    const entry = parseSkillEntryBlock(match[1]);
    if (entry) entries.push(entry);
  }

  return entries;
}

function parseSkillEntryBlock(block: string): ParsedSkillPromptEntry | null {
  const matches = getSkillEntryMatches(block);
  if (!matches) return null;

  const name = decodeXml(matches.name.trim());
  const description = decodeXml(matches.description.trim());
  const location = decodeXml(matches.location.trim());
  if (!name || !location) return null;

  return { name, description, location };
}

function getSkillEntryMatches(block: string): { name: string; description: string; location: string } | null {
  const nameMatch = SKILL_NAME_REGEX.exec(block);
  const descriptionMatch = SKILL_DESCRIPTION_REGEX.exec(block);
  const locationMatch = SKILL_LOCATION_REGEX.exec(block);
  if (!nameMatch || !descriptionMatch || !locationMatch) return null;
  return { name: nameMatch[1], description: descriptionMatch[1], location: locationMatch[1] };
}

export function parseAllSkillPromptSections(prompt: string): SkillPromptSection[] {
  const sections: SkillPromptSection[] = [];
  let searchStart = 0;

  while (searchStart < prompt.length) {
    const section = findNextSkillPromptSection(prompt, searchStart);
    if (!section) break;
    sections.push(section);
    searchStart = section.end;
  }

  return sections;
}

function findNextSkillPromptSection(prompt: string, searchStart: number): SkillPromptSection | null {
  const start = prompt.indexOf(AVAILABLE_SKILLS_OPEN_TAG, searchStart);
  if (start === -1) return null;
  const closeStart = prompt.indexOf(AVAILABLE_SKILLS_CLOSE_TAG, start + AVAILABLE_SKILLS_OPEN_TAG.length);
  if (closeStart === -1) return null;
  const end = closeStart + AVAILABLE_SKILLS_CLOSE_TAG.length;
  const sectionBody = prompt.slice(start + AVAILABLE_SKILLS_OPEN_TAG.length, closeStart);
  return { start, end, entries: parseSkillEntries(sectionBody) };
}

export function renderAvailableSkillsSection(
  entries: readonly { name: string; description: string; location: string }[],
): string {
  return [
    AVAILABLE_SKILLS_OPEN_TAG,
    ...entries.flatMap((entry) => [
      "  <skill>",
      `    <name>${encodeXml(entry.name)}</name>`,
      `    <description>${encodeXml(entry.description)}</description>`,
      `    <location>${encodeXml(entry.location)}</location>`,
      "  </skill>",
    ]),
    AVAILABLE_SKILLS_CLOSE_TAG,
  ].join("\n");
}
