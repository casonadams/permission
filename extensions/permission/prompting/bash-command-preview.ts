import { tokenizeBashCommand } from "./bash-command-tokenizer";

const CONTROL_OPERATORS = new Set(["&&", "||", "|", "|&", ";", "&"]);
const TRAILING_OPERATORS = new Set(["&&", "||", "|", "|&", "&", ";"]);
const TRAILING_OPERATOR_SUFFIXES = [" &&", " ||", " |", " |&", " &", ";"];

// Shfmt's `BinCmdOperator` set: &&, ||, |, |&. We also keep & and ; trailing
// to match shfmt's default (no -bn) handling of statement separators.

type PreviewPart = { text: string; operator: boolean; indented: boolean };
type TokenKind = "operator" | "flag" | "word";

export function formatBashCommandPreview(command: string): string {
  if (!command || /[\r\n]/.test(command)) return command;

  const parts = buildPreviewParts(tokenizeBashCommand(command));
  if (parts.length <= 1) return command;
  return parts.map((part, index) => renderPart(part, index < parts.length - 1)).join("\n");
}

function buildPreviewParts(tokens: string[]): PreviewPart[] {
  const parts: PreviewPart[] = [];
  let words: string[] = [];

  for (const token of tokens) {
    switch (classifyToken(token, words.length)) {
      case "operator":
        words = flushWords(words, parts);
        pushOperator(parts, token);
        break;
      case "flag":
        words = flushWords(words, parts);
        words.push(token);
        break;
      case "word":
        words.push(token);
        break;
    }
  }
  flushWords(words, parts);
  return parts;
}

function classifyToken(token: string, wordCount: number): TokenKind {
  if (CONTROL_OPERATORS.has(token)) return "operator";
  if (wordCount > 0 && isFlag(token)) return "flag";
  return "word";
}

function pushOperator(parts: PreviewPart[], operator: string): void {
  const previous = parts.at(-1);
  if (isTrailingOperator(operator) && previous && !previous.operator) {
    previous.text += operator === ";" ? operator : ` ${operator}`;
    return;
  }
  parts.push({ text: operator, operator: true, indented: false });
}

function isTrailingOperator(value: string): boolean {
  return TRAILING_OPERATORS.has(value);
}

function flushWords(words: string[], parts: PreviewPart[]): string[] {
  if (words.length > 0) {
    parts.push({ text: words.join(" "), operator: false, indented: isFlag(words[0] ?? "") });
  }
  return [];
}

function renderPart(part: PreviewPart, continued: boolean): string {
  const prefix = part.indented ? "  " : "";
  const continuation = !part.operator && continued && !endsWithTrailingOperator(part.text) ? " \\" : "";
  return `${prefix}${part.text}${continuation}`;
}

function endsWithTrailingOperator(value: string): boolean {
  return TRAILING_OPERATOR_SUFFIXES.some((suffix) => value.endsWith(suffix));
}

function isFlag(token: string): boolean {
  return /^-{1,2}[^-\s]/.test(token);
}
