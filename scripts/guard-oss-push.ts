/**
 * Pre-push hook for the OSS remote.
 *
 * Regular `git push` to origin/public publishes a filtered tree (no cloud/)
 * via push-oss.ts, then aborts the native push so cloud/ never uploads.
 *
 * Invoked by lefthook: bun run scripts/guard-oss-push.ts {remote}
 */

function isOssRemote(remoteName: string, remoteUrl: string): boolean {
  if (remoteName === "private") return false;
  const normalized = remoteUrl.replace(/\.git$/i, "").toLowerCase();
  if (normalized.includes("tuntun-cloud")) return false;
  if (remoteName === "origin" || remoteName === "public") {
    return (
      normalized.endsWith("orielhaim/tuntun") ||
      normalized.includes("github.com/orielhaim/tuntun")
    );
  }
  return (
    normalized.endsWith("orielhaim/tuntun") ||
    normalized.includes("github.com/orielhaim/tuntun")
  );
}

async function getRemoteUrl(name: string): Promise<string> {
  const proc = Bun.spawn(["git", "remote", "get-url", name], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return out;
}

async function headHasCloud(): Promise<boolean> {
  const proc = Bun.spawn(["git", "ls-tree", "-r", "--name-only", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out
    .split("\n")
    .some((line) => line === "cloud" || line.startsWith("cloud/"));
}

const remoteName = process.argv[2] ?? "";
// Drain stdin (git pre-push protocol) so the pipe does not stall
await Bun.stdin.text();

if (!remoteName) {
  process.exit(0);
}

const url = await getRemoteUrl(remoteName).catch(() => "");
if (!isOssRemote(remoteName, url)) {
  process.exit(0);
}

if (!(await headHasCloud())) {
  // No cloud/ in HEAD — allow a normal fast-forward push
  process.exit(0);
}

console.log(
  `OSS remote detected (${remoteName}). Publishing filtered tree (excluding cloud/)…`,
);

const push = Bun.spawn(
  ["bun", "run", "scripts/push-oss.ts", `--remote=${remoteName}`],
  { stdout: "inherit", stderr: "inherit" },
);
const code = await push.exited;
if (code !== 0) {
  process.exit(code);
}

console.error(
  [
    "",
    "Published filtered tree to OSS (cloud/ excluded).",
    "Native git push was stopped on purpose so cloud/ is not uploaded.",
    "To update the private full tree:  bun run sync:private",
    "",
  ].join("\n"),
);
// Non-zero aborts the native (unfiltered) push after a successful OSS publish.
process.exit(1);
