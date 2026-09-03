import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ agentDir: "" }));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: () => state.agentDir,
  getPackageDir: () => undefined,
}));

type Handler = (event: never, ctx: never) => unknown;

const agentDir = mkdtempSync(join(tmpdir(), "permission-test-"));
state.agentDir = agentDir;

interface Installed {
  handlers: Map<string, Handler>;
  selections: (string | undefined)[];
  inputs: (string | undefined)[];
  editors: (string | undefined)[];
  promptCount: () => number;
  notifications: { message: string; level: string }[];
  call(command: string): Promise<unknown>;
  input(text: string, hasUI?: boolean): Promise<unknown>;
}

async function setup(permission: Record<string, unknown>): Promise<Installed> {
  writeFileSync(join(agentDir, "permission.json"), JSON.stringify(permission));
  const { default: permissionExtension } = await import("./index");
  const handlers = new Map<string, Handler>();
  permissionExtension({
    on: (event: string, handler: Handler) => handlers.set(event, handler),
  } as never);
  const selections: (string | undefined)[] = [];
  const inputs: (string | undefined)[] = [];
  const editors: (string | undefined)[] = [];
  let promptCount = 0;
  const notifications: { message: string; level: string }[] = [];
  const ctx = {
    cwd: "/repo",
    hasUI: true,
    ui: {
      select: async () => {
        promptCount += 1;
        return selections.shift();
      },
      input: async () => inputs.shift(),
      editor: async (_title: string, prefill?: string) => (editors.length > 0 ? editors.shift() : prefill),
      notify: async (message: string, level?: string) => {
        notifications.push({ message, level: level ?? "info" });
      },
    },
  };
  handlers.get("session_start")?.({ reason: "startup" } as never, { cwd: "/repo" } as never);
  return {
    handlers,
    selections,
    inputs,
    editors,
    promptCount: () => promptCount,
    notifications,
    call: async (command: string) =>
      handlers.get("tool_call")?.({ toolName: "bash", input: { command } } as never, ctx as never),
    input: async (text: string, hasUI = true) => handlers.get("input")?.({ text } as never, { ...ctx, hasUI } as never),
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe("permission extension adapter", () => {
  it("extracts skill names from /skill: input", async () => {
    const { extractSkillName } = await import("./index");
    expect(extractSkillName("/skill:commit extra args")).toBe("commit");
    expect(extractSkillName("/skill: commit")).toBe("commit");
    expect(extractSkillName("/skill:")).toBeNull();
    expect(extractSkillName("hello")).toBeNull();
  });

  it("blocks bash commands when no UI is available", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    const result = await installed.handlers.get("tool_call")?.(
      { toolName: "bash", input: { command: "npm test" } } as never,
      { cwd: "/repo", hasUI: false } as never,
    );
    expect(result).toEqual({ block: true, reason: expect.stringContaining("no interactive UI") });
  });

  it("allows and denies per policy with a UI", async () => {
    const installed = await setup({
      permission: {
        bash: { "*": "ask", "git status": "allow", "rm -rf *": { action: "deny", reason: "destructive" } },
      },
    });
    expect(await installed.call("git status")).toBeUndefined();
    expect(await installed.call("rm -rf /tmp/x")).toEqual({ block: true, reason: "destructive" });
  });

  it("allows single execution on 'Allow' but prompts again on next call", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    installed.selections.push("Allow", "Allow");
    expect(await installed.call("npm test")).toBeUndefined();
    expect(await installed.call("npm test")).toBeUndefined();
    expect(installed.promptCount()).toBe(2);
  });

  it("persists rules and avoids re-prompting on 'Always allow'", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    installed.selections.push("Always allow");
    expect(await installed.call("npm test")).toBeUndefined();
    expect(await installed.call("npm test")).toBeUndefined();
    expect(installed.promptCount()).toBe(1);

    const saved = JSON.parse(readFileSync(join(agentDir, "permission.json"), "utf-8"));
    expect(saved.permission.bash["npm test"]).toBe("allow");
  });

  it("allows editing command pattern before saving on 'Always allow'", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    installed.selections.push("Always allow");
    installed.editors.push("npm *");
    expect(await installed.call("npm test")).toBeUndefined();
    expect(await installed.call("npm run build")).toBeUndefined();
    expect(installed.promptCount()).toBe(1);

    const saved = JSON.parse(readFileSync(join(agentDir, "permission.json"), "utf-8"));
    expect(saved.permission.bash["npm *"]).toBe("allow");
  });

  it("cancels 'Always allow' if pattern editor is dismissed", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    installed.selections.push("Always allow");
    installed.editors.push(undefined);
    expect(await installed.call("npm test")).toEqual({
      block: true,
      reason: "Permission denied by user. Do not retry this operation without explicit user request.",
    });
    const saved = JSON.parse(readFileSync(join(agentDir, "permission.json"), "utf-8"));
    expect(saved.permission.bash).toBe("ask");
  });

  it("allows editing command input via 'Edit / View' and executes mutated input", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    installed.selections.push("Edit / View");
    installed.editors.push("npm run safe");

    const inputObj = { command: "npm run risky" };
    const res = await installed.handlers.get("tool_call")?.(
      { toolName: "bash", input: inputObj } as never,
      {
        cwd: "/repo",
        hasUI: true,
        ui: { select: async () => installed.selections.shift(), editor: async () => installed.editors.shift() },
      } as never,
    );
    expect(res).toBeUndefined();
    expect(inputObj.command).toBe("npm run safe");
  });

  it("cancels execution if 'Edit / View' editor is dismissed", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    installed.selections.push("Edit / View");
    installed.editors.push(undefined);
    expect(await installed.call("npm test")).toEqual({
      block: true,
      reason: "Permission denied by user. Do not retry this operation without explicit user request.",
    });
  });

  it("denies with custom reason on 'Deny with reason'", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    installed.selections.push("Deny with reason");
    installed.inputs.push("not allowed right now");
    expect(await installed.call("npm test")).toEqual({
      block: true,
      reason: 'Permission denied by user: "not allowed right now". Do not retry this operation.',
    });
  });

  it("blocks asks when the prompt is dismissed", async () => {
    const installed = await setup({ permission: { bash: "ask" } });
    installed.selections.push(undefined);
    expect(await installed.call("npm test")).toEqual({
      block: true,
      reason: "Permission denied by user. Do not retry this operation without explicit user request.",
    });
  });

  it("gates skills through the input event", async () => {
    const installed = await setup({ permission: { skill: { "*": "ask", deploy: "deny" } } });
    expect(await installed.input("/skill:deploy")).toEqual({ action: "handled" });
    expect(installed.notifications.some((n) => n.message.includes("deploy"))).toBe(true);
    expect(await installed.input("/skill:unknown", false)).toEqual({ action: "handled" });
    expect(await installed.input("plain text")).toEqual({ action: "continue" });
  });

  it("always-allowed skills persist rule and skip later prompts", async () => {
    const installed = await setup({ permission: { skill: "ask" } });
    installed.selections.push("Always allow");
    expect(await installed.input("/skill:deploy")).toEqual({ action: "continue" });
    expect(await installed.input("/skill:deploy")).toEqual({ action: "continue" });
    expect(installed.promptCount()).toBe(1);

    const saved = JSON.parse(readFileSync(join(agentDir, "permission.json"), "utf-8"));
    expect(saved.permission.skill.deploy).toBe("allow");
  });
});
