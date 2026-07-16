const check = Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], {
  stdout: "ignore",
  stderr: "ignore",
});
if ((await check.exited) !== 0) {
  process.exit(0);
}

for (const args of [
  ["config", "core.hooksPath", ".githooks"],
  ["config", "pull.ff", "only"],
]) {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "ignore",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) {
    // Non-fatal: installs/CI images may lack a writable git dir.
    process.exit(0);
  }
}
