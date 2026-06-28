/**
 * Cross-extension gate prompter registry.
 *
 * Mirrors the `Symbol.for()`-backed service pattern in `./service.ts`: the
 * vendored `index.ts` reads from this slot at `GateRunner` construction time,
 * and a sibling local extension (e.g. `pi-permission-ui`) can call
 * `setGatePrompter()` to inject a custom prompter. The slot is resolved lazily
 * inside `GateRunner.run()` so registration order between extensions does not
 * matter — both orderings produce the same behavior.
 *
 * Local fork note: the upstream package does not expose a prompter swap. This
 * module is the seam added by the local fork. See
 * `extensions/pi-permission-ui/` for the consumer.
 */
import type { GatePrompter } from "./gate-prompter";

/** Process-global key for the gate-prompter slot. */
const PROMPTER_KEY = Symbol.for("@gotgenes/pi-permission-system:gate-prompter");

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

/**
 * Install a custom gate prompter. The most-recently-registered prompter
 * wins. Calling with `null` clears the slot and falls back to the upstream
 * permission dialog. The caller (typically a Pi extension's `default
 * export factory`) is expected to call this exactly once during session
 * setup.
 */
export function setGatePrompter(prompter: GatePrompter | null): void {
  getSlot().prompter = prompter;
}

/**
 * Return the currently-installed prompter, or `null` if none is registered.
 * `GateRunner` calls this lazily on every gate run so the prompter can be
 * registered after the vendored package's `index.ts` factory has executed.
 */
export function getInstalledGatePrompter(): GatePrompter | null {
  return getSlot().prompter;
}
