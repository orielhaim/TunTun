/**
 * Pre-push guard:
 * - OSS (origin): publish filtered tree via push-oss.ts, then abort native push
 * - private (TunTun-cloud): block unless sync:private set TUNTUN_ALLOW_PRIVATE_PUSH=1
 *
 * Lefthook: bun run scripts/guard-oss-push.ts {remote}
 */

function normalizeUrl(url: string): string {
  return url.replace(/\.git$/i, "").toLowerCase();
}

function isPrivateRemote(remoteName: string, remoteUrl: string): boolean {
  if (remoteName === "private") return true;
  return normalizeUrl(remoteUrl).includes("tuntun-cloud");
}

function isOssRemote(remoteName: string, remoteUrl: string): boolean {
  if (isPrivateRemote(remoteName, remoteUrl)) return false;
  const normalized = normalizeUrl(remoteUrl);
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
await Bun.stdin.text();

if (!remoteName) {
  process.exit(0);
}

const url = await getRemoteUrl(remoteName).catch(() => "");

if (isPrivateRemote(remoteName, url)) {
  if (process.env.TUNTUN_ALLOW_PRIVATE_PUSH === "1") {
    process.exit(0);
  }
  console.error(
    [
      "",
      `Refusing push to private remote (${remoteName}).`,
      "Full-tree updates go through:  bun run sync:private",
      "Default `git push` publishes filtered OSS to origin only.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

if (!isOssRemote(remoteName, url)) {
  process.exit(0);
}

if (!(await headHasCloud())) {
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
process.exit(1);
