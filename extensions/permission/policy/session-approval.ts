export class SessionApproval {
  private constructor(
    readonly surface: string,
    readonly patterns: readonly string[],
  ) {}

  static single(surface: string, pattern: string): SessionApproval {
    return new SessionApproval(surface, [pattern]);
  }

  static multiple(surface: string, patterns: readonly string[]): SessionApproval {
    return new SessionApproval(surface, [...patterns]);
  }

  get representativePattern(): string | undefined {
    return this.patterns[0];
  }

  toGateApproval(): { surface: string; pattern: string } | undefined {
    const pattern = this.representativePattern;
    if (pattern === undefined) return undefined;
    return { surface: this.surface, pattern };
  }
}
