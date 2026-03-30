import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo, isMultiRepo, repoNames } from "../repo-registry.js";
import { runGit } from "../git-runner.js";

export function registerListBranchesTool(server: McpServer): void {
  const schema: Record<string, z.ZodType> = {};

  if (isMultiRepo()) {
    schema.repo = z.enum(repoNames() as [string, ...string[]]).describe("Target repository");
  }

  schema.include_remote = z.boolean().optional().default(false).describe("Include remote branches (default: false)");

  server.tool(
    "list_branches",
    "Lists branches in a repository",
    schema,
    async (params) => {
      const { repo, include_remote } = params as { repo?: string; include_remote?: boolean };
      const repoPath = resolveRepo(repo);

      const args = ["branch"];
      if (include_remote) args.push("--all");

      const result = await runGit(args, repoPath);
      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.stderr}` }], isError: true };
      }
      return { content: [{ type: "text", text: result.stdout || "no branches" }] };
    },
  );
}
