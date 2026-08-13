/**
 * An ordered accumulator that owns the uniqueness invariant.
 *
 * `add` ignores null/empty values and silently skips duplicates (first-insertion
 * wins). `toArray` returns the ordered result as an independent copy.
 */
export class McpTargetList {
  private readonly targets: string[] = [];

  add(value: string | null): void {
    if (!value) return;
    if (!this.targets.includes(value)) this.targets.push(value);
  }

  toArray(): string[] {
    return [...this.targets];
  }
}
