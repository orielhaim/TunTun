const check = Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], {
  stdout: "ignore",
  stderr: "ignore",
});
if ((await check.exited) !== 0) {
  process.exit(0);
}

const install = Bun.spawn(["bunx", "lefthook", "install"], {
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await install.exited);
