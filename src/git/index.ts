import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initRepoRegistry } from "./repo-registry.js";
import { registerStatusTool } from "./tools/status.js";
import { registerDiffTool } from "./tools/diff.js";
import { registerLogTool } from "./tools/log.js";
import { registerListBranchesTool } from "./tools/list-branches.js";
import { registerCommitTool } from "./tools/commit.js";
import { registerCreateBranchTool } from "./tools/create-branch.js";
import { registerSwitchBranchTool } from "./tools/switch-branch.js";

interface CliArgs {
  name: string;
  repos: Array<{ name: string; path: string }>;
}

function parseArgs(argv: string[]): CliArgs {
  let name: string | undefined;
  const repos: Array<{ name: string; path: string }> = [];

  let i = 2; // skip node and script path
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--name") {
      i++;
      if (i >= argv.length) {
        console.error("Error: --name requires a value");
        process.exit(1);
      }
      name = argv[i];
    } else if (arg === "--repo") {
      i++;
      if (i >= argv.length) {
        console.error("Error: --repo requires a value in name=path format");
        process.exit(1);
      }
      const eqIdx = argv[i].indexOf("=");
      if (eqIdx === -1) {
        console.error(
          `Error: --repo value must be in name=path format, got "${argv[i]}"`,
        );
        process.exit(1);
      }
      repos.push({
        name: argv[i].slice(0, eqIdx),
        path: argv[i].slice(eqIdx + 1),
      });
    } else {
      console.error(`Error: Unknown argument "${arg}"`);
      console.error(
        "Usage: node dist/git/index.js --name <prefix> [--repo <name>=<path>]...",
      );
      process.exit(1);
    }
    i++;
  }

  if (!name) {
    console.error("Error: --name is required");
    console.error(
      "Usage: node dist/git/index.js --name <prefix> [--repo <name>=<path>]...",
    );
    process.exit(1);
  }

  return { name, repos };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  await initRepoRegistry(args.repos);

  const server = new McpServer({
    name: `git-${args.name.toLowerCase()}`,
    version: "0.1.0",
  });

  // Phase 3: Read tools
  registerStatusTool(server);
  registerDiffTool(server);
  registerLogTool(server);
  registerListBranchesTool(server);

  // Phase 4: Write tools
  registerCommitTool(server, args.name);
  registerCreateBranchTool(server);
  registerSwitchBranchTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Git MCP server started (prefix: [${args.name}])`);
}

main().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
