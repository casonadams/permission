# permission

Permission enforcement for the [Pi coding agent](https://pi.mariozechner.at/).

## Install

```bash
pi install git:github.com/casonadams/permission
```

Restart Pi after installation. Add `-l` to install through project settings
instead of global settings.

To configure the package manually, add it to `~/.pi/agent/settings.json` or
`.pi/settings.json`:

```json
{
  "packages": ["git:github.com/casonadams/permission"]
}
```

Use `git:git@github.com:casonadams/permission.git` instead to clone over SSH.

## Configure

Permission policy is loaded from these optional JSON files, from lowest to
highest precedence:

1. `~/.pi/agent/permission.json`
2. `<project>/.pi/agent/permission.json`
3. Agent frontmatter

Start with [`permission.example.json`](./permission.example.json), or use this
minimal policy:

```json
{
  "$schema": "https://raw.githubusercontent.com/casonadams/permission/main/schemas/permissions.schema.json",
  "permission": {
    "*": "ask",
    "read": "allow",
    "write": "allow",
    "edit": "allow",
    "grep": "allow",
    "find": "allow",
    "ls": "allow",
    "path": {
      "/tmp/*": "allow",
      "*.env*": { "action": "deny", "reason": "secrets" },
      "~/.ssh/*": { "action": "deny", "reason": "secrets" }
    },
    "bash": {
      "*": "ask",
      "git status": "allow",
      "git diff*": "allow",
      "rm -rf *": { "action": "deny", "reason": "destructive" }
    }
  }
}
```

The `$schema` field is optional and is used only for editor completion.

## Rules

Pi's built-in tool surfaces are `read`, `write`, `edit`, `bash`, `grep`, `find`,
and `ls`. `path`, `mcp`, and `skill` are permission surfaces rather than
built-in tools.

Each key under `permission` is a surface:

| Surface                                       | Patterns match                                         |
| --------------------------------------------- | ------------------------------------------------------ |
| `*`                                           | Fallback for surfaces without a rule                   |
| `read`, `write`, `edit`, `ls`, `grep`, `find` | Tool path                                              |
| `bash`                                        | Full command                                           |
| `mcp`                                         | MCP target                                             |
| `skill`                                       | Skill name                                             |
| `path`                                        | Every detected file path, including bash and MCP paths |

- `allow` permits the action silently.
- `deny` blocks it, optionally returning a configured reason.
- `ask` opens an approval prompt.
- Prompt options stay ordered as Allow, Session, Deny when a session pattern is
  available.
- A string is shorthand for a catch-all. For example, `"read": "allow"` means
  `"read": { "*": "allow" }`.
- Last matching pattern wins. Put broad rules before specific exceptions.
- Every applicable gate must allow the action. A `path` deny cannot be
  overridden by a tool rule.
- Paths outside the working directory with no explicit `path` rule default to
  `ask`. Add rules such as `"/tmp/*": "allow"` for trusted external directories.

## MCP

MCP targets can be matched in underscore or colon form. For a `playwright`
server:

```json
"mcp": {
  "*": "ask",
  "playwright_browser_snapshot": "allow",
  "playwright_browser_navigate*": "allow",
  "playwright_browser_evaluate": { "action": "deny", "reason": "arbitrary page JavaScript" }
}
```

`playwright:*` also matches the server. Prefer `playwright_*` when one rule
should cover both MCP call styles.

## Inspect

Use `/permission-system show` to display the effective policy summary,
`/permission-system path` to show the global config path, or
`/permission-system help` for usage.

Permission decisions are recorded at:

```text
~/.pi/agent/extensions/pi-permission-system/logs/pi-permission-system-permission-review.jsonl
```

## Develop

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm format
```
