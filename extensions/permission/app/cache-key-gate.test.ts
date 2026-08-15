import { describe, expect, it, vi } from "vitest";
import { CacheKeyGate } from "#src/app/cache-key-gate";

describe("CacheKeyGate", () => {
  it("runs once per key and returns the effect result", () => {
    const gate = new CacheKeyGate();
    const effect = vi.fn((value: number) => value);

    expect(gate.runIfChanged("key-a", () => effect(1))).toBe(1);
    expect(gate.runIfChanged("key-a", () => effect(2))).toBeUndefined();
    expect(gate.runIfChanged("key-b", () => effect(3))).toBe(3);
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it("does not cache a key when the effect throws", () => {
    const gate = new CacheKeyGate();
    expect(() =>
      gate.runIfChanged("key-a", () => {
        throw new Error("oops");
      }),
    ).toThrow("oops");

    const effect = vi.fn();
    gate.runIfChanged("key-a", effect);
    expect(effect).toHaveBeenCalledOnce();
  });

  it("runs a cached key again after reset", () => {
    const gate = new CacheKeyGate();
    const effect = vi.fn();

    gate.runIfChanged("key-a", effect);
    gate.reset();
    gate.runIfChanged("key-a", effect);

    expect(effect).toHaveBeenCalledTimes(2);
  });
});
