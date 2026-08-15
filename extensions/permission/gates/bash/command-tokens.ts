import { basename } from "node:path";
import { ARG_NODE_TYPES, resolveNodeText, SKIP_SUBTREE_TYPES } from "./ast-text";
import {
  classifyPatternCommandFlag,
  type PatternCommandConfig,
  type PatternCommandFlagDirective,
  patternCommandConfig,
} from "./pattern-commands-config";
import type { TSNode } from "./tree-sitter";
export function extractCommandName(node: TSNode): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "command_name") {
      const text = resolveNodeText(child);
      return text ? basename(text) : undefined;
    }
  }
  return undefined;
}
interface PatternWalk {
  config: PatternCommandConfig;
  patternPositionals: number;
  tokens: string[];
  hasExplicitScript: boolean;
  positionalsSeen: number;
  nextArgAction: "skip" | "extract" | null;
  pastEndOfFlags: boolean;
}
export function collectPatternCommandTokens(node: TSNode, config: PatternCommandConfig): string[] {
  const walk: PatternWalk = {
    config,
    patternPositionals: config.patternPositionals ?? 1,
    tokens: [],
    hasExplicitScript: false,
    positionalsSeen: 0,
    nextArgAction: null,
    pastEndOfFlags: false,
  };
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) processPatternChild(child, walk);
  }
  return walk.tokens;
}

function processPatternChild(child: TSNode, walk: PatternWalk): void {
  if (collectNonArgChild(child, walk.tokens)) return;
  const text = resolveNodeText(child);
  if (handlePrePositional(child, text, walk)) return;
  if (skipPositional(walk)) return;
  walk.tokens.push(text);
}
function collectNonArgChild(child: TSNode, tokens: string[]): boolean {
  if (child.type === "command_name" || child.type === "variable_assignment") return true;
  if (!ARG_NODE_TYPES.has(child.type)) {
    tokens.push(...collectPathCandidateTokens(child));
    return true;
  }
  return false;
}
function handlePrePositional(child: TSNode, text: string, walk: PatternWalk): boolean {
  if (walk.nextArgAction !== null) {
    if (walk.nextArgAction === "extract") walk.tokens.push(text);
    walk.nextArgAction = null;
    return true;
  }
  if (isFlagWord(child, text, walk)) {
    applyFlagDirective(classifyPatternCommandFlag(text, walk.config), walk);
    return true;
  }
  return false;
}
function applyFlagDirective(directive: PatternCommandFlagDirective, walk: PatternWalk): void {
  switch (directive.kind) {
    case "end-of-flags":
      walk.pastEndOfFlags = true;
      break;
    case "consume-arg":
      walk.nextArgAction = directive.nextArgAction;
      if (directive.setsExplicitScript) walk.hasExplicitScript = true;
      break;
    case "regular-flag":
      break;
  }
}
function isFlagWord(child: TSNode, text: string, walk: PatternWalk): boolean {
  return !walk.pastEndOfFlags && child.type === "word" && text.startsWith("-") && text.length > 1;
}
function skipPositional(walk: PatternWalk): boolean {
  if (walk.hasExplicitScript || walk.positionalsSeen >= walk.patternPositionals) return false;
  walk.positionalsSeen++;
  return true;
}
export function collectGenericCommandTokens(node: TSNode): string[] {
  const ctx = { seenCommandName: false, tokens: [] as string[] };
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) processGenericChild(child, ctx);
  }
  return ctx.tokens;
}

function processGenericChild(child: TSNode, ctx: { seenCommandName: boolean; tokens: string[] }): void {
  if (child.type === "command_name") {
    ctx.seenCommandName = true;
    return;
  }
  if (child.type === "variable_assignment") return;
  if (ARG_NODE_TYPES.has(child.type)) {
    consumeGenericArg(child, ctx);
    return;
  }
  ctx.tokens.push(...collectPathCandidateTokens(child));
}
function consumeGenericArg(child: TSNode, ctx: { seenCommandName: boolean; tokens: string[] }): void {
  if (!ctx.seenCommandName) {
    ctx.seenCommandName = true;
    return;
  }
  ctx.tokens.push(resolveNodeText(child));
}
export function collectRedirectTokens(node: TSNode): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && ARG_NODE_TYPES.has(child.type)) tokens.push(resolveNodeText(child));
  }
  return tokens;
}
export function collectCommandTokens(node: TSNode): string[] {
  const commandName = extractCommandName(node);
  const config = commandName ? patternCommandConfig(commandName) : undefined;
  return config ? collectPatternCommandTokens(node, config) : collectGenericCommandTokens(node);
}
export function collectPathCandidateTokens(node: TSNode): string[] {
  const dispatched = dispatchByType(node);
  if (dispatched !== null) return dispatched;
  const tokens: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) tokens.push(...collectPathCandidateTokens(child));
  }
  return tokens;
}
function dispatchByType(node: TSNode): string[] | null {
  if (SKIP_SUBTREE_TYPES.has(node.type)) return [];
  if (node.type === "command") return collectCommandTokens(node);
  if (node.type === "file_redirect") return collectRedirectTokens(node);
  return null;
}
