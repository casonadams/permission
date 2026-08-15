import { createRequire } from "node:module";
export interface TSNode {
  readonly type: string;
  readonly text: string;
  readonly childCount: number;
  readonly isNamed: boolean;
  child(index: number): TSNode | null;
}
export interface TSParser {
  parse(input: string): { rootNode: TSNode; delete(): void } | null;
  delete(): void;
}

let parserPromise: Promise<TSParser> | null = null;

async function initParser(): Promise<TSParser> {
  // Use named imports — web-tree-sitter exports Parser as a named class.
  const { Parser, Language } = await import("web-tree-sitter");
  const req = createRequire(import.meta.url);
  const treeSitterWasm = req.resolve("web-tree-sitter/web-tree-sitter.wasm");
  await Parser.init({ locateFile: () => treeSitterWasm });

  const parser = new Parser();
  const bashWasm = req.resolve("tree-sitter-bash/tree-sitter-bash.wasm");
  const bash = await Language.load(bashWasm);
  parser.setLanguage(bash);
  return parser;
}
export function getParser(): Promise<TSParser> {
  parserPromise ??= initParser();
  return parserPromise;
}
