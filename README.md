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

Reload Pi after changing a policy with `/reload`. Restart Pi after installing or updating the package.

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

### Path rules

Use the `path` surface for file protection that should apply regardless of
which tool accesses the path. A trailing `/*` matches both the directory
itself and everything below it, so one rule covers listing a directory and
reading or writing its contents:

```json
"path": {
  "/opt/example/docs/*": "allow",
  "*.env*": { "action": "deny", "reason": "secrets" }
}
```

Patterns are matched against normalized paths. `~` and `$HOME` are expanded,
and relative paths are also checked in their working-directory form. Put
specific exceptions after broad rules because the last matching pattern wins:

```json
"path": {
  "~/.pi/agent/*": "allow",
  "~/.pi/agent/auth.json": { "action": "deny", "reason": "credentials" },
  "~/.pi/agent/mcp.json": { "action": "deny", "reason": "credentials" }
}
```

A path denial is a mandatory gate: an `allow` rule for `read`, `bash`, or
another tool cannot override it.

### Bash rules

Bash patterns match the full command, not just the executable. Keep the broad
`"*": "ask"` rule first, then add narrowly scoped commands such as
`"git status": "allow"` or `"git diff*": "allow"`. Bash commands that contain
file paths are also checked by the cross-cutting `path` surface.

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

Use `/permission show` to display the effective policy summary, `/permission path` to show the global config path, or `/permission help` for usage.

## Develop

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm format
```
