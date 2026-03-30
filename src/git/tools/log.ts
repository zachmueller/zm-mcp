import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo, isMultiRepo, repoNames } from "../repo-registry.js";
import { runGit } from "../git-runner.js";

export function registerLogTool(server: McpServer): void {
  const schema: Record<string, z.ZodType> = {};

  if (isMultiRepo()) {
    schema.repo = z.enum(repoNames() as [string, ...string[]]).describe("Target repository");
  }

  schema.limit = z.number().optional().default(10).describe("Number of commits to return (default: 10)");
  schema.branch = z.string().optional().describe("Branch to show history for (default: current branch)");

  server.tool(
    "log",
    "Returns recent commit history (hash + subject per line)",
    schema,
    async (params) => {
      const { repo, limit, branch } = params as { repo?: string; limit?: number; branch?: string };
      const repoPath = resolveRepo(repo);

      const args = ["log", "--oneline", `-n`, `${limit ?? 10}`];
      if (branch) args.push(branch);

      const result = await runGit(args, repoPath);
      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.stderr}` }], isError: true };
      }
      return { content: [{ type: "text", text: result.stdout || "no commits" }] };
    },
  );
}
