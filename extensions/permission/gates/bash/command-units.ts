import type { BashCommandContext } from "#src/policy/types";
import type { TSNode } from "./tree-sitter";

/**
 * One command-pattern unit of a parsed bash program.
 *
 * Minimal by design — `text` is the simple-command (or whole compound
 * statement) string matched against the bash rules. `context` carries the
 * execution context for a nested command (substitution or subshell); absent
 * for a current-shell (top-level) command.
 */
export interface BashCommand {
  readonly text: string;
  readonly context?: BashCommandContext;
}

/** Container node types descended into when enumerating command units. */
const COMMAND_ENUM_DESCEND = new Set(["program", "list", "pipeline", "redirected_statement"]);

/**
 * Named node types skipped during command enumeration: redirect targets,
 * comments, and heredoc bodies — none is a command to evaluate.
 */
const COMMAND_ENUM_SKIP = new Set([
  "file_redirect",
  "heredoc_redirect",
  "herestring_redirect",
  "comment",
  "heredoc_body",
  "heredoc_end",
]);

/**
 * Nested execution contexts whose interior commands really execute and must be
 * evaluated too: command substitution (`$(…)`, backticks) and process
 * substitution (`<(…)`/`>(…)`). Subshells (`( … )`) are handled separately.
 */
const NESTED_EXECUTION_CONTEXTS = new Map<string, BashCommandContext>([
  ["command_substitution", "command_substitution"],
  ["process_substitution", "process_substitution"],
]);

/**
 * Enumerate the command units of a bash program, in source order.
 *
 * Descends container nodes and emits each `command` whole. Also descends into
 * command/process substitution and subshells, emitting each inner command as
 * its own unit *in addition to* the enclosing command (those inner commands
 * really execute). The enclosing command/subshell is always still emitted
 * whole, so adding nested units can only ever produce a more-restrictive
 * decision, never weaker.
 */
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
  // Any other named statement (compound_statement `{ … }`, if/while/for/case,
  // function_definition): emit whole, do not descend.
  out.push(makeUnit(node.text, context));
}

function shouldSkipNode(node: TSNode): boolean {
  return !node.isNamed || COMMAND_ENUM_SKIP.has(node.type);
}

function isUnitNode(node: TSNode): boolean {
  return node.type === "command" || node.type === "subshell";
}

/** Emit a `command`/`subshell` unit whole, then also enumerate its inner units. */
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

/**
 * Search a command's subtree for command/process substitutions and enumerate
 * the commands inside them, tagged with the substitution's execution context.
 */
function collectSubstitutionCommands(node: TSNode, out: BashCommand[]): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const nestedContext = NESTED_EXECUTION_CONTEXTS.get(child.type);
    if (nestedContext) descendCommandChildren(child, nestedContext, out);
    else collectSubstitutionCommands(child, out);
  }
}
