import { resolve } from "node:path";
import { classifyTokenAsPathCandidate, classifyTokenAsRuleCandidate } from "#src/gates/bash-token-classification";
import { canonicalizePath } from "#src/paths/canonicalize-path";
import { isPathWithinDirectory, isSafeSystemPath, normalizePathForComparison } from "#src/paths/path-utils";

// `BashCommand` is the parsed unit type, defined alongside its enumeration.
export type { BashCommand } from "./bash/command-units";

import { type BashCommand, collectCommands } from "./bash/command-units";
import {
  collectPathCandidates,
  getPolicyValuesForRuleCandidate,
  isRelativeCandidate,
  type PathCandidate,
} from "./bash/cwd-projection";
import { getParser } from "./bash/tree-sitter";

export interface BashPathRuleCandidate {
  /** Raw path-like token shown in prompts, logs, and session approvals. */
  readonly token: string;
  /** Equivalent values used for permission policy matching. */
  readonly policyValues: readonly string[];
}

/**
 * A bash command parsed once into a reusable representation.
 *
 * Parsing is the expensive step (tree-sitter WASM); `BashProgram` performs it
 * a single time and exposes typed slices derived from the same AST walk so the
 * bash permission gates do not each re-parse and re-walk the command, and so
 * the slices are guaranteed to agree.
 *
 * Construct via the async `parse()` factory; the constructor is private.
 */
export class BashProgram {
  private constructor(
    private readonly rawCandidates: readonly PathCandidate[],
    private readonly commandUnits: readonly BashCommand[],
  ) {}

  /**
   * Parse a bash command into a `BashProgram`. Uses tree-sitter-bash to build
   * the full AST and walks command-argument and redirect-destination nodes once
   * into raw candidate tokens, each tagged with the effective working directory
   * projected onto its position by folding current-shell `cd` commands. Heredoc
   * bodies, comments, and other non-argument content are skipped. An unparseable
   * command yields an empty program.
   */
  static async parse(command: string): Promise<BashProgram> {
    const parser = await getParser();
    const tree = parser.parse(command);
    if (!tree) return new BashProgram([], []);

    try {
      const rawCandidates = collectPathCandidates(tree.rootNode);
      const commandUnits = collectCommands(tree.rootNode);
      return new BashProgram(rawCandidates, commandUnits);
    } finally {
      tree.delete();
    }
  }

  /**
   * Path-rule candidates paired with their policy lookup values. When `cwd` is
   * available, each relative token is resolved against the effective working
   * directory in force at its position (folding literal `cd` commands), while
   * raw and project-relative aliases are retained for backward-compatible
   * relative rules. A token after a non-literal `cd` keeps only its literal
   * value so no spurious absolute rule can match.
   */
  pathRuleCandidates(cwd?: string): BashPathRuleCandidate[] {
    const seen = new Set<string>();
    const result: BashPathRuleCandidate[] = [];

    for (const { token, base } of this.rawCandidates) {
      const candidate = classifyTokenAsRuleCandidate(token);
      if (!candidate) continue;

      const policyValues = getPolicyValuesForRuleCandidate(candidate, base, cwd);
      if (policyValues.length === 0) continue;

      const key = policyValues.join("\0");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ token: candidate, policyValues });
    }

    return result;
  }

  /**
   * The top-level command-pattern units of the chain, in source order. Splits
   * on the shell chain operators; quotes, command substitution, and subshells
   * are respected by the parser and are NOT split. May be empty; callers fall
   * back to the whole command so the surface is never evaluated weaker than
   * before.
   */
  // Used by resolveBashCommandCheck (bash-command.ts) and tests. Fallow's
  // syntactic analysis cannot resolve the static-factory return type (private
  // ctor), so it reports a false positive here.
  // fallow-ignore-next-line unused-class-member
  commands(): BashCommand[] {
    return [...this.commandUnits];
  }

  /**
   * Deduplicated paths that resolve outside `cwd`. Each candidate is resolved
   * against the effective working directory in force where it appears,
   * projected by folding a sequence of current-shell `cd` commands. A `cd`
   * inside a pipeline or a backgrounded command runs in a subshell and does not
   * update the running directory.
   */
  externalPaths(cwd: string): string[] {
    const normalizedCwd = canonicalizePath(normalizePathForComparison(cwd, cwd));
    return collectExternalPaths(this.rawCandidates, { cwd, normalizedCwd, seen: new Set(), external: [] });
  }
}

interface ExternalCtx {
  readonly cwd: string;
  readonly normalizedCwd: string;
  readonly seen: Set<string>;
  readonly external: string[];
}

/** Resolve every raw candidate against its effective directory, keeping those outside `cwd`. */
function collectExternalPaths(candidates: readonly PathCandidate[], ctx: ExternalCtx): string[] {
  for (const candidate of candidates) pushExternalPath(candidate, ctx);
  return ctx.external;
}

function pushExternalPath({ token, base }: PathCandidate, ctx: ExternalCtx): void {
  const candidate = classifyTokenAsPathCandidate(token);
  if (!candidate) return;
  if (base.kind === "unknown" && isRelativeCandidate(candidate)) {
    // Unknown effective directory: a relative candidate could resolve
    // anywhere, so flag it conservatively — even if it appears within `cwd`.
    pushConservative(canonicalizePath(normalizePathForComparison(candidate, ctx.cwd)), ctx);
    return;
  }
  const resolveBase = base.kind === "known" ? resolve(ctx.cwd, base.offset) : ctx.cwd;
  pushIfExternal(canonicalizePath(normalizePathForComparison(candidate, resolveBase)), ctx);
}

/** Flag a candidate whose effective directory is unknown — even if within `cwd`. */
function pushConservative(normalized: string, ctx: ExternalCtx): void {
  if (!normalized || ctx.normalizedCwd === "" || isSafeSystemPath(normalized)) return;
  if (ctx.seen.has(normalized)) return;
  ctx.seen.add(normalized);
  ctx.external.push(normalized);
}

/** Flag a candidate that resolves outside `cwd`. */
function pushIfExternal(normalized: string, ctx: ExternalCtx): void {
  if (shouldSkipExternal(normalized, ctx)) return;
  ctx.seen.add(normalized);
  ctx.external.push(normalized);
}

function shouldSkipExternal(normalized: string, ctx: ExternalCtx): boolean {
  if (!normalized || ctx.normalizedCwd === "" || isSafeSystemPath(normalized)) return true;
  if (isPathWithinDirectory(normalized, ctx.normalizedCwd)) return true;
  return ctx.seen.has(normalized);
}
