# Git MCP Server

An MCP server that wraps standard git operations with structured commit messages and token-efficient output. Designed for AI agent workflows (Claude Code, Notor, etc.).

## Features

- **Structured commits** — every commit follows a consistent format with prefix, summary, change details, and provenance (workflow + prompt)
- **Token-minimized output** — tool schemas and responses are designed to minimize token cost for calling LLMs
- **Multi-repo support** — manage one or many repositories from a single server instance
- **Concurrent-safe** — per-repo promise-based locking prevents index corruption from parallel tool calls

## Tools

### Read

| Tool | Description |
|------|-------------|
| `status` | Porcelain-format git status |
| `diff` | Unified diff (staged or working tree) |
| `log` | Recent commit history (hash + subject, default 10) |
| `list_branches` | List branches, optionally including remotes |

### Write

| Tool | Description |
|------|-------------|
| `commit` | Stage files and create a structured commit |
| `create_branch` | Create a new branch from a ref (default HEAD) |
| `switch_branch` | Check out an existing branch |

## Usage

```
node dist/git/index.js --name <prefix> [--repo <name>=<path>]...
```

### Arguments

- `--name` (required) — prefix for commit messages, e.g. `Claude` produces `[Claude] ...`
- `--repo name=path` (repeatable) — map a logical repo name to an absolute path

### Repository resolution

| Repos specified | Behavior |
|----------------|----------|
| 0 | Defaults to the current working directory |
| 1 | Uses that repo implicitly; `repo` param hidden from tool schemas |
| 2+ | `repo` becomes a required param on all tools (multi-repo mode) |

## Commit message format

```
[{prefix}] {summary}

- {change_detail_1}
- {change_detail_2}

---

Workflow: {workflow}
Prompt: {human_input}
```

- `Workflow:` line is omitted when not provided
- `Prompt:` and the `---` separator are always included

## MCP configuration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "git": {
      "command": "node",
      "args": ["dist/git/index.js", "--name", "Claude"]
    }
  }
}
```

Or for multiple repos:

```json
{
  "mcpServers": {
    "git": {
      "command": "node",
      "args": [
        "dist/git/index.js",
        "--name", "Claude",
        "--repo", "frontend=/path/to/frontend",
        "--repo", "backend=/path/to/backend"
      ]
    }
  }
}
```

## Architecture

```
src/git/
├── index.ts             # Entry point, CLI parsing, server bootstrap
├── repo-registry.ts     # Repo mapping, validation, per-repo locking
├── git-runner.ts        # Thin child_process.execFile wrapper
└── tools/
    ├── status.ts
    ├── diff.ts
    ├── log.ts
    ├── list-branches.ts
    ├── commit.ts
    ├── create-branch.ts
    └── switch-branch.ts
```

## Global CLI

After `npm link`, the server is available as:

```
zm-mcp-git --name Claude
```
