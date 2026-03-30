import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo, isMultiRepo, repoNames, acquireLock } from "../repo-registry.js";
import { runGit } from "../git-runner.js";

function buildCommitMessage(
  prefix: string,
  summary: string,
  changeDetails: string[],
  humanInput: string,
  workflow?: string,
): string {
  const lines: string[] = [];
  lines.push(`[${prefix}] ${summary}`);
  lines.push("");
  for (const detail of changeDetails) {
    lines.push(`- ${detail}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  if (workflow) {
    lines.push(`Workflow: ${workflow}`);
  }
  lines.push(`Prompt: ${humanInput}`);
  return lines.join("\n");
}

export function registerCommitTool(server: McpServer, prefix: string): void {
  const schema: Record<string, z.ZodType> = {};

  if (isMultiRepo()) {
    schema.repo = z.enum(repoNames() as [string, ...string[]]).describe("Target repository");
  }

  schema.files = z.array(z.string()).describe("Paths to stage, relative to repo root");
  schema.summary = z.string().describe("One-line action summary");
  schema.change_details = z.array(z.string()).describe("Bullet-point list of specific changes");
  schema.workflow = z.string().optional().describe("Workflow/rule that guided this commit");
  schema.human_input = z.string().describe("User message or prompt that triggered this commit");

  server.tool(
    "commit",
    "Stage files and create a commit with structured message",
    schema,
    async (params) => {
      const { repo, files, summary, change_details, workflow, human_input } = params as {
        repo?: string;
        files: string[];
        summary: string;
        change_details: string[];
        workflow?: string;
        human_input: string;
      };

      const repoPath = resolveRepo(repo);
      const release = await acquireLock(repoPath);

      try {
        // Snapshot currently staged files so we can rollback properly
        const snapshotResult = await runGit(["diff", "--staged", "--name-only"], repoPath);
        const previouslyStaged = snapshotResult.ok && snapshotResult.stdout
          ? snapshotResult.stdout.split("\n")
          : [];

        // Stage files
        const addResult = await runGit(["add", "--", ...files], repoPath);
        if (!addResult.ok) {
          // Rollback: reset only the files we attempted to stage
          await runGit(["reset", "--", ...files], repoPath);
          return {
            content: [{ type: "text" as const, text: `Error staging files: ${addResult.stderr}` }],
            isError: true,
          };
        }

        // Build commit message
        const message = buildCommitMessage(prefix, summary, change_details, human_input, workflow);

        // Commit using stdin (-F -) to avoid shell escaping issues
        const commitResult = await runGit(["commit", "-F", "-"], repoPath, message);
        if (!commitResult.ok) {
          // Rollback staged files: reset what we added, then re-stage what was previously staged
          await runGit(["reset", "--", ...files], repoPath);
          if (previouslyStaged.length > 0) {
            await runGit(["add", "--", ...previouslyStaged], repoPath);
          }
          return {
            content: [{ type: "text" as const, text: `Error committing: ${commitResult.stderr}` }],
            isError: true,
          };
        }

        // Get commit hash
        const hashResult = await runGit(["rev-parse", "HEAD"], repoPath);
        const hash = hashResult.ok ? hashResult.stdout : "unknown";

        return { content: [{ type: "text" as const, text: hash }] };
      } finally {
        release();
      }
    },
  );
}
