# zm-mcp

A collection of MCP (Model Context Protocol) servers for AI agent workflows. Each server is token-efficient by design — schemas and outputs minimize token cost for calling LLMs.

## Servers

| Server | Path | Description |
|--------|------|-------------|
| [Git](src/git/README.md) | `src/git/` | Structured git operations with consistent commit formats and multi-repo support |

## Quick start

```bash
npm install
npm run build
```

### Use with Claude Code

The included `.mcp.json` configures the git server for Claude Code out of the box:

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

### Use as a global CLI

```bash
npm link
zm-mcp-git --name Claude
```

## Development

- **Language:** TypeScript (ES2022, Node16 modules)
- **Build:** `npm run build` (runs `tsc`)
- **Dependencies:** `@modelcontextprotocol/sdk`, `zod`

Source lives in `src/`, compiled output goes to `dist/`.

## License

MIT — see [LICENSE](LICENSE).
