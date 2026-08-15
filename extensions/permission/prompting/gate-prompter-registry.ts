import type { GatePrompter } from "./gate-prompter";

const PROMPTER_KEY = Symbol.for("@casonadams/permission:gate-prompter");

interface PrompterSlot {
  prompter: GatePrompter | null;
}

function getSlot(): PrompterSlot {
  const globalRef = globalThis as unknown as Record<symbol, PrompterSlot | undefined>;
  let slot = globalRef[PROMPTER_KEY];
  if (!slot) {
    slot = { prompter: null };
    globalRef[PROMPTER_KEY] = slot;
  }
  return slot;
}

export function setGatePrompter(prompter: GatePrompter | null): void {
  getSlot().prompter = prompter;
}

export function getInstalledGatePrompter(): GatePrompter | null {
  return getSlot().prompter;
}
