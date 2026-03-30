import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo, isMultiRepo, repoNames } from "../repo-registry.js";
import { runGit } from "../git-runner.js";

export function registerSwitchBranchTool(server: McpServer): void {
  const schema: Record<string, z.ZodType> = {};

  if (isMultiRepo()) {
    schema.repo = z.enum(repoNames() as [string, ...string[]]).describe("Target repository");
  }

  schema.branch_name = z.string().describe("Branch to switch to");

  server.tool(
    "switch_branch",
    "Check out an existing branch",
    schema,
    async (params) => {
      const { repo, branch_name } = params as {
        repo?: string;
        branch_name: string;
      };

      const repoPath = resolveRepo(repo);

      const result = await runGit(["checkout", branch_name], repoPath);
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.stderr}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: `Switched to branch ${branch_name}` }],
      };
    },
  );
}
