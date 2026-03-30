# Git MCP Server — Implementation Tasks

Reference: [plan.md](plan.md)

---

## Phase 1: Project Scaffolding

### 1.1 Initialize project and dependencies
- Create `package.json` with `"type": "module"` (ESM)
- Install dependencies: `@modelcontextprotocol/sdk`, `zod`
- Install dev dependencies: `typescript`, `@types/node`
- Create `tsconfig.json` targeting Node 20+, ESM output to `dist/`

### 1.2 Create directory structure
```
src/git/
├── index.ts
├── repo-registry.ts
├── git-runner.ts
└── tools/
    ├── status.ts
    ├── diff.ts
    ├── log.ts
    ├── list-branches.ts
    ├── commit.ts
    ├── create-branch.ts
    └── switch-branch.ts
```

---

## Phase 2: Core Infrastructure

### 2.1 `git-runner.ts` — Git command executor
- Thin wrapper around `child_process.execFile` that runs `git` with given args in a given cwd
- Returns `{ stdout: string, stderr: string }` on success
- On non-zero exit, returns a structured error containing stderr (does not throw)
- All calls use `execFile` (not `exec`) to avoid shell injection

### 2.2 `repo-registry.ts` — Repo resolution and validation
- Parse `--repo name=path` args into a `Map<string, string>`
- If no `--repo` args: use `process.cwd()` (captured once at import time) as the single implicit repo
- If one `--repo` arg: use it as the single implicit repo
- On startup, validate every registered path by running `git rev-parse --git-dir` in it; fail with descriptive error if any path is not a git repo
- Export a `resolveRepo(name?: string)` function that returns the absolute path, or throws a descriptive error for unknown names
- Export a `isMultiRepo()` boolean so tool registration can decide whether to include `repo` in schemas
- **Per-repo lock:** Export an `acquireLock(repoPath): Promise<() => void>` function that serializes concurrent calls to the same repo. Implementation: a map of repo path → promise chain (no external dependency needed).

### 2.3 `index.ts` — Server entry point
- Parse CLI args (`--repo`, `--name`) using manual argv parsing (no dependency needed for two flags)
- Validate `--name` is provided; exit with usage message if missing
- Initialize repo registry (triggers startup validation)
- Create `McpServer` instance, register all tools, connect `StdioServerTransport`
- Pass `--name` prefix to commit tool registration

---

## Phase 3: Read Tools

Each tool follows the same pattern: define Zod schema, register via `server.tool()`, call `git-runner`, return text content. The `repo` param is conditionally included based on `isMultiRepo()`.

### 3.1 `status` tool
- Run `git status --porcelain` in the resolved repo path
- Return raw porcelain output, or `"clean"` if empty

### 3.2 `diff` tool
- Accept `staged: boolean` and optional `paths: string[]`
- Run `git diff [--staged] [-- ...paths]`
- Return raw diff output, or `"no changes"` if empty

### 3.3 `log` tool
- Accept optional `limit` (default 10) and `branch`
- Run `git log --oneline -n {limit} [{branch}]`
- Return raw output (already token-minimal: hash + subject per line)

### 3.4 `list_branches` tool
- Accept optional `include_remote` (default false)
- Run `git branch [--all]` if include_remote, else `git branch`
- Return branch list with current branch indicated (git already marks it with `*`)

---

## Phase 4: Write Tools

### 4.1 `commit` tool
This is the most complex tool. Implementation steps:

1. **Acquire per-repo lock** before any git operations
2. **Snapshot current index state** by recording which files are currently staged (`git diff --staged --name-only`) so rollback knows what to restore
3. **Stage files:** Run `git add -- <files>` for each path in `files`
   - If any `git add` fails: run `git reset -- <all files from this call>` to rollback, then release lock and return error listing which paths failed
4. **Build commit message** from `summary`, `change_details`, `workflow`, `human_input`, and the `--name` prefix, following the format in the plan
5. **Run `git commit`** with the constructed message (pass via `-F -` on stdin to avoid shell escaping issues with `-m`)
6. **Return** the commit hash (parse from `git rev-parse HEAD` after commit)
7. **Release lock** in a `finally` block

### 4.2 `create_branch` tool
- Accept `branch_name` and optional `from_ref`
- Run `git branch {branch_name} [{from_ref}]`
- On success, return branch name and the resolved ref (`git rev-parse {from_ref || HEAD}`)
- If branch already exists, return error suggesting `switch_branch` instead

### 4.3 `switch_branch` tool
- Accept `branch_name`
- Run `git checkout {branch_name}`
- On success, return confirmation with active branch name
- On failure, pass through git's native error (e.g., conflicting changes, nonexistent branch)

---

## Phase 5: Integration & Validation

### 5.1 Build and smoke test
- Add `build` script to `package.json` (`tsc`)
- Build the project, fix any type errors
- Manual smoke test: run the server with `--name Test` in this repo, call each tool via an MCP client or raw stdio JSON-RPC

### 5.2 Multi-repo smoke test
- Run with two `--repo` args pointing to different local repos
- Verify `repo` parameter appears in tool schemas
- Verify calls to each repo target the correct directory

### 5.3 Register in Claude Code
- Add MCP server config to Claude Code settings for local use
- Verify tools appear and work from a Claude Code session

---

## Implementation Notes

- **No test framework in V1.** The tools are thin wrappers over git commands — validation is via smoke testing against real repos. Automated tests can be added in V2 if the tool surface grows.
- **No external CLI parsing library.** Two flags (`--repo`, `--name`) don't justify a dependency. Simple `process.argv` loop.
- **Commit message is written via stdin (`-F -`)**, not `-m`, to avoid issues with shell escaping of multi-line messages containing special characters.
