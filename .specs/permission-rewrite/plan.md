# Plan: Radical rewrite of the permission engine

Replace the 9,544-LOC permission extension with a ~800-LOC engine that keeps the
existing policy JSON format, the documented user-facing behavior, and the
fail-closed security posture — while dropping every optional subsystem
(forwarding, custom TUI, prompt sanitizers, RPC service, tree-sitter AST, MCP
target variants, per-agent frontmatter, skill-read gates).

## Research

Summarized from the 2026-09-01 research session:

- **Current system**: 95 source files / 9,544 LOC + 18,294 test LOC. Core
  decision kernel ~1,700 LOC; bash AST machinery ~800 LOC (tree-sitter);
  forwarding RPC-over-filesystem 1,244 LOC; custom TUI picker 619 LOC; preview
  formatting ~550 LOC; prompt sanitizers 570 LOC; RPC service 599 LOC. ~75% is
  optional machinery.
- **Claude Code** (production reference design): literal wildcard rules, split
  on shell operators (`&& || ; | &`, newlines), fixed wrapper-strip list,
  redirect targets checked as file writes, unparseable commands always prompt.
  No AST.
- **Crandel/pi-permissions** (~1.2k LOC): simplest existing pi package, but
  fail-open (no rule match = allow) and no compound-command awareness — weaker
  than the current system.
- **pi extension API**: `pi.on("tool_call")` (blockable), `ctx.ui.select`,
  `ctx.hasUI`, `ctx.cwd` cover everything the adapter needs. The docs' example
  permission gate is ~15 lines.
- Current fail-closed behavior verified in source: AST walk descends into
  `$(...)`/`<(...)`, folds to most-restrictive, `ask` + no UI = block, paths
  outside cwd with no rule = ask.

## Reuse

- **vitest / biome / eslint / tsc** — existing quality gates, unchanged.
- **pi built-ins**: `pi.on("tool_call")`, `pi.on("input")`,
  `pi.on("session_start")`, `ctx.ui.select/notify`, `ctx.hasUI`, `ctx.cwd`,
  `CONFIG_DIR_NAME`. Replaces the custom TUI picker, prompt dispatcher, and
  gate-prompter registry wholesale.
- **Policy JSON format + `schemas/permissions.schema.json`** — kept as the
  config contract (minor doc updates only).
- **Existing behavioral test scenarios** — ported as decision-table cases.
- **No new dependencies.** `tree-sitter-bash` and `web-tree-sitter` are removed;
  the rewrite has zero runtime dependencies.

## Invariants and security boundaries

These must remain true after the rewrite (verified by tests):

1. **Fail-closed defaults**: a path outside the working directory with no
   matching `path` rule resolves to `ask`; an `ask` decision with no UI
   (`ctx.hasUI === false`) blocks; unknown bash constructs (command
   substitution, process substitution, backticks, unbalanced quoting) never
   produce `allow` — they force at least `ask`.
2. **Most-restrictive-wins across all applicable checks** (tool surface, every
   bash subcommand, every path candidate). A `path` deny cannot be overridden
   by a tool allow.
3. **Per-command matching**: `git status && rm -rf /` is evaluated as two
   subcommands; the compound is allowed only if every subcommand allows.
4. **Precedence order is deny > ask > allow** within a surface; **last matching
   pattern wins** within a pattern map; scope merge order global < project.
5. **Policy format compatibility**: existing `permission.json` files (surfaces,
   string shorthand, pattern maps, `{action, reason}`, `~/` expansion, `*`/`?`
   wildcards, trailing-` *` optional match) load and behave identically for all
   features that survive the rewrite.
6. **Layering**: `policy.ts` / `match.ts` / `bash.ts` / `tool-paths.ts` are pure
   domain modules with zero pi imports (unit-testable without a harness); the
   pi coupling lives only in `index.ts` + `prompt.ts` (thin adapters).

## Quality gates

Existing commands, unchanged: `pnpm lint` (biome + eslint), `pnpm typecheck`
(tsc --noEmit), `pnpm test` (vitest). New code keeps functions small (complexity
<= 5), takes <= 3 positional parameters, uses no suppressions, and adds no
dependencies. Every behavior change ships with a colocated focused test.

## Definition of done

- `pnpm lint && pnpm typecheck && pnpm test` all pass.
- Old modules (`gates/`, `forwarding/`, `ui/`, `prompting/`, `integrations/`,
  `policy/`, `app/`, `paths/`, `config/`, `shared/`, `service.ts`) are deleted;
  `extensions/permission/` contains only the new engine + tests.
- `package.json` has no runtime dependencies; `web-tree-sitter` /
  `tree-sitter-bash` removed from the lockfile.
- README documents the trimmed feature set and breaking changes; example
  policy and JSON schema still validate against shipped behavior.
- Manual smoke test in `pi -e ./extensions` demonstrates: allow passes silently,
  deny blocks with reason, ask prompts with Allow/Allow-for-session/Deny,
  compound-command smuggling is caught, `.env` write is denied by path rule.

## Assumptions

- Rewrite happens in place on a feature branch; git history preserves v1.
- Session rules are in-memory only (cleared on session start) — matches current
  behavior.
- Config files keep supporting JSONC-style comments via a minimal string-aware
  stripper (existing configs with comments keep working).
- Reads under pi's own config dir (`~/.pi/agent/...`, skills) stay auto-allowed
  so skill loading does not start prompting (small replacement for the deleted
  `path-infrastructure` module).
- The `skill` surface survives as a tiny `input`-event check (exact skill-name
  matching) since skill invocation is user-input-driven, not tool-driven.
- npm publishing/versioning: next major version; breaking changes listed in
  README.

## Risks (with mitigation)

- **Bash heuristic gaps vs tree-sitter** (e.g. quoted paths with spaces,
  exotic redirection forms): mitigated by fail-closed defaults (unparseable /
  suspicious = ask) and the `"*": "ask"` recommended baseline; worst case is an
  extra prompt, not a silent allow.
- **Config compat regressions** (mcp variants, frontmatter, skill-read gate):
  documented as breaking changes in README; loader still accepts the keys
  without erroring so unrelated rules keep working.
- **pi API drift** (`tool_call` payload shapes, `ctx.ui.select`): adapter is
  one thin file; peer dependency pin `>=0.79.0` unchanged; smoke test in Slice 4
  gates the swap.
- **Path false positives** from token heuristics (e.g. a URL-like token read as
  a path): classifier rejects flags/URLs/scoped packages; only outside-cwd
  candidates escalate to ask, so in-repo work is unaffected.

## Dependencies

None added. Two removed (`web-tree-sitter`, `tree-sitter-bash`) — both were
runtime WASM deps used only by the deleted AST module.

## Decisions

- **Engine model: Claude Code-style separator splitting + fail-closed** (chosen
  over keeping tree-sitter). Options considered: keep AST (Option B, ~3,200 LOC
  end state) vs heuristic split (~800 LOC). Chose simplicity + zero deps; the
  fail-closed posture preserves security; AST can be reintroduced later behind
  the same `bash.ts` interface if real gaps appear.
- **Drop forwarding** (1,244 LOC): served 3 third-party subagent extensions via
  filesystem polling. Subagent/headless sessions now get policy decisions only;
  `ask` blocks without UI. Fail-closed, dramatically simpler.
- **Drop tool hiding / prompt sanitizers**: denied tools remain visible; the
  LLM gets the deny reason on attempt.
- **Drop per-agent frontmatter config layer** (user decision): two scopes only.
- **MCP surface = `server` and `server:tool` patterns** (user decision),
  replacing the 169-LOC variant generator.
- **Session approval granularity**: bash = exact subcommand; paths = parent-dir
  glob; other tools = exact tool name. In-memory only.

## Out of scope

- Subagent prompt forwarding (any mechanism), RPC service for other extensions,
  custom TUI components, system-prompt rewriting, skill-file read gating,
  `/permission` config modal, legacy `pi-permissions.jsonc` migration, win32
  case-insensitive matching, per-agent frontmatter policies.

---

## Slices

### Slice 1: Policy core (pure domain)

**Goal:** Load, merge, and evaluate policy — the decision kernel with no pi or
bash knowledge.

**Acceptance criteria:**
- `loadPolicy(paths)` reads global + project JSON (with comments), merges
  per-surface/per-pattern (project wins), normalizes string shorthand to
  `{ "*": state }`, collects config issues instead of throwing.
- `decideSurface(policy, surface, value)` returns `allow | deny(reason) | ask`
  using last-match-wins and deny > ask > allow.
- Unmatched values fall back to the surface map's `"*"` key, then the `"*"`
  surface, then `ask`.
- `~/` and `$HOME/` in patterns expand at match time; `*` and `?` wildcards;
  trailing `" *"` also matches the bare prefix.

#### Task 1.1: Port wildcard matcher and rule evaluation [3]
**Do:** New `extensions/permission/match.ts`: compile patterns to anchored
regex (`*` -> `.*`, `?` -> `.`, optional trailing space-star), `findLast`
semantics, most-restrictive fold. Port semantics from old
`policy/wildcard-matcher.ts` + `policy/rule.ts`.
**Tests:** `match.test.ts` — wildcard table (exact, `*` mid/end, `?`, `~/`
expansion), last-match-wins, shorthand, `{action, reason}` values, fallback
chain, most-restrictive fold.
**Verify:** `pnpm vitest run extensions/permission/match.test.ts` — all pass.

#### Task 1.2: Policy loading and merging [3]
**Do:** New `extensions/permission/policy.ts`: JSON parse + comment stripping,
two-scope merge (global then project), normalization with issue collection.
**Tests:** `policy.test.ts` — merge precedence per pattern, shorthand before
merge, comment stripping inside/outside strings, malformed file = issue not
throw, missing files ignored.
**Verify:** `pnpm vitest run extensions/permission/policy.test.ts` — all pass.

### Slice 2: Bash command analysis (pure domain)

**Goal:** Decompose a bash command into checkable units without tree-sitter.

**Acceptance criteria:**
- Split on `&&`, `||`, `;`, `|`, `&`, newlines (respecting quotes); each unit
  is checked independently.
- Leading wrappers stripped: `timeout`, `time`, `nice`, `nohup`, `stdbuf`,
  `command`, `builtin`, bare `xargs`; leading `VAR=value` assignments stripped
  for matching but their values retained as path candidates.
- `$(`, backtick, `<(`, or unbalanced quotes force the whole command to
  `ask` (never `allow`); deny rules still match the raw text.
- Redirect targets (`>`, `>>`, `2>`, `&>`) and `cd` arguments are emitted as
  path candidates.

#### Task 2.1: Command splitter + wrapper stripper [3]
**Do:** New `extensions/permission/bash.ts`: quote-aware operator splitting and
wrapper/env-assignment stripping.
**Tests:** `bash.test.ts` — table of commands -> expected units (compound,
pipes, newlines, quoted separators like `echo "a; b"`, wrappers, assignments,
dangling `&&` -> suspicious).
**Verify:** `pnpm vitest run extensions/permission/bash.test.ts` — all pass.

#### Task 2.2: Suspicion detection + path candidate extraction [3]
**Do:** Extend `bash.ts`: suspicious-construct detection; redirect/cd/argument
path candidates with a token classifier (reject flags, URLs, scoped npm
packages, regex metacharacters; accept `~/`, absolute, `./`, `..`, `a/b`).
**Tests:** suspicious cases force-ask; `sed -i 's/a/b/' file.txt` keeps
`file.txt`; `cd /etc && cat passwd` yields `/etc` candidate; `ls > out.txt`
yields `out.txt`; `FOO=$(evil) cmd` forces ask.
**Verify:** `pnpm vitest run extensions/permission/bash.test.ts` — all pass.

### Slice 3: Decision integration (pure domain)

**Goal:** One function: (policy, tool call) -> decision, composing all checks.

**Acceptance criteria:**
- `decide(policy, { toolName, input, cwd })` returns the most-restrictive of:
  tool-surface check, per-subcommand bash checks, per-candidate path checks.
- Path candidates from built-in tool inputs (`path` and similar keys) and MCP
  (`server`, `server:tool` for the mcp surface); paths outside cwd with no rule
  -> ask; reads under pi's config dir auto-allowed.
- `deny` carries its configured reason; unknown surfaces only consult the `*`
  fallback.

#### Task 3.1: Path candidate extraction from tool inputs [2]
**Do:** New `extensions/permission/tool-paths.ts`: extract path values from
known input keys, resolve against cwd, expand `~`; pi-config-dir allowance.
**Tests:** builtin tools, MCP server/tool derivation, outside-cwd detection,
infrastructure allowance.
**Verify:** `pnpm vitest run extensions/permission/tool-paths.test.ts`.

#### Task 3.2: Decision composition [3]
**Do:** New `extensions/permission/decide.ts`: run all applicable checks through
`decideSurface`, fold most-restrictive, attach prompt preview (tool name +
input summary).
**Tests:** `decide.test.ts` — ported scenarios from the old suite: compound
smuggling, `path` deny overrides tool allow, `.env` protection across tools,
session-rule application, unmatched-tool fallback to ask.
**Verify:** `pnpm vitest run extensions/permission/decide.test.ts`.

### Slice 4: pi adapter (thin adapters)

**Goal:** Wire the engine into pi; delete the old entry.

**Acceptance criteria:**
- `session_start`: load policy, clear session rules, notify config issues once.
- `tool_call`: `decide` -> allow: return undefined; deny: `{ block: true,
  reason }`; ask: `ctx.ui.select` (Allow / Allow for session / Deny) or block
  when `!ctx.hasUI`.
- "Allow for session" appends the granularity rule from Decisions; cleared on
  session start.
- `input`: `/skill:<name>` checked against the `skill` surface.
- No other pi hooks are registered.

#### Task 4.1: New index.ts adapter + prompt/session rules [3]
**Do:** Rewrite `extensions/permission/index.ts` (~90 LOC) + `prompt.ts`
(~90 LOC: ui.select prompt, session-rule recording). Keep
`package.json` `exports`/`pi` manifest pointing at the new entry.
**Tests:** `index.test.ts` with a fake `ExtensionAPI` — allow/deny/ask/session
flows, no-UI block, session-rule persistence within a session.
**Verify:** `pnpm vitest run extensions/permission/index.test.ts`.

#### Task 4.2: Manual smoke test in pi [2]
**Do:** Run `pi -e ./extensions` with the example policy; exercise allow, deny,
ask, session-allow, compound smuggling, `.env` path deny.
**Verify:** Transcript shows each behavior; no crashes; `/reload` picks up
policy edits.

### Slice 5: Cleanup, docs, release

**Goal:** Delete the old implementation; align docs and packaging.

**Acceptance criteria:**
- All old modules deleted; no references remain; lockfile has no WASM deps.
- README documents the simplified engine, removed features (breaking changes),
  and kept policy format; schema `$id` doc updated (mcp/skill wording).
- Full gate green.

#### Task 5.1: Delete old modules and dependencies [2]
**Do:** Remove `gates/ forwarding/ ui/ prompting/ integrations/ policy/ app/
paths/ config/ shared/ service.ts` and old test helpers; drop runtime deps from
`package.json`; regenerate lockfile.
**Verify:** `pnpm install && pnpm typecheck && pnpm test` — clean.

#### Task 5.2: README + schema + example config [2]
**Do:** Rewrite README for the trimmed feature set with a breaking-changes
section; update schema descriptions (mcp values, skill surface note); keep
`permission.example.json` as-is if still valid.
**Verify:** `pnpm lint && pnpm typecheck && pnpm test`; README renders; example
loads in a smoke session.

## Release safety

- Feature branch; ship as the next major version; README breaking-changes
  section lists: forwarding removal, tool-hiding removal, frontmatter policies
  removed, mcp pattern simplification, skill-read gate removed.
- Rollback: previous npm version remains installable; git tag the last v1
  commit before merge.
- Observability: decision logging via a single `ctx.ui.notify` on config issues;
  no events emitted (RPC observability dropped intentionally).

## Final verification

```
pnpm lint          # biome + eslint clean
pnpm typecheck     # tsc --noEmit clean
pnpm test          # vitest: all new tests pass
pnpm install       # lockfile has no web-tree-sitter / tree-sitter-bash
```

Plus the Slice 4.2 manual smoke checklist in a live pi session.