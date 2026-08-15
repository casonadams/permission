export class CacheKeyGate {
  private previousKey: string | null = null;

  runIfChanged<T>(nextKey: string, effect: () => T): T | undefined {
    if (this.previousKey === nextKey) {
      return undefined;
    }
    const result = effect();
    this.previousKey = nextKey;
    return result;
  }

  reset(): void {
    this.previousKey = null;
  }
}
