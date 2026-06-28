# permission

Permission enforcement extension for the [Pi coding agent](https://pi.mariozechner.at/).

## Install

Consume this package from your git repo via `pi install`:

```bash
pi install git:git@github.com:casonadams/permission.git
```

Then add it to `~/.pi/agent/settings.json`:

```json
"packages": [
  "git:git@github.com:casonadams/permission.git"
]
```

Restart Pi and the extension loads automatically.

## How it works

The extension intercepts every tool call and bash command and decides one of three things:

| State   | Behavior                                     |
| ------- | -------------------------------------------- |
| `allow` | Permits the action silently                  |
| `deny`  | Blocks the action with a reason message      |
| `ask`   | Prompts you (via Pi's UI) to approve or deny |

When the prompt asks, you can approve once or approve a pattern for the rest of the session (e.g. `git *`).

The picker's "for this session" option is offered for `bash` and `mcp` surfaces, where session-scoped patterns are useful.
Other surfaces get a simpler Allow / Deny choice.
Subagent children with no UI forward their asks to the parent's UI via file-based forwarding.

## Configuration

Config is flat-format JSON, scoped globally or per-project.
Project overrides global.

**Global**: `<agent-dir>/permission.json` (e.g. `~/.pi/agent/permission.json`)

**Project**: `<cwd>/.pi/agent/permission.json`

A full starting template lives at [`permission.example.json`](./permission.example.json) — copy it to one of the paths above.
Quick preview:

```json
{
  "permission": {
    "*": "allow",
    "path": {
      "*": "allow",
      "*.env": "deny",
      "~/.ssh/*": "deny"
    },
    "bash": {
      "*": "ask",
      "git status": "allow",
      "rm -rf *": "deny"
    },
    "external_directory": "ask"
  }
}
```

Last matching pattern wins, so put broad catch-alls first and specific overrides after them.
The `path` surface is cross-cutting (applies to all file-access tools and bash paths) and can't be overridden by a per-tool allow — use it for sensitive files.

## Development

```bash
pnpm install
pnpm test       # run tests
pnpm typecheck  # type-check (tsc --noEmit)
pnpm lint       # biome + eslint
pnpm format     # biome format --write .
```