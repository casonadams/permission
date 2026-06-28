import { resolve } from "node:path";
import { getPathPolicyValues, normalizePathPolicyLiteral } from "#src/path-utils";
import { SKIP_SUBTREE_TYPES } from "./ast-text";
import { type EffectiveBase, foldCd } from "./cd-folding";
import { collectCommandTokens, collectPathCandidateTokens } from "./command-tokens";
import type { TSNode } from "./tree-sitter";

/**
 * A path-candidate token paired with the effective working directory projected
 * onto the point in the command stream where it appears.
 */
export interface PathCandidate {
  readonly token: string;
  readonly base: EffectiveBase;
}

/** The working directory in force at the start of a program (`cwd`). */
const CWD_BASE: EffectiveBase = { kind: "known", offset: "" };

/**
 * Walk the AST once, collecting every path-candidate token tagged with the
 * effective working directory projected onto its position.
 *
 * The effective directory is stateful: it starts at `cwd` and each current-shell
 * `cd <literal>` folds into it for subsequent commands. A `cd` inside a
 * pipeline or a backgrounded command runs in a subshell and does not update the
 * running directory; subshell and brace-group interiors inherit the enclosing
 * base without folding their own `cd`s (a conservative first tier).
 */
export function collectPathCandidates(rootNode: TSNode): PathCandidate[] {
  const out: PathCandidate[] = [];
  walkForCandidates(rootNode, CWD_BASE, out);
  return out;
}

/**
 * Collect a single node's candidates tagged with `base`, returning the
 * effective base in force *after* the node (the input base unless the node is a
 * current-shell `cd <literal>` that folds the running directory).
 */
function walkForCandidates(node: TSNode, base: EffectiveBase, out: PathCandidate[]): EffectiveBase {
  if (isCurrentShellSequence(node)) return walkCurrentShellSequence(node, base, out);
  if (node.type === "command") {
    tagTokens(collectCommandTokens(node), base, out);
    return foldCd(node, base);
  }
  if (node.type === "subshell") {
    // A subshell runs in a child shell: its interior `cd`s fold within the
    // subshell but reset on exit, so the folded base is discarded.
    walkCurrentShellSequence(node, base, out);
    return base;
  }
  if (node.type === "compound_statement") {
    // A `{ … }` brace group runs in the current shell, so its `cd`s persist to
    // following commands — thread and return the folded base.
    return walkCurrentShellSequence(node, base, out);
  }
  // Pipelines, control-flow bodies, redirect targets, and substitution interiors:
  // collect every candidate tagged with the enclosing base; do not fold internal
  // `cd`s (conservative — never under-flags).
  tagTokens(collectPathCandidateTokens(node), base, out);
  return base;
}

function isCurrentShellSequence(node: TSNode): boolean {
  return node.type === "program" || node.type === "list" || node.type === "redirected_statement";
}

/**
 * Fold a current-shell sequence: thread the effective base left-to-right so a
 * `cd` updates the base for following siblings. A statement immediately
 * followed by the background operator (`&`) runs in a subshell, so its folded
 * base is discarded.
 */
function walkCurrentShellSequence(seqNode: TSNode, base: EffectiveBase, out: PathCandidate[]): EffectiveBase {
  let current = base;
  for (let i = 0; i < seqNode.childCount; i++) current = walkSequenceChild({ seqNode, i, current, out });
  return current;
}

function walkSequenceChild(args: {
  seqNode: TSNode;
  i: number;
  current: EffectiveBase;
  out: PathCandidate[];
}): EffectiveBase {
  const child = args.seqNode.child(args.i);
  if (!child?.isNamed || SKIP_SUBTREE_TYPES.has(child.type)) return args.current;
  const after = walkForCandidates(child, args.current, args.out);
  return isBackgrounded(args.seqNode, args.i) ? args.current : after;
}

/** True when the statement at `i` is immediately followed by the background operator (`&`). */
function isBackgrounded(seqNode: TSNode, i: number): boolean {
  const next = seqNode.child(i + 1);
  if (!next || next.isNamed) return false;
  return next.type === "&";
}

function tagTokens(tokens: readonly string[], base: EffectiveBase, out: PathCandidate[]): void {
  for (const token of tokens) out.push({ token, base });
}

/** True when a candidate is relative (not absolute `/…` or home-relative `~…`). */
export function isRelativeCandidate(candidate: string): boolean {
  return !candidate.startsWith("/") && !candidate.startsWith("~");
}

/** Policy lookup values for a rule candidate under the projected effective directory. */
export function getPolicyValuesForRuleCandidate(
  candidate: string,
  base: EffectiveBase,
  cwd: string | undefined,
): string[] {
  if (!cwd) return literalPolicyValues(candidate);
  if (base.kind === "unknown" && isRelativeCandidate(candidate)) return literalPolicyValues(candidate);
  const resolveBase = base.kind === "known" ? resolve(cwd, base.offset) : cwd;
  return getPathPolicyValues(candidate, { cwd, resolveBase });
}

/** Literal policy value for a candidate when no `cwd` (or unknown base) is available. */
function literalPolicyValues(candidate: string): string[] {
  const literal = normalizePathPolicyLiteral(candidate);
  return literal ? [literal] : [];
}
