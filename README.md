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
highest precedence (later files override earlier ones):

1. `~/.pi/agent/permission.json`
2. `<project>/.pi/agent/permission.json`

Start with [`permission.example.json`](./permission.example.json), or use this
minimal policy:

```json
{
  "$schema": "https://raw.githubusercontent.com/casonadams/permission/main/schemas/permissions.schema.json",
  "permission": {
    "*": "ask",
    "path": {
      "/tmp/*": "allow",
      "*.env*": { "action": "deny", "reason": "secrets" },
      "~/.ssh/*": { "action": "deny", "reason": "secrets" }
    },
    "bash": {
      "*": "ask",
      "rm -rf *": { "action": "deny", "reason": "destructive" }
    }
  }
}
```

The `$schema` field is optional and is used only for editor completion.

Restart Pi after installing or updating the package. Policy files are reloaded
at the start of each Pi session.

## Rules

Pi's built-in tool surfaces are `read`, `write`, `edit`, `bash`, `grep`,
`find`, and `ls`. `path`, `mcp`, and `skill` are permission surfaces rather
than built-in tools.

Standard coding and workflow tools (`read`, `write`, `edit`, `ls`, `grep`,
`find`, `skill`, `todo`, `ask_user_question`, `Agent`, `subagent`) are allowed
by default: file safety is enforced through the cross-cutting `path` surface
(which confines actions to the workspace and guards secrets). Explicit rules in
`permission.json` override these defaults.

Each key under `permission` is a surface:

| Surface                                       | Patterns match                                         |
| --------------------------------------------- | ------------------------------------------------------ |
| `*`                                           | Fallback for surfaces without a rule                   |
| `read`, `write`, `edit`, `ls`, `grep`, `find` | Tool path                                              |
| `bash`                                        | Full command (compound commands: each subcommand)      |
| `mcp`                                         | MCP server or `server:tool` target                     |
| `skill`                                       | Skill name                                             |
| `path`                                        | Every detected file path, including bash and MCP paths |

- `allow` permits the action silently.
- `deny` blocks it, optionally returning a configured reason.
- `ask` opens an approval prompt with Allow, Edit / View, Always allow, and Deny with reason.
  Dismissing the prompt counts as deny. With no interactive UI, every `ask` blocks.
- A string is shorthand for a catch-all. For example, `"read": "allow"` means
  `"read": { "*": "allow" }`.
- Last matching pattern wins. Put broad rules before specific exceptions.
- A call touches several decisions (its tool surface plus the `path` surface).
  The most restrictive wins: deny beats ask, ask beats allow. A `path` deny
  cannot be overridden by a tool rule.
- A path with no matching `path` rule defaults to `allow` inside the working
  directory and `ask` outside it. Add rules such as `"/tmp/*": "allow"` for
  trusted external directories.
- Reads of Pi's own support directories (`~/.pi/agent`, installed extension
  files, `<project>/.pi/npm`, `<project>/.pi/git`) are permitted without a
  prompt; writes still follow policy.

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

Patterns are matched against normalized absolute paths. `~` and `$HOME` are
expanded. Put specific exceptions after broad rules because the last matching
pattern wins:

```json
"path": {
  "~/.pi/agent/*": "allow",
  "~/.pi/agent/auth.json": { "action": "deny", "reason": "credentials" },
  "~/.pi/agent/mcp.json": { "action": "deny", "reason": "credentials" }
}
```

### Bash rules

Bash patterns match the full subcommand, not just the executable. Compound
commands (`git add -A && git commit`) are matched one subcommand at a time,
and every subcommand must be allowed. Environment assignments, wrappers
(`time`, `nice`, `nohup`, `timeout`, `xargs`, ...), and redirect targets are
recognized: assignments and redirects are checked against `path`, wrappers
are skipped before matching.

Fail-closed by design: commands containing command substitution (`$(...)`,
backticks), process substitution, parentheses, unbalanced quotes, or dangling
operators always prompt, and a matching `deny` rule still applies to the raw
command text.

Common read-only inspection commands are allowed by default so they do not need
to be manually listed in `permission.json`:
- Git read inspection (`git status`, `git diff`, `git log`, `git show`, `git rev-parse`, ...)
- File listing & navigation (`pwd`, `ls`, `dir`, `tree`, `stat`, `file`, `cd`)
- Search tools (`grep`, `rg`, `ag`, `fd`, `which`, `whereis`, `type`, `tokei`)
- File viewing & filters (`cat`, `head`, `tail`, `wc`, `nl`, `sort`, `uniq`, `cut`, `jq`, `awk`)
- System info & queries (`uname`, `whoami`, `date`, `--version`, `--help`)

Any specific rule in `permission.json` overrides these defaults. Even for
default-allowed commands, the `path` surface still checks every referenced file
against path rules and workspace boundaries.

### Edit / View and Always allow

- Choosing **Edit / View** opens an interactive editor with cursor navigation and
  scrolling to review the full command or modify arguments before execution.
- Choosing **Always allow** opens an editor to generalize the rule pattern and
  saves it to `permission.json`.

## MCP

MCP patterns match either a whole server or a specific tool:

```json
"mcp": {
  "*": "ask",
  "playwright": "allow",
  "playwright:browser_evaluate": { "action": "deny", "reason": "arbitrary page JavaScript" }
}
```

`playwright` allows every tool on that server; `playwright:browser_navigate`
targets one tool.

## Develop

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```