import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo, isMultiRepo, repoNames } from "../repo-registry.js";
import { runGit } from "../git-runner.js";

export function registerStatusTool(server: McpServer): void {
  const schema: Record<string, z.ZodType> = {};

  if (isMultiRepo()) {
    schema.repo = z.enum(repoNames() as [string, ...string[]]).describe("Target repository");
  }

  server.tool(
    "status",
    "Returns working tree status (porcelain format)",
    schema,
    async (params) => {
      const repoPath = resolveRepo((params as Record<string, string>).repo);
      const result = await runGit(["status", "--porcelain"], repoPath);
      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.stderr}` }], isError: true };
      }
      return { content: [{ type: "text", text: result.stdout || "clean" }] };
    },
  );
}
