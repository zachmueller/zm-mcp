# Git MCP Server — Design Plan

## Overview

A TypeScript/Node.js MCP server that wraps standard git operations, with a focus on producing commits that follow the project's established commit message format. The server runs as a local stdio process and is designed to be registered in both Notor and Claude Code as an MCP server.

**Primary motivation:** Enable AI agents (Notor workflows, Claude Code) to commit changes to one or more git repositories using a consistent, structured commit message format — without needing to shell out to raw git commands or reimplement the commit message structure in every context.

---

## CLI Design

```
node dist/git/index.js [--repo <name>=<path>]... [--name <prefix>]
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--repo name=path` | No (repeatable) | Maps a logical repo name to an absolute filesystem path. Can be specified multiple times for multi-repo support. |
| `--name prefix` | No | The prefix used in commit messages, e.g. `Notor` → `[Notor]`. Defaults to `AI` if not provided. |

### Repo Resolution

- If one or more `--repo` args are given, tool calls must include a `repo` argument matching one of the registered names.
- If no `--repo` args are given, the server defaults to the current working directory as the single implicit repo. In this mode, the `repo` argument is not required on tool calls.
- Unrecognized `repo` values return a clear error rather than silently failing.

### Example Registrations

**Notor (multi-repo, explicit names):**
```
node /path/to/zm-mcp/dist/git/index.js \
  --repo notor=/Users/zach/vault/notor \
  --repo zm-mcp=/Volumes/workplace/zm-mcp \
  --name Notor
```

**Claude Code (cwd default):**
```
node /path/to/zm-mcp/dist/git/index.js --name Claude
```

---

## Tool Catalog

### Read Tools

#### `status`
Returns the working tree status of a repository.

**Input:**
```typescript
{
  repo?: string   // omit when server has no named repos (uses cwd)
}
```

**Output:** Formatted git status output (porcelain + human-readable summary).

---

#### `diff`
Returns a git diff for a repository.

**Input:**
```typescript
{
  repo?: string,
  staged: boolean,      // true = diff --staged, false = diff working tree
  paths?: string[]      // optional: limit diff to specific files/directories
}
```

**Output:** Raw unified diff text, or a message indicating no changes.

---

#### `log`
Returns recent commit history.

**Input:**
```typescript
{
  repo?: string,
  limit?: number,       // default: 10
  branch?: string       // default: current branch
}
```

**Output:** Formatted list of commits with hash, author, date, and subject line.

---

#### `list_branches`
Lists branches in a repository.

**Input:**
```typescript
{
  repo?: string,
  include_remote?: boolean   // default: false
}
```

**Output:** List of branch names, with the current branch indicated.

---

### Write Tools

#### `commit`
Stages specified files and creates a commit following the project's standard message format.

**Input:**
```typescript
{
  repo?: string,
  files: string[],          // paths to stage, relative to repo root; supports globs
  summary: string,          // one-line action summary (e.g., "Add user auth flow")
  change_details: string[], // bullet-point list of specific changes
  workflow?: string,        // name of the workflow/rule that guided this commit (e.g., "version-bump.md")
  human_input: string       // the user message or prompt that triggered this commit
}
```

**Output:** Commit hash + commit message on success; error details on failure.

**Behavior:**
- Stages only the files listed in `files` (never a blanket `git add .`)
- Errors if any listed file path does not exist or fails to stage
- Constructs the commit message using the format described below
- Does not push; push is a separate future operation

---

#### `create_branch`
Creates a new branch.

**Input:**
```typescript
{
  repo?: string,
  branch_name: string,
  from_ref?: string     // default: current HEAD
}
```

**Output:** Confirmation with new branch name and the ref it was created from.

---

#### `switch_branch`
Checks out an existing branch.

**Input:**
```typescript
{
  repo?: string,
  branch_name: string
}
```

**Output:** Confirmation of the active branch after switch; error if branch does not exist or working tree has uncommitted changes.

---

## Commit Message Format

All commits produced by the `commit` tool follow this format, mirroring the structure in `.claude/rules/git.md`:

```
[{prefix}] {summary}

- {change_details[0]}
- {change_details[1]}
- ...

---

Workflow: {workflow}
{human_input}
```

**Rules:**
- `{prefix}` comes from the `--name` CLI arg (e.g., `[Notor]`, `[Claude]`)
- The `Workflow:` line and its value are omitted entirely if `workflow` is not provided
- `{human_input}` is always included after the `---` separator
- Change detail bullets use a single `-` prefix with one space
- A blank line separates the summary from the bullets, and the bullets from the `---`

**Example:**
```
[Notor] Add: daily note template for project tracking

- Added daily_note.md template to vault/templates/
- Updated template index to include new entry
- Resolves missing structure for project standup notes

---

Workflow: create-template.md
Create a daily note template that includes a project tracking section and links to open tasks
```

---

## Multi-Repo Behavior

- The server maintains a map of `name → absolute path` built at startup from `--repo` args
- Each tool call resolves the target repo at request time — there is no per-connection state
- Concurrent tool calls targeting different repos are safe (no shared mutable state between repo operations)
- The `repo` field in tool inputs is validated against the registered map; unrecognized values return a descriptive error
- When no repos are registered, `repo` is ignored and all operations target cwd

---

## Error Handling

Tool calls should return structured error text (not throw) in these cases:

| Scenario | Behavior |
|----------|----------|
| Unknown `repo` value | Error: list valid repo names |
| Path not a git repo | Error: explain the path is not a git repository |
| File not found during stage | Error: list which paths failed, abort commit |
| Nothing to commit | Success-like response: "nothing to commit, working tree clean" |
| Git command fails (non-zero exit) | Error: include stderr output verbatim |
| Branch already exists (`create_branch`) | Error: branch name + suggestion to switch instead |
| Dirty working tree (`switch_branch`) | Error: list uncommitted changes, suggest committing first |

---

## Project File Layout

```
zm-mcp/
├── specs/
│   └── git/
│       └── plan.md          ← this file
├── src/
│   └── git/
│       ├── index.ts         ← MCP server entry point (parses CLI args, registers tools, starts stdio server)
│       ├── repo-registry.ts ← Parses --repo args, resolves repo paths, validates git repos
│       ├── tools/
│       │   ├── commit.ts
│       │   ├── status.ts
│       │   ├── diff.ts
│       │   ├── log.ts
│       │   ├── list-branches.ts
│       │   ├── create-branch.ts
│       │   └── switch-branch.ts
│       └── git-runner.ts    ← Thin wrapper around child_process to run git commands
├── package.json
└── tsconfig.json
```

---

## V2 Roadmap

### LLM-Generated Commit Summaries

In V1, the calling LLM (Notor/Claude Code) is responsible for generating `summary` and `change_details`. In V2, the `commit` tool will optionally accept conversation history and generate these fields itself via an internal LLM call.

**Proposed V2 `commit` additions:**
```typescript
{
  // ... all V1 fields, but summary and change_details become optional ...
  conversation_history?: Message[],  // LLM conversation context from caller
  // summary and change_details auto-generated if omitted
}
```

**LLM context available to the sub-agent:**
- The git diff of the staged changes
- The caller-provided conversation history

**Open question:** API key strategy. Ideally the server taps into the same LLM access as its host (Claude Code or Notor) rather than requiring a separate `ANTHROPIC_API_KEY`. This mechanism is TBD — options include:
- Standard `ANTHROPIC_API_KEY` env var (simplest, works everywhere)
- A passthrough token provided by the host at tool-call time
- Notor exposing a local HTTP endpoint the MCP server can call back into

This design decision is deferred until V1 is stable.

### Push / Pull

Remote sync operations (`push`, `pull`, `fetch`) are intentionally excluded from V1 to keep scope tight. They will be added once the core commit workflow is validated.
