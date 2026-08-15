# permission

Permission enforcement extension for the [Pi coding agent](https://pi.mariozechner.at/).

## Install

Either run `pi install`, which clones the package and adds it to `~/.pi/agent/settings.json` for you:

```bash
pi install git:github.com/casonadams/permission
```

Or add the same entry to `~/.pi/agent/settings.json` by hand:

```json
"packages": [
  "git:github.com/casonadams/permission"
]
```

Either way, restart Pi and the extension loads automatically.
Both forms clone over HTTPS; use `git:git@github.com:casonadams/permission.git` to clone over SSH instead.
Add `-l` to `pi install` to write to project settings (`.pi/settings.json`) so a team shares the same policy.

## How it works

The extension intercepts every tool call and bash command and decides one of three things:

| State   | Behavior                                     |
| ------- | -------------------------------------------- |
| `allow` | Permits the action silently                  |
| `deny`  | Blocks the action with a reason message      |
| `ask`   | Prompts you (via Pi's UI) to approve or deny |

When the prompt asks, you can approve once or approve a pattern for the rest of the session (e.g. `git *`).

The "for this session" option is offered for any surface where pattern approvals are useful; other surfaces get a plain Allow / Deny.
Subagents with no UI of their own forward their asks to the parent session's UI.

## Configuration

Config is JSON, loaded from two optional files. Project settings override global ones, and per-agent frontmatter overrides both.

- **Global**: `~/.pi/agent/permission.json`
- **Project**: `<cwd>/.pi/agent/permission.json`

Copy [`permission.example.json`](./permission.example.json) to either path to get started.
The `$schema` key is optional and only drives editor autocomplete; the extension ignores it.

```json
{
  "$schema": "https://raw.githubusercontent.com/casonadams/permission/main/schemas/permissions.schema.json",
  "permission": {
    "*": "allow",
    "path": {
      "*": "allow",
      "*.env": { "action": "deny", "reason": "secrets" },
      "~/.ssh/*": { "action": "deny", "reason": "secrets" }
    },
    "bash": {
      "*": "ask",
      "git status": "allow",
      "git diff": "allow",
      "rm -rf *": { "action": "deny", "reason": "destructive" }
    }
  }
}
```

### Surfaces

Every key under `"permission"` is a surface. What a pattern is matched against depends on which one:

| Surface                                       | Patterns match against                                       |
| --------------------------------------------- | ------------------------------------------------------------ |
| `"*"`                                         | Nothing — the fallback for any surface you did not list      |
| `read`, `write`, `edit`, `ls`, `grep`, `find` | The file path in the tool's `path` argument                  |
| `bash`                                        | The full command string                                      |
| `mcp`                                         | The MCP target name (see below)                              |
| `skill`                                       | The skill name                                               |
| `path`                                        | Every file path any tool touches, including bash arguments. Paths outside cwd default to `ask`. |

Four rules cover the rest:

1. A string is shorthand for a catch-all: `"read": "allow"` means `"read": { "*": "allow" }`.
2. **Last matching pattern wins**, so put broad patterns first and specific overrides after them.
3. Use `{ "action": "deny", "reason": "..." }` to tell the agent *why* something is blocked.
4. `path` is cross-cutting and a `path` deny cannot be re-allowed by a per-tool rule — use it for secrets. To allow specific external directories, add a `path` allow rule (e.g. `"path": { "/tmp/*": "allow" }`).

### MCP tools

MCP calls are matched on the tool name as the agent sees it, which is the server and tool joined by an underscore.
For a `playwright` server that is `playwright_browser_click`, `playwright_browser_navigate`, and so on, so `playwright_*` covers the whole server:

```json
"mcp": {
  "*": "ask",
  "playwright_browser_snapshot": "allow",
  "playwright_browser_navigate*": "allow",
  "playwright_browser_click": "allow",
  "playwright_browser_type": "allow",
  "playwright_browser_evaluate": { "action": "deny", "reason": "arbitrary JS in the page" },
  "playwright_browser_run_code_unsafe": { "action": "deny", "reason": "arbitrary code execution" },
  "mcp_status": "allow"
}
```

A `server:tool` pattern such as `playwright:*` also works. The underscore form matches both call styles, so prefer it.

### Audit log

Permission requests and decisions are written as JSONL to `~/.pi/agent/extensions/pi-permission-system/logs/pi-permission-system-permission-review.jsonl`. The directory and file name are fixed by the extension id; use this log to audit who allowed what.

## Development

```bash
pnpm install
pnpm test       # run tests
pnpm typecheck  # type-check (tsc --noEmit)
pnpm lint       # biome + eslint
pnpm format     # biome format --write .
```

### Architecture

`extensions/permission/index.ts` is the Pi entry point, and `extensions/permission/service.ts` is the stable API for other extensions. The remaining code is organized by feature:

- `config/` loads, validates, merges, stores, and displays configuration.
- `policy/` contains framework-independent permission rules and evaluation.
- `gates/` turns tool, skill, path, and bash inputs into policy decisions.
- `prompting/` resolves interactive permission requests.
- `forwarding/` relays requests between parent and subagent sessions.
- `integrations/` adapts the domain to Pi events, registries, logging, and lifecycle APIs.
- `ui/` renders terminal interfaces without defining permission policy.

Tests are co-located with their source modules. Cross-module integration tests belong at the nearest shared feature boundary. Pi and infrastructure adapters depend toward the policy domain; the policy primitives do not depend on Pi or the TUI.