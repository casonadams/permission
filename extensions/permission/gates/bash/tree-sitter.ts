import { createRequire } from "node:module";

/**
 * Minimal subset of web-tree-sitter's SyntaxNode used by the AST walker.
 * Defined locally so callers do not need to import web-tree-sitter types.
 */
export interface TSNode {
  readonly type: string;
  readonly text: string;
  readonly childCount: number;
  /** False for anonymous tokens (operators, delimiters); true for named nodes. */
  readonly isNamed: boolean;
  child(index: number): TSNode | null;
}

/** Minimal subset of web-tree-sitter's Parser used by this module. */
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

/** Lazily create and cache the shared tree-sitter-bash parser. */
export function getParser(): Promise<TSParser> {
  parserPromise ??= initParser();
  return parserPromise;
}
