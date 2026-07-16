/**
 * Publish a filtered mirror of the current HEAD to the `public` remote,
 * excluding the `cloud/` directory.
 *
 * Usage:
 *   bun run scripts/sync-public.ts
 *   bun run scripts/sync-public.ts --force   # only when public history must be rewritten
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const force = process.argv.includes("--force");
const remote = "public";
const branch = "main";

async function git(
  args: string[],
  opts: { cwd?: string; allowFail?: boolean } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0 && !opts.allowFail) {
    throw new Error(
      `git ${args.join(" ")} failed (${code}): ${stderr || stdout}`,
    );
  }
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function main() {
  const { stdout: remoteUrl } = await git(["remote", "get-url", remote]);
  const { stdout: headSha } = await git(["rev-parse", "--short", "HEAD"]);
  const { stdout: headFull } = await git(["rev-parse", "HEAD"]);
  const { stdout: repoRoot } = await git(["rev-parse", "--show-toplevel"]);

  const tmp = await mkdtemp(join(tmpdir(), "tuntun-sync-public-"));
  console.log(`Syncing filtered tree to ${remote} (${remoteUrl})`);
  console.log(`Source: ${headFull}`);

  try {
    const clone = await git(
      ["clone", "--depth", "1", "--branch", branch, remoteUrl, tmp],
      { allowFail: true },
    );

    if (clone.code !== 0) {
      console.log(
        "Public branch missing or empty; initializing fresh clone...",
      );
      await git(["init", "-b", branch], { cwd: tmp });
      await git(["remote", "add", "origin", remoteUrl], { cwd: tmp });
    }

    // Clear public clone contents
    await git(["rm", "-rf", "--ignore-unmatch", "."], {
      cwd: tmp,
      allowFail: true,
    });

    // Export HEAD via archive (does not touch the main worktree/index)
    const archive = Bun.spawn(
      ["git", "-C", repoRoot, "archive", "--format=tar", "HEAD"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const extract = Bun.spawn(["tar", "-xf", "-", "-C", tmp], {
      stdin: archive.stdout,
      stdout: "pipe",
      stderr: "pipe",
    });
    const archiveCode = await archive.exited;
    const extractCode = await extract.exited;
    if (archiveCode !== 0 || extractCode !== 0) {
      const err = await new Response(extract.stderr).text();
      const aerr = await new Response(archive.stderr).text();
      throw new Error(
        `Failed to export archive: ${aerr || err || `codes ${archiveCode}/${extractCode}`}`,
      );
    }

    await rm(join(tmp, "cloud"), { recursive: true, force: true });

    await git(["add", "-A"], { cwd: tmp });
    const { stdout: porcelain } = await git(["status", "--porcelain"], {
      cwd: tmp,
    });
    if (!porcelain) {
      console.log(
        "Public remote already matches filtered tree; nothing to do.",
      );
      return;
    }

    await git(
      ["commit", "-m", `sync: mirror from private@${headSha} (without cloud/)`],
      { cwd: tmp },
    );

    const pushArgs = ["push", "origin", `HEAD:${branch}`];
    if (force) pushArgs.push("--force");
    await git(pushArgs, { cwd: tmp });
    console.log(`Pushed filtered mirror to ${remote}/${branch}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await main();
