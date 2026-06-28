import { isAbsolute, join } from "node:path";
import { ARG_NODE_TYPES } from "./ast-text";
import { extractCommandName } from "./command-tokens";
import type { TSNode } from "./tree-sitter";

/**
 * The working directory in force where a path candidate appears.
 *
 * A `known` base carries an `offset` joined with `cwd` at resolution time: a
 * relative-or-absolute path string built by folding literal current-shell `cd`
 * targets (`""` = `cwd`); an absolute offset (from `cd /abs`) ignores `cwd`.
 * An `unknown` base marks a non-literal `cd` target that made the effective
 * directory unresolvable.
 */
export type EffectiveBase = { readonly kind: "known"; readonly offset: string } | { readonly kind: "unknown" };

/** The effective directory after a non-literal or unresolvable `cd`. */
const UNKNOWN_BASE: EffectiveBase = { kind: "unknown" };

/**
 * Compute the effective base after a command runs. Returns `base` unchanged
 * unless the command is `cd`: `cd /abs` → fresh known base; `cd rel` → folded
 * into a known base (or stays unknown); `cd "$DIR"`/`cd $(…)`/`cd -`/bare `cd`/
 * `cd ~…` → unknown.
 */
export function foldCd(commandNode: TSNode, base: EffectiveBase): EffectiveBase {
  if (extractCommandName(commandNode) !== "cd") return base;
  const target = cdLiteralTarget(commandNode);
  if (target === null) return UNKNOWN_BASE;
  if (isAbsolute(target)) return { kind: "known", offset: target };
  if (base.kind === "unknown") return UNKNOWN_BASE;
  return { kind: "known", offset: join(base.offset, target) };
}

/**
 * Resolve the literal target of a `cd` command, or `null` when the first
 * argument is not a static literal (expansion/substitution) or is not
 * resolvable (`cd -`, `cd ~…`, bare `cd`).
 */
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

/** True for nodes that precede the target and must be skipped (name, assignment, `--`). */
function shouldSkipCdArg(child: TSNode): boolean {
  if (!child.isNamed) return true;
  if (child.type === "command_name" || child.type === "variable_assignment") return true;
  return child.type === "word" && child.text === "--";
}

/**
 * The literal string value of an argument node, or `null` when it contains a
 * variable expansion / command substitution or is a non-resolvable `cd`
 * destination (`-`, `~…`).
 */
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

/** A bare word is non-resolvable when it is `-` or home-relative (`~…`). */
function literalWord(text: string): string | null {
  if (text === "-" || text.startsWith("~")) return null;
  return text;
}

/** Strip surrounding single quotes from a `raw_string` literal. */
function unquoteSingleLiteral(text: string): string {
  if (text.length < 2 || !text.startsWith("'") || !text.endsWith("'")) return text;
  return text.slice(1, -1);
}

/** Concatenate the literal text of a `concatenation`'s children (null if any part is non-literal). */
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

/** Concatenate the `string_content` children of a `string` (null on any expansion). */
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
