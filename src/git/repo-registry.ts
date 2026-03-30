import { runGit } from "./git-runner.js";

const CWD = process.cwd();

let repos: Map<string, string>;
let multiRepo = false;

// Per-repo promise chain for serializing concurrent operations
const locks = new Map<string, Promise<void>>();

export function isMultiRepo(): boolean {
  return multiRepo;
}

export function repoNames(): string[] {
  return [...repos.keys()];
}

export function resolveRepo(name?: string): string {
  if (!multiRepo) {
    // Single-repo mode: return the one repo regardless of name arg
    const [path] = repos.values();
    return path;
  }
  if (name === undefined) {
    throw new Error(
      `repo is required. Valid repos: ${[...repos.keys()].join(", ")}`,
    );
  }
  const path = repos.get(name);
  if (!path) {
    throw new Error(
      `Unknown repo "${name}". Valid repos: ${[...repos.keys()].join(", ")}`,
    );
  }
  return path;
}

export async function acquireLock(repoPath: string): Promise<() => void> {
  // Chain a new promise onto the existing chain for this repo
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const prev = locks.get(repoPath) ?? Promise.resolve();
  locks.set(
    repoPath,
    prev.then(() => gate),
  );

  await prev;
  return release!;
}

async function validateGitRepo(path: string, label: string): Promise<void> {
  const result = await runGit(["rev-parse", "--git-dir"], path);
  if (!result.ok) {
    throw new Error(
      `"${label}" (${path}) is not a valid git repository: ${result.stderr}`,
    );
  }
}

export async function initRepoRegistry(
  repoArgs: Array<{ name: string; path: string }>,
): Promise<void> {
  repos = new Map();

  if (repoArgs.length === 0) {
    // Default to cwd
    repos.set("default", CWD);
  } else {
    for (const { name, path } of repoArgs) {
      if (repos.has(name)) {
        throw new Error(`Duplicate repo name: "${name}"`);
      }
      repos.set(name, path);
    }
  }

  multiRepo = repos.size >= 2;

  // Validate all repos in parallel
  await Promise.all(
    [...repos.entries()].map(([name, path]) => validateGitRepo(path, name)),
  );
}
