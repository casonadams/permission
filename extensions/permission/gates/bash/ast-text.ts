import type { TSNode } from "./tree-sitter";
export const SKIP_SUBTREE_TYPES = new Set(["heredoc_body", "heredoc_end", "comment"]);
export const ARG_NODE_TYPES = new Set(["word", "concatenation", "string", "raw_string"]);
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
function unquoteSingle(text: string): string {
  if (text.length < 2 || !text.startsWith("'") || !text.endsWith("'")) return text;
  return text.slice(1, -1);
}
function resolveStringChildren(node: TSNode): string {
  let result = "";
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || child.type === '"') continue;
    result += resolveNodeText(child);
  }
  return result;
}
function resolveConcatenation(node: TSNode): string {
  let result = "";
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    result += resolveNodeText(child);
  }
  return result;
}
