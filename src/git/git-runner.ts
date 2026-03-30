import { execFile } from "node:child_process";

export interface GitResult {
  stdout: string;
  stderr: string;
}

export interface GitError {
  ok: false;
  stderr: string;
  exitCode: number;
}

export interface GitSuccess {
  ok: true;
  stdout: string;
  stderr: string;
}

export type GitRunResult = GitSuccess | GitError;

export function runGit(
  args: string[],
  cwd: string,
  stdin?: string,
): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const proc = execFile(
      "git",
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            stderr: stderr.trimEnd(),
            exitCode: typeof error.code === "number" ? error.code : 1,
          });
        } else {
          resolve({
            ok: true,
            stdout: stdout.trimEnd(),
            stderr: stderr.trimEnd(),
          });
        }
      },
    );
    if (stdin !== undefined && proc.stdin) {
      proc.stdin.end(stdin);
    }
  });
}
