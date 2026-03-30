import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo, isMultiRepo, repoNames } from "../repo-registry.js";
import { runGit } from "../git-runner.js";

export function registerDiffTool(server: McpServer): void {
  const schema: Record<string, z.ZodType> = {
    staged: z.boolean().describe("true = staged changes, false = working tree changes"),
  };

  if (isMultiRepo()) {
    schema.repo = z.enum(repoNames() as [string, ...string[]]).describe("Target repository");
  }

  // paths is always optional
  schema.paths = z.array(z.string()).optional().describe("Limit diff to specific files/directories");

  server.tool(
    "diff",
    "Returns git diff output",
    schema,
    async (params) => {
      const { repo, staged, paths } = params as { repo?: string; staged: boolean; paths?: string[] };
      const repoPath = resolveRepo(repo);

      const args = ["diff"];
      if (staged) args.push("--staged");
      if (paths && paths.length > 0) {
        args.push("--");
        args.push(...paths);
      }

      const result = await runGit(args, repoPath);
      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.stderr}` }], isError: true };
      }
      return { content: [{ type: "text", text: result.stdout || "no changes" }] };
    },
  );
}
