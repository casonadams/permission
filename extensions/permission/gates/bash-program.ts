import { resolve } from "node:path";
import { classifyTokenAsPathCandidate, classifyTokenAsRuleCandidate } from "#src/gates/bash-token-classification";
import { canonicalizePath } from "#src/paths/canonicalize-path";
import { isPathWithinDirectory, isSafeSystemPath, normalizePathForComparison } from "#src/paths/path-utils";

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
  readonly token: string;
  readonly policyValues: readonly string[];
}
export class BashProgram {
  private constructor(
    private readonly rawCandidates: readonly PathCandidate[],
    private readonly commandUnits: readonly BashCommand[],
  ) {}
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
  // Fallow cannot resolve this member through the private static factory.
  // fallow-ignore-next-line unused-class-member
  commands(): BashCommand[] {
    return [...this.commandUnits];
  }
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
function collectExternalPaths(candidates: readonly PathCandidate[], ctx: ExternalCtx): string[] {
  for (const candidate of candidates) pushExternalPath(candidate, ctx);
  return ctx.external;
}

function pushExternalPath({ token, base }: PathCandidate, ctx: ExternalCtx): void {
  const candidate = classifyTokenAsPathCandidate(token);
  if (!candidate) return;
  if (base.kind === "unknown" && isRelativeCandidate(candidate)) {
    pushConservative(canonicalizePath(normalizePathForComparison(candidate, ctx.cwd)), ctx);
    return;
  }
  const resolveBase = base.kind === "known" ? resolve(ctx.cwd, base.offset) : ctx.cwd;
  pushIfExternal(canonicalizePath(normalizePathForComparison(candidate, resolveBase)), ctx);
}
function pushConservative(normalized: string, ctx: ExternalCtx): void {
  if (!normalized || ctx.normalizedCwd === "" || isSafeSystemPath(normalized)) return;
  if (ctx.seen.has(normalized)) return;
  ctx.seen.add(normalized);
  ctx.external.push(normalized);
}
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
