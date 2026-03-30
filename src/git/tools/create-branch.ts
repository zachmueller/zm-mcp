import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo, isMultiRepo, repoNames } from "../repo-registry.js";
import { runGit } from "../git-runner.js";

export function registerCreateBranchTool(server: McpServer): void {
  const schema: Record<string, z.ZodType> = {};

  if (isMultiRepo()) {
    schema.repo = z.enum(repoNames() as [string, ...string[]]).describe("Target repository");
  }

  schema.branch_name = z.string().describe("Name for the new branch");
  schema.from_ref = z.string().optional().describe("Ref to branch from (default: HEAD)");

  server.tool(
    "create_branch",
    "Create a new branch",
    schema,
    async (params) => {
      const { repo, branch_name, from_ref } = params as {
        repo?: string;
        branch_name: string;
        from_ref?: string;
      };

      const repoPath = resolveRepo(repo);

      const args = ["branch", branch_name];
      if (from_ref) {
        args.push(from_ref);
      }

      const result = await runGit(args, repoPath);
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.stderr}` }],
          isError: true,
        };
      }

      // Resolve the ref the branch was created from
      const refResult = await runGit(["rev-parse", from_ref ?? "HEAD"], repoPath);
      const resolvedRef = refResult.ok ? refResult.stdout : (from_ref ?? "HEAD");

      return {
        content: [{ type: "text" as const, text: `Created branch ${branch_name} from ${resolvedRef}` }],
      };
    },
  );
}
