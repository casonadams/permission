import { dirname, sep } from "node:path";

import type { Ruleset } from "./rule";
import type { SessionApproval } from "./session-approval";
import type { SessionApprovalRecorder } from "./session-approval-recorder";

export class SessionRules implements SessionApprovalRecorder {
  private rules: Ruleset = [];

  approve(surface: string, pattern: string): void {
    this.rules.push({
      surface,
      pattern,
      action: "allow",
      layer: "session",
      origin: "session",
    });
  }

  getRuleset(): Ruleset {
    return [...this.rules];
  }

  recordSessionApproval(approval: SessionApproval): void {
    for (const pattern of approval.patterns) {
      this.approve(approval.surface, pattern);
    }
  }

  clear(): void {
    this.rules = [];
  }
}

export function deriveApprovalPattern(normalizedPath: string): string {
  if (normalizedPath.endsWith(sep)) {
    return `${normalizedPath}*`;
  }
  const dir = dirname(normalizedPath);
  if (dir === normalizedPath) {
    return `${dir}*`;
  }
  const prefix = dir.endsWith(sep) ? dir : `${dir}${sep}`;
  return `${prefix}*`;
}
