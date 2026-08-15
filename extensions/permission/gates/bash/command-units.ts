import type { BashCommandContext } from "#src/policy/types";
import type { TSNode } from "./tree-sitter";
export interface BashCommand {
  readonly text: string;
  readonly context?: BashCommandContext;
}
const COMMAND_ENUM_DESCEND = new Set(["program", "list", "pipeline", "redirected_statement"]);
const COMMAND_ENUM_SKIP = new Set([
  "file_redirect",
  "heredoc_redirect",
  "herestring_redirect",
  "comment",
  "heredoc_body",
  "heredoc_end",
]);
const NESTED_EXECUTION_CONTEXTS = new Map<string, BashCommandContext>([
  ["command_substitution", "command_substitution"],
  ["process_substitution", "process_substitution"],
]);
export function collectCommands(node: TSNode): BashCommand[] {
  const out: BashCommand[] = [];
  collectCommandsInto(node, undefined, out);
  return out;
}

function collectCommandsInto(node: TSNode, context: BashCommandContext | undefined, out: BashCommand[]): void {
  if (shouldSkipNode(node)) return;
  if (isUnitNode(node)) {
    emitUnitWithSubstitutions(node, context, out);
    return;
  }
  if (COMMAND_ENUM_DESCEND.has(node.type)) {
    descendCommandChildren(node, context, out);
    return;
  }
  out.push(makeUnit(node.text, context));
}

function shouldSkipNode(node: TSNode): boolean {
  return !node.isNamed || COMMAND_ENUM_SKIP.has(node.type);
}

function isUnitNode(node: TSNode): boolean {
  return node.type === "command" || node.type === "subshell";
}
function emitUnitWithSubstitutions(node: TSNode, context: BashCommandContext | undefined, out: BashCommand[]): void {
  out.push(makeUnit(node.text, context));
  if (node.type === "command") collectSubstitutionCommands(node, out);
  else descendCommandChildren(node, "subshell", out);
}

function makeUnit(text: string, context: BashCommandContext | undefined): BashCommand {
  return context ? { text, context } : { text };
}

function descendCommandChildren(node: TSNode, context: BashCommandContext | undefined, out: BashCommand[]): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectCommandsInto(child, context, out);
  }
}
function collectSubstitutionCommands(node: TSNode, out: BashCommand[]): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const nestedContext = NESTED_EXECUTION_CONTEXTS.get(child.type);
    if (nestedContext) descendCommandChildren(child, nestedContext, out);
    else collectSubstitutionCommands(child, out);
  }
}
