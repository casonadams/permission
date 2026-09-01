// Quote-aware bash lexer: splits a command string into word/separator/redirect
// tokens, flagging suspicious constructs (command substitution, unbalanced
// quotes, parentheses) so downstream matching can fail closed.

type TokenKind = "word" | "separator" | "redirect";

export interface Token {
  readonly kind: TokenKind;
  readonly raw: string;
  readonly text: string;
}

interface TokenizerResult {
  readonly tokens: readonly Token[];
  readonly suspicious: boolean;
}

export function tokenize(command: string): TokenizerResult {
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
