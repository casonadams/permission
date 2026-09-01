export interface BashAnalysis {
  readonly commands: readonly string[];
  readonly pathTokens: readonly string[];
  readonly suspicious: boolean;
}

type TokenKind = "word" | "separator" | "redirect";

interface Token {
  readonly kind: TokenKind;
  readonly raw: string;
  readonly text: string;
}

interface TokenizerResult {
  readonly tokens: readonly Token[];
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

function tokenize(command: string): TokenizerResult {
  const tokens: Token[] = [];
  let suspicious = false;
  let index = 0;

  while (index < command.length) {
    const char = command[index];
    if (char === " " || char === "\t" || char === "\r") {
      index++;
      continue;
    }
    if (char === "\\" && command[index + 1] === "\n") {
      index += 2;
      continue;
    }
    if (isOperatorStart(command, index)) {
      const { token, nextIndex } = readOperator(command, index);
      tokens.push(token);
      index = nextIndex;
      continue;
    }
    const wordStart = index;
    const word = readWord(command, index);
    tokens.push(word.token);
    suspicious = suspicious || word.suspicious;
    index = word.nextIndex;
    if (word.unterminated || index === wordStart) break;
    const merged = readFdOperator(command, word.token, index);
    if (merged) {
      tokens[tokens.length - 1] = merged.token;
      index = merged.nextIndex;
    }
  }
  return { tokens, suspicious };
}

function isOperatorStart(command: string, index: number): boolean {
  const char = command[index];
  if (char === "\n") return true;
  const two = command.slice(index, index + 2);
  return charIsRedirectOrSeparator(char) || two === "&&" || two === "||" || two === "|&" || two === ";;";
}

function charIsRedirectOrSeparator(char: string): boolean {
  return char === ";" || char === "|" || char === "&" || char === ">" || char === "<";
}

function readOperator(command: string, index: number): { token: Token; nextIndex: number } {
  const char = command[index];
  if (char === "\n") {
    return { token: { kind: "separator", raw: char, text: char }, nextIndex: index + 1 };
  }
  const two = command.slice(index, index + 2);
  if (two === "&&" || two === "||" || two === "|&" || two === ";;") {
    return { token: { kind: "separator", raw: two, text: two }, nextIndex: index + 2 };
  }
  if (char === ">" || char === "<" || (char === "&" && command[index + 1] === ">")) {
    return readRedirectOperator(command, index);
  }
  return { token: { kind: "separator", raw: char, text: char }, nextIndex: index + 1 };
}

function readRedirectOperator(command: string, index: number): { token: Token; nextIndex: number } {
  let end = index;
  if (command[end] === "&") end++;
  while (end < command.length && (command[end] === ">" || command[end] === "<")) end++;
  if (command[end] === "&") {
    end++;
    while (end < command.length && /\d/.test(command[end])) end++;
  }
  const raw = command.slice(index, end);
  return { token: { kind: "redirect", raw, text: raw }, nextIndex: end };
}

function readFdOperator(command: string, word: Token, nextIndex: number): { token: Token; nextIndex: number } | null {
  if (!/^\d+$/.test(word.raw)) return null;
  const char = command[nextIndex];
  if (char !== ">" && char !== "<") return null;
  const operator = readRedirectOperator(command, nextIndex);
  return {
    token: { kind: "redirect", raw: `${word.raw}${operator.token.raw}`, text: `${word.raw}${operator.token.raw}` },
    nextIndex: operator.nextIndex,
  };
}

interface WordResult {
  token: Token;
  nextIndex: number;
  suspicious: boolean;
  unterminated: boolean;
}

function readWord(command: string, start: number): WordResult {
  let raw = "";
  let text = "";
  let suspicious = false;
  let index = start;

  while (index < command.length) {
    const char = command[index];
    if (char === " " || char === "\t" || char === "\r" || char === "\n" || charIsRedirectOrSeparator(char)) break;
    if (char === "'") {
      const literal = readSingleQuoted(command, index);
      if (literal.unterminated)
        return { token: makeWord(raw, text), nextIndex: index, suspicious: true, unterminated: true };
      raw += literal.raw;
      text += literal.text;
      index = literal.nextIndex;
      continue;
    }
    if (char === '"') {
      const quoted = readDoubleQuoted(command, index);
      if (quoted.unterminated)
        return { token: makeWord(raw, text), nextIndex: index, suspicious: true, unterminated: true };
      raw += quoted.raw;
      text += quoted.text;
      suspicious = suspicious || quoted.suspicious;
      index = quoted.nextIndex;
      continue;
    }
    if (char === "\\" && index + 1 < command.length) {
      raw += command.slice(index, index + 2);
      text += command[index + 1];
      index += 2;
      continue;
    }
    if (char === "(" || char === ")") {
      suspicious = true;
    }
    if (char === "$" && (command[index + 1] === "(" || command[index + 1] === "`")) {
      suspicious = true;
    }
    if (char === "`") {
      suspicious = true;
    }
    raw += char;
    text += char;
    index++;
  }
  return { token: makeWord(raw, text), nextIndex: index, suspicious, unterminated: false };
}

function makeWord(raw: string, text: string): Token {
  return { kind: "word", raw, text };
}

interface QuotedResult {
  readonly raw: string;
  readonly text: string;
  readonly nextIndex: number;
  readonly suspicious: boolean;
  readonly unterminated: boolean;
}

function readSingleQuoted(command: string, start: number): QuotedResult {
  const closeIndex = command.indexOf("'", start + 1);
  if (closeIndex === -1) {
    return {
      raw: command.slice(start),
      text: command.slice(start),
      nextIndex: command.length,
      suspicious: false,
      unterminated: true,
    };
  }
  return {
    raw: command.slice(start, closeIndex + 1),
    text: command.slice(start + 1, closeIndex),
    nextIndex: closeIndex + 1,
    suspicious: false,
    unterminated: false,
  };
}

function readDoubleQuoted(command: string, start: number): QuotedResult {
  let raw = '"';
  let text = "";
  let suspicious = false;
  let index = start + 1;
  while (index < command.length) {
    const char = command[index];
    if (char === '"') {
      return { raw: `${raw}"`, text, nextIndex: index + 1, suspicious, unterminated: false };
    }
    if (char === "\\" && index + 1 < command.length) {
      raw += command.slice(index, index + 2);
      text += command[index + 1];
      index += 2;
      continue;
    }
    if (char === "`" || (char === "$" && (command[index + 1] === "(" || command[index + 1] === "`"))) {
      suspicious = true;
    }
    raw += char;
    text += char;
    index++;
  }
  return { raw, text, nextIndex: index, suspicious, unterminated: true };
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
    if (!first || first.kind !== "word" || words.length < 2) return;
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
