/**
 * Push the full working tree (including cloud/) to TunTun-cloud (`private`).
 *
 * Default `git push` goes to OSS only — use this script for the private remote.
 *
 * Usage:
 *   bun run sync:private
 */

async function git(
  args: string[],
  opts: { allowFail?: boolean; env?: Record<string, string> } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...opts.env },
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

const remote = "private";
const branch = "main";

const { stdout: url } = await git(["remote", "get-url", remote]);
const { stdout: sha } = await git(["rev-parse", "--short", "HEAD"]);
console.log(`Pushing full tree ${sha} to ${remote} (${url})`);
await git(["push", remote, `HEAD:${branch}`], {
  env: { TUNTUN_ALLOW_PRIVATE_PUSH: "1" },
});
console.log(`Pushed to ${remote}/${branch}`);
