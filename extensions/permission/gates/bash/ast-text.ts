import type { TSNode } from "./tree-sitter";

/**
 * Node types whose subtrees must never be descended into for path extraction —
 * their text content is not a command argument.
 */
export const SKIP_SUBTREE_TYPES = new Set(["heredoc_body", "heredoc_end", "comment"]);

/** Node types that represent argument values in the AST. */
export const ARG_NODE_TYPES = new Set(["word", "concatenation", "string", "raw_string"]);

/**
 * Resolve the "shell value" of an argument node — the string the shell would
 * pass to the command after quote removal.
 */
export function resolveNodeText(node: TSNode): string {
  switch (node.type) {
    case "word":
      return node.text;
    case "raw_string":
      return unquoteSingle(node.text);
    case "string":
      return resolveStringChildren(node);
    case "concatenation":
      return resolveConcatenation(node);
    default:
      return node.text;
  }
}

/** Strip surrounding single quotes from a `raw_string`: 'content' → content. */
function unquoteSingle(text: string): string {
  if (text.length < 2 || !text.startsWith("'") || !text.endsWith("'")) return text;
  return text.slice(1, -1);
}

/** Concatenate the resolved text of a `string`'s children, skipping `"` delimiters. */
function resolveStringChildren(node: TSNode): string {
  let result = "";
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || child.type === '"') continue;
    result += resolveNodeText(child);
  }
  return result;
}

/** Concatenate the resolved text of a `concatenation`'s children. */
function resolveConcatenation(node: TSNode): string {
  let result = "";
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    result += resolveNodeText(child);
  }
  return result;
}
