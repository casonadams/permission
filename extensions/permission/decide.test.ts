import { describe, expect, it } from "vitest";
import { decideToolCall, type ToolCallCheck } from "./decide";
import { type CompiledRule, compileRule } from "./match";
import { buildPolicy, parsePolicyScope, type ScopeRules } from "./policy";

const cwd = "/repo";

function policyFrom(permission: Record<string, unknown>) {
  return buildPolicy(scopeFrom(permission), null);
}

function scopeFrom(permission: Record<string, unknown>): ScopeRules {
  return parsePolicyScope({ permission }).scope;
}

function sessionRules(...rules: { surface: string; pattern: string }[]): CompiledRule[] {
  return rules.map((rule) => compileRule({ ...rule, state: "allow" }));
}

const examplePolicy = policyFrom({
  "*": "ask",
  read: "allow",
  write: "allow",
  edit: "allow",
  grep: "allow",
  find: "allow",
  ls: "allow",
  path: {
    "/tmp/*": "allow",
    "*.env*": "deny",
    "*.env.example": "allow",
    "~/.ssh/*": "deny",
  },
  bash: {
    "*": "ask",
    "git status": "allow",
    "git diff*": "allow",
    "git log *": "allow",
    "rm -rf *": { action: "deny", reason: "destructive" },
    "sudo *": "ask",
  },
});

function decide(call: Partial<ToolCallCheck> = {}, policy = examplePolicy) {
  return decideToolCall(policy, [], { toolName: "bash", input: {}, cwd, ...call });
}

describe("decideToolCall: bash surface", () => {
  it("allows allowlisted subcommands", () => {
    expect(decide({ toolName: "bash", input: { command: "git status" } }).decision.state).toBe("allow");
    expect(decide({ toolName: "bash", input: { command: "git diff HEAD~1" } }).decision.state).toBe("allow");
  });

  it("asks for unmatched subcommands per the catch-all", () => {
    expect(decide({ toolName: "bash", input: { command: "npm test" } }).decision.state).toBe("ask");
  });

  it("denies destructive commands with the configured reason", () => {
    const result = decide({ toolName: "bash", input: { command: "rm -rf /tmp/x" } });
    expect(result.decision.state).toBe("deny");
    expect(result.decision.reason).toBe("destructive");
  });

  it("catches smuggling across compound commands (per-command matching)", () => {
    const result = decide({ toolName: "bash", input: { command: "git status; rm -rf /" } });
    expect(result.decision.state).toBe("deny");
    expect(result.decision.reason).toBe("destructive");
  });

  it("asks when any subcommand of an otherwise-allowed compound is uncovered", () => {
    const result = decide({ toolName: "bash", input: { command: "git status && npm test" } });
    expect(result.decision.state).toBe("ask");
  });

  it("forces ask for command substitution even when the surface text matches", () => {
    const permissive = policyFrom({ bash: { "echo *": "allow" } });
    const result = decide({ toolName: "bash", input: { command: "echo $(dangerous)" } }, permissive);
    expect(result.decision.state).toBe("ask");
  });

  it("does not let a path rule be overridden by a bash allow", () => {
    const result = decide({ toolName: "bash", input: { command: "cat ~/.ssh/id_rsa" } });
    expect(result.decision.state).toBe("deny");
  });

  it("asks on redirect targets outside cwd without a path rule", () => {
    const permissive = policyFrom({ bash: "allow" });
    expect(decide({ toolName: "bash", input: { command: "ls > /etc/hosts" } }, permissive).decision.state).toBe("ask");
    expect(decide({ toolName: "bash", input: { command: "ls > out.txt" } }, permissive).decision.state).toBe("allow");
    expect(decide({ toolName: "bash", input: { command: "ls 2>/dev/null" } }, permissive).decision.state).toBe("allow");
  });

  it("gates cd targets outside cwd", () => {
    const permissive = policyFrom({ bash: "allow", cat: "allow" });
    expect(decide({ toolName: "bash", input: { command: "cd /etc && cat passwd" } }, permissive).decision.state).toBe(
      "ask",
    );
  });
});

describe("decideToolCall: path surface across tools", () => {
  it("denies .env writes via the path rule even though write is allowed", () => {
    const result = decide({ toolName: "write", input: { path: "/repo/.env" } });
    expect(result.decision.state).toBe("deny");
  });

  it("allows reads inside cwd and .env.example exceptions", () => {
    expect(decide({ toolName: "read", input: { path: "/repo/src/App.tsx" } }).decision.state).toBe("allow");
    expect(decide({ toolName: "read", input: { path: "/repo/.env.example" } }).decision.state).toBe("allow");
  });

  it("asks for paths outside cwd with no rule, honors /tmp in the example policy", () => {
    const minimal = policyFrom({ read: "allow" });
    expect(decide({ toolName: "read", input: { path: "/var/log/system.log" } }, minimal).decision.state).toBe("ask");
    expect(decide({ toolName: "read", input: { path: "/tmp/scratch.txt" } }, minimal).decision.state).toBe("ask");
    expect(decide({ toolName: "read", input: { path: "/tmp/scratch.txt" } }, examplePolicy).decision.state).toBe(
      "allow",
    );
  });

  it("auto-allows infrastructure reads for read-only tools", () => {
    const minimal = policyFrom({ read: "allow" });
    const result = decide(
      {
        toolName: "read",
        input: { path: "~/.pi/agent/skills/x/SKILL.md" },
        infrastructureDirs: ["~/.pi/agent"],
      },
      minimal,
    );
    expect(result.decision.state).toBe("allow");
  });

  it("infrastructure allowance never applies to write tools", () => {
    const minimal = policyFrom({ write: "allow" });
    const result = decide(
      {
        toolName: "write",
        input: { path: "~/.pi/agent/settings.json" },
        infrastructureDirs: ["~/.pi/agent"],
      },
      minimal,
    );
    expect(result.decision.state).toBe("ask");
  });
});

describe("decideToolCall: mcp and generic tools", () => {
  it("matches mcp server:tool then server targets (broad rules first)", () => {
    const policy = policyFrom({ mcp: { "*": "ask", "exa:*": "allow" } });
    expect(decide({ toolName: "mcp", input: { server: "exa", tool: "search" } }, policy).decision.state).toBe("allow");
    expect(decide({ toolName: "mcp", input: { server: "github", tool: "search" } }, policy).decision.state).toBe("ask");
  });

  it("checks mcp arguments.path through the path surface", () => {
    const policy = policyFrom({ mcp: "allow", path: { "~/.ssh/*": "deny" } });
    const result = decide(
      {
        toolName: "mcp",
        input: { server: "fs", tool: "read", arguments: { path: "~/.ssh/id_rsa" } },
      },
      policy,
    );
    expect(result.decision.state).toBe("deny");
  });

  it("gates extension tools by name with the universal fallback", () => {
    const policy = policyFrom({ "*": "ask", webfetch: "allow" });
    expect(decide({ toolName: "webfetch", input: { url: "https://x" } }, policy).decision.state).toBe("allow");
    expect(decide({ toolName: "custom_tool", input: {} }, policy).decision.state).toBe("ask");
  });
});

describe("decideToolCall: session rules", () => {
  it("session rules take precedence over config", () => {
    const session = sessionRules({ surface: "bash", pattern: "npm test" });
    const result = decideToolCall(examplePolicy, session, {
      toolName: "bash",
      input: { command: "npm test" },
      cwd,
    });
    expect(result.decision.state).toBe("allow");
    expect(result.decision.matchedPattern).toBe("npm test");
  });

  it("produces session drafts for ask components", () => {
    const result = decide({ toolName: "bash", input: { command: "npm run build" } });
    expect(result.decision.state).toBe("ask");
    expect(result.sessionDrafts).toContainEqual({ surface: "bash", pattern: "npm run build" });
  });

  it("produces parent-dir glob drafts for outside-cwd path asks", () => {
    const minimal = policyFrom({ read: "allow" });
    const result = decide({ toolName: "read", input: { path: "/var/log/syslog" } }, minimal);
    expect(result.decision.state).toBe("ask");
    expect(result.sessionDrafts).toContainEqual({ surface: "path", pattern: "/var/log/*" });
  });
});
