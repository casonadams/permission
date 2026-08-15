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
