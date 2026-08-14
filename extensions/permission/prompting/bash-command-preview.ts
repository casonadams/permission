const CONTROL_OPERATORS = new Set(["&&", "||", "|", "|&", ";", "&"]);

type PreviewPart = { text: string; operator: boolean; indented: boolean };
type TokenKind = "operator" | "flag" | "word";
type Scanner = {
  command: string;
  index: number;
  char: string;
  quote: "'" | '"' | "`" | null;
  depth: number;
  token: string;
  tokens: string[];
};
type CharacterHandler = {
  matches(scanner: Scanner): boolean;
  consume(scanner: Scanner): void;
};

export function formatBashCommandPreview(command: string): string {
  if (!command || /[\r\n]/.test(command)) return command;

  const parts = buildPreviewParts(tokenize(command));
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
        parts.push({ text: token, operator: true, indented: false });
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

function flushWords(words: string[], parts: PreviewPart[]): string[] {
  if (words.length > 0) {
    parts.push({ text: words.join(" "), operator: false, indented: isFlag(words[0] ?? "") });
  }
  return [];
}

function renderPart(part: PreviewPart, continued: boolean): string {
  const prefix = part.indented ? "  " : "";
  const continuation = !part.operator && continued ? " \\" : "";
  return `${prefix}${part.text}${continuation}`;
}

function isFlag(token: string): boolean {
  return /^-{1,2}[^-\s]/.test(token);
}

function tokenize(command: string): string[] {
  const scanner: Scanner = { command, index: 0, char: "", quote: null, depth: 0, token: "", tokens: [] };
  for (; scanner.index < command.length; scanner.index++) {
    scanner.char = command[scanner.index] ?? "";
    consumeCharacter(scanner);
  }
  flushToken(scanner);
  return scanner.tokens;
}

function consumeCharacter(scanner: Scanner): void {
  const handler = CHARACTER_HANDLERS.find((candidate) => candidate.matches(scanner));
  if (handler) handler.consume(scanner);
  else scanner.token += scanner.char;
}

function flushToken(scanner: Scanner): void {
  if (scanner.token) scanner.tokens.push(scanner.token);
  scanner.token = "";
}

function readControlOperator(scanner: Scanner): string | null {
  const pair = scanner.command.slice(scanner.index, scanner.index + 2);
  if (CONTROL_OPERATORS.has(pair)) return pair;
  if (!CONTROL_OPERATORS.has(scanner.char)) return null;
  return isRedirectAmpersand(scanner) ? null : scanner.char;
}

function isRedirectAmpersand(scanner: Scanner): boolean {
  return scanner.char === "&" && /[<>]/.test(scanner.command[scanner.index - 1] ?? "");
}

const CHARACTER_HANDLERS: CharacterHandler[] = [
  {
    matches: (scanner) => scanner.char === "\\" && scanner.quote !== "'",
    consume: (scanner) => {
      scanner.token += scanner.char;
      if (scanner.index + 1 < scanner.command.length) scanner.token += scanner.command[++scanner.index];
    },
  },
  {
    matches: (scanner) => scanner.quote !== null,
    consume: (scanner) => {
      scanner.token += scanner.char;
      if (scanner.char === scanner.quote) scanner.quote = null;
    },
  },
  {
    matches: (scanner) => scanner.char === "'" || scanner.char === '"' || scanner.char === "`",
    consume: (scanner) => {
      scanner.quote = scanner.char as Scanner["quote"];
      scanner.token += scanner.char;
    },
  },
  {
    matches: (scanner) => scanner.char === "(" || scanner.char === "[" || scanner.char === "{",
    consume: (scanner) => {
      scanner.depth++;
      scanner.token += scanner.char;
    },
  },
  {
    matches: (scanner) => scanner.char === ")" || scanner.char === "]" || scanner.char === "}",
    consume: (scanner) => {
      scanner.depth = Math.max(0, scanner.depth - 1);
      scanner.token += scanner.char;
    },
  },
  {
    matches: (scanner) => scanner.depth === 0 && /\s/.test(scanner.char),
    consume: flushToken,
  },
  {
    matches: (scanner) => scanner.depth === 0 && readControlOperator(scanner) !== null,
    consume: (scanner) => {
      const operator = readControlOperator(scanner) ?? scanner.char;
      flushToken(scanner);
      scanner.tokens.push(operator);
      scanner.index += operator.length - 1;
    },
  },
];
