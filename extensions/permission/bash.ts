import { type Token, tokenize } from "./bash/lexer";

export interface BashAnalysis {
  readonly commands: readonly string[];
  readonly pathTokens: readonly string[];
  readonly suspicious: boolean;
}

interface Segment {
  readonly tokens: readonly Token[];
  readonly dangling: boolean;
}

interface SegmentAnalysis {
  readonly command: string | null;
  readonly pathTokens: readonly string[];
}

const WRAPPERS = new Set(["time", "nice", "nohup", "command", "builtin", "noglob"]);
const DURATION_PATTERN = /^\d+(?:\.\d+)?[smhd]?$/;
const FD_DUP_PATTERN = /^&\d+$/;
const ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const REGEX_METACHAR_PATTERN = /\.\*|\.\+|\\\||\\\(|\\\)|\[.*?\]|\^\//;
const BARE_SLASH_PATTERN = /^\/+$/;

export function analyzeBashCommand(command: string): BashAnalysis {
  const { tokens, suspicious: tokenSuspicious } = tokenize(command);
  const segments = splitSegments(tokens);
  const analyses = segments.map(analyzeSegment);
  const commands = analyses.map((a) => a.command).filter((c): c is string => c !== null);
  const pathTokens = dedupe(analyses.flatMap((a) => a.pathTokens));
  const structuralSuspicious = tokenSuspicious || commands.length === 0 || segments.some((s) => s.dangling);
  return { commands, pathTokens, suspicious: structuralSuspicious };
}

export function formatBashCommand(command: string): string {
  const { tokens } = tokenize(command);
  if (tokens.length === 0) return command;
  const hasOperators = tokens.some((t) => t.kind === "separator" && t.raw !== "\n");
  if (!hasOperators) return command;

  const lines: string[] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (token.kind === "separator") {
      if (current.length > 0) {
        lines.push(current.join(" "));
        current = [];
      }
      if (token.raw.trim()) {
        current.push(token.raw);
      }
      continue;
    }
    current.push(token.raw);
  }
  if (current.length > 0) {
    lines.push(current.join(" "));
  }

  return lines.length > 1 ? lines.map((line, i) => (i === 0 ? line : `  ${line}`)).join("\n") : command;
}

function splitSegments(tokens: readonly Token[]): Segment[] {
  const segments: Segment[] = [];
  let current: Token[] = [];
  let lastSeparator: string | null = null;
  for (const token of tokens) {
    if (token.kind === "separator") {
      segments.push({ tokens: current, dangling: current.length === 0 });
      current = [];
      lastSeparator = token.raw;
      continue;
    }
    current.push(token);
  }
  const trailingHardOperator =
    tokens.length > 0 &&
    tokens[tokens.length - 1].kind === "separator" &&
    lastSeparator !== ";" &&
    lastSeparator !== "\n";
  segments.push({ tokens: current, dangling: trailingHardOperator });
  return segments;
}

function analyzeSegment(segment: Segment): SegmentAnalysis {
  const words = [...segment.tokens];
  const pathTokens: string[] = [];
  extractRedirectTargets(words, pathTokens);
  stripAssignments(words, pathTokens);
  stripWrappers(words);
  if (words.length === 0 || words[0].kind !== "word") return { command: null, pathTokens };
  const command = words.map((token) => token.raw).join(" ");
  collectArgumentPathTokens(words, pathTokens);
  return { command, pathTokens };
}

function extractRedirectTargets(words: Token[], pathTokens: string[]): void {
  for (let i = 0; i < words.length; i++) {
    if (words[i].kind !== "redirect") continue;
    const target = words[i + 1];
    if (target && target.kind === "word" && !FD_DUP_PATTERN.test(target.text)) {
      pathTokens.push(target.text);
    }
  }
}

function stripAssignments(words: Token[], pathTokens: string[]): void {
  while (words.length > 1 && words[0].kind === "word" && ASSIGNMENT_PATTERN.test(words[0].raw)) {
    const value = words[0].text.slice(words[0].text.indexOf("=") + 1);
    if (isPathToken(value)) pathTokens.push(value);
    words.shift();
  }
}

function stripWrappers(words: Token[]): void {
  for (;;) {
    const first = words[0];
    if (first?.kind !== "word" || words.length < 2) return;
    if (WRAPPERS.has(first.text) && !words[1].raw.startsWith("-")) {
      words.shift();
      continue;
    }
    if (first.text === "timeout" && DURATION_PATTERN.test(words[1].text) && words.length > 2) {
      words.splice(0, 2);
      continue;
    }
    if (first.text === "xargs" && !words[1].raw.startsWith("-")) {
      words.shift();
      continue;
    }
    return;
  }
}

function collectArgumentPathTokens(words: readonly Token[], pathTokens: string[]): void {
  for (let i = 1; i < words.length; i++) {
    if (isPathToken(words[i].text)) pathTokens.push(words[i].text);
  }
}

function isPathToken(token: string): boolean {
  if (rejectNonPathToken(token)) return false;
  return (
    token.startsWith("/") ||
    token.startsWith("~/") ||
    token.includes("..") ||
    token.includes("/") ||
    token.startsWith(".")
  );
}

function rejectNonPathToken(token: string): boolean {
  return (
    !token ||
    token.startsWith("-") ||
    ASSIGNMENT_PATTERN.test(token) ||
    URL_PATTERN.test(token) ||
    isScopedPackageToken(token) ||
    BARE_SLASH_PATTERN.test(token) ||
    REGEX_METACHAR_PATTERN.test(token)
  );
}

function isScopedPackageToken(token: string): boolean {
  return token.startsWith("@") && !token.startsWith("@/");
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
