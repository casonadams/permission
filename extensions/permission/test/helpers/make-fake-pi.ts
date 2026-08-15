import { createEventBus, type EventBus } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

export type RecordedHandler = (event: unknown, ctx: unknown) => unknown;

export interface FakePi {
  events: EventBus;
  handlers: Map<string, RecordedHandler[]>;
  commands: Map<string, unknown>;
  fire(event: string, input?: unknown, ctx?: unknown): Promise<unknown>;
  getAllTools(): { name: string }[];
  getActiveTools(): string[];
  setActiveTools(names: string[]): void;
  sendMessage: ReturnType<typeof vi.fn>;
}

export interface MakeFakePiOptions {
  events?: EventBus;
  toolNames?: readonly string[];
}

const DEFAULT_TOOL_NAMES = ["read", "write", "edit", "bash", "ls", "grep"];

export function makeFakePi(options: MakeFakePiOptions = {}): FakePi {
  const events = options.events ?? createEventBus();
  const toolNames = options.toolNames ?? DEFAULT_TOOL_NAMES;
  const handlers = new Map<string, RecordedHandler[]>();
  const commands = new Map<string, unknown>();

  return {
    events,
    handlers,
    commands,
    async fire(event, input, ctx): Promise<unknown> {
      const list = handlers.get(event);
      if (!list || list.length === 0) {
        throw new Error(`No handler registered for event "${event}"`);
      }
      let result: unknown;
      for (const handler of list) {
        result = await handler(input, ctx);
      }
      return result;
    },
    getAllTools(): { name: string }[] {
      return toolNames.map((name) => ({ name }));
    },
    getActiveTools(): string[] {
      return [...toolNames];
    },
    setActiveTools: vi.fn(),
    sendMessage: vi.fn(),
    on(event: string, handler: RecordedHandler): void {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand(name: string, optionsArg: unknown): void {
      commands.set(name, optionsArg);
    },
    registerProvider: vi.fn(),
    exec: vi.fn(),
  } as FakePi & Record<string, unknown>;
}
