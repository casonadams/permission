import { resolve } from "node:path";
import { getPathPolicyValues, normalizePathPolicyLiteral } from "#src/paths/path-utils";
import { SKIP_SUBTREE_TYPES } from "./ast-text";
import { type EffectiveBase, foldCd } from "./cd-folding";
import { collectCommandTokens, collectPathCandidateTokens } from "./command-tokens";
import type { TSNode } from "./tree-sitter";
export interface PathCandidate {
  readonly token: string;
  readonly base: EffectiveBase;
}
const CWD_BASE: EffectiveBase = { kind: "known", offset: "" };
export function collectPathCandidates(rootNode: TSNode): PathCandidate[] {
  const out: PathCandidate[] = [];
  walkForCandidates(rootNode, CWD_BASE, out);
  return out;
}
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
  tagTokens(collectPathCandidateTokens(node), base, out);
  return base;
}

function isCurrentShellSequence(node: TSNode): boolean {
  return node.type === "program" || node.type === "list" || node.type === "redirected_statement";
}
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
function isBackgrounded(seqNode: TSNode, i: number): boolean {
  const next = seqNode.child(i + 1);
  if (!next || next.isNamed) return false;
  return next.type === "&";
}

function tagTokens(tokens: readonly string[], base: EffectiveBase, out: PathCandidate[]): void {
  for (const token of tokens) out.push({ token, base });
}
export function isRelativeCandidate(candidate: string): boolean {
  return !candidate.startsWith("/") && !candidate.startsWith("~");
}
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
function literalPolicyValues(candidate: string): string[] {
  const literal = normalizePathPolicyLiteral(candidate);
  return literal ? [literal] : [];
}
