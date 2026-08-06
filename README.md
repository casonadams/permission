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

The "for this session" option is offered for `bash` and `mcp`, where pattern approvals are useful; other surfaces get a plain Allow / Deny.
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
    "*": "ask",
    "read": "allow",
    "write": { "*": "ask", "src/*": "allow" },
    "path": { "*": "allow", "*.env": "deny", "~/.ssh/*": "deny" },
    "bash": { "*": "ask", "git status": "allow", "rm -rf *": { "action": "deny", "reason": "destructive" } },
    "external_directory": "ask"
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
| `path`                                        | Every file path *any* tool touches, including bash arguments |
| `external_directory`                          | Paths outside the working directory                          |
| Any other tool name                           | That tool, e.g. `"websearch": "allow"`                       |

Four rules cover the rest:

1. A string is shorthand for a catch-all: `"read": "allow"` means `"read": { "*": "allow" }`.
2. **Last matching pattern wins**, so put broad patterns first and specific overrides after them.
3. Use `{ "action": "deny", "reason": "..." }` to tell the agent *why* something is blocked.
4. `path` is cross-cutting and a `path` deny cannot be re-allowed by a per-tool rule — use it for secrets.

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

Calls that are not a tool invocation fall back to a fixed target name, so you can allow the cheap read-only ones:

| Call                     | Target         |
| ------------------------ | -------------- |
| Server/tool status       | `mcp_status`   |
| Listing a server's tools | `mcp_list`     |
| Searching for tools      | `mcp_search`   |
| Describing a tool        | `mcp_describe` |
| Connecting to a server   | `mcp_connect`  |

A `server:tool` pattern such as `playwright:*` also works, but only for callers that pass the server as a separate
argument, and a surface catch-all like `"*": "ask"` shadows it. The underscore form matches both call styles, so prefer it.

### Runtime options

These sit next to `"permission"` at the top level, and `/permission-system` toggles the first three from inside Pi:

| Option                      | Default | Effect                                                                 |
| --------------------------- | ------- | ---------------------------------------------------------------------- |
| `debugLog`                  | `false` | Write diagnostics to the extension's `logs/` directory                 |
| `permissionReviewLog`       | `true`  | Write an audit trail of requests and decisions                         |
| `yoloMode`                  | `false` | Auto-approve every `ask`, including forwarded subagent prompts         |
| `toolInputPreviewMaxLength` | `200`   | Truncation length for the tool-input preview in prompts                |
| `toolTextSummaryMaxLength`  | `80`    | Truncation length for inline pattern/path summaries in prompts         |
| `piInfrastructureReadPaths` | `[]`    | Extra directories to auto-allow for reads, bypassing the boundary gate |

Both logs are JSONL under `~/.pi/agent/extensions/pi-permission-system/logs/`, named `pi-permission-system-debug.jsonl` and `pi-permission-system-permission-review.jsonl`.
`pi-permission-system` is the extension's internal id: it names that directory, prefixes every denial message, and is why the command is `/permission-system`.

## Development

```bash
pnpm install
pnpm test       # run tests
pnpm typecheck  # type-check (tsc --noEmit)
pnpm lint       # biome + eslint
pnpm format     # biome format --write .
```
