interface ScanSegment {
  output: string;
  nextIndex: number;
}

type SegmentConsumer = (input: string, start: number) => ScanSegment;

const CONSUMERS: Array<{ matches: (char: string, next: string) => boolean; consume: SegmentConsumer }> = [
  { matches: (char, next) => char === "/" && next === "/", consume: consumeLineComment },
  { matches: (char, next) => char === "/" && next === "*", consume: consumeBlockComment },
  { matches: (char) => char === '"' || char === "'", consume: consumeString },
];

export function stripJsonComments(input: string): string {
  let output = "";
  let index = 0;
  while (index < input.length) {
    const segment = consumeNextSegment(input, index);
    output += segment.output;
    index = segment.nextIndex;
  }
  return output;
}

function consumeNextSegment(input: string, index: number): ScanSegment {
  const char = input[index];
  const next = input[index + 1] ?? "";
  const consumer = CONSUMERS.find((candidate) => candidate.matches(char, next));
  return consumer ? consumer.consume(input, index) : { output: char, nextIndex: index + 1 };
}

function consumeLineComment(input: string, start: number): ScanSegment {
  const newlineIndex = input.indexOf("\n", start);
  if (newlineIndex === -1) return { output: "", nextIndex: input.length };
  return { output: "\n", nextIndex: newlineIndex + 1 };
}

function consumeBlockComment(input: string, start: number): ScanSegment {
  const closeIndex = input.indexOf("*/", start + 2);
  if (closeIndex === -1) return { output: "", nextIndex: input.length };
  return { output: "", nextIndex: closeIndex + 2 };
}

function consumeString(input: string, start: number): ScanSegment {
  const quote = input[start];
  let output = quote;
  let index = start + 1;
  let escaping = false;
  while (index < input.length) {
    const char = input[index];
    output += char;
    index++;
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === quote) break;
  }
  return { output, nextIndex: index };
}
