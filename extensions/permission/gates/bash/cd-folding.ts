import { isAbsolute, join } from "node:path";
import { ARG_NODE_TYPES } from "./ast-text";
import { extractCommandName } from "./command-tokens";
import type { TSNode } from "./tree-sitter";
export type EffectiveBase = { readonly kind: "known"; readonly offset: string } | { readonly kind: "unknown" };
const UNKNOWN_BASE: EffectiveBase = { kind: "unknown" };
export function foldCd(commandNode: TSNode, base: EffectiveBase): EffectiveBase {
  if (extractCommandName(commandNode) !== "cd") return base;
  const target = cdLiteralTarget(commandNode);
  if (target === null) return UNKNOWN_BASE;
  if (isAbsolute(target)) return { kind: "known", offset: target };
  if (base.kind === "unknown") return UNKNOWN_BASE;
  return { kind: "known", offset: join(base.offset, target) };
}
function cdLiteralTarget(commandNode: TSNode): string | null {
  for (let i = 0; i < commandNode.childCount; i++) {
    const child = commandNode.child(i);
    if (!child) continue;
    if (shouldSkipCdArg(child)) continue;
    if (!ARG_NODE_TYPES.has(child.type)) return null;
    return literalTextOf(child);
  }
  return null;
}
function shouldSkipCdArg(child: TSNode): boolean {
  if (!child.isNamed) return true;
  if (child.type === "command_name" || child.type === "variable_assignment") return true;
  return child.type === "word" && child.text === "--";
}
function literalTextOf(node: TSNode): string | null {
  switch (node.type) {
    case "word":
      return literalWord(node.text);
    case "raw_string":
      return unquoteSingleLiteral(node.text);
    case "concatenation":
      return literalConcatenation(node);
    case "string":
      return literalString(node);
    default:
      return null;
  }
}
function literalWord(text: string): string | null {
  if (text === "-" || text.startsWith("~")) return null;
  return text;
}
function unquoteSingleLiteral(text: string): string {
  if (text.length < 2 || !text.startsWith("'") || !text.endsWith("'")) return text;
  return text.slice(1, -1);
}
function literalConcatenation(node: TSNode): string | null {
  let result = "";
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const part = literalTextOf(child);
    if (part === null) return null;
    result += part;
  }
  return result;
}
function literalString(node: TSNode): string | null {
  let result = "";
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || child.type === '"') continue;
    if (child.type !== "string_content") return null;
    result += child.text;
  }
  return result;
}
