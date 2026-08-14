const CONTROL_OPERATORS = new Set(["&&", "||", "|", "|&", ";", "&"]);

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

export function tokenizeBashCommand(command: string): string[] {
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
