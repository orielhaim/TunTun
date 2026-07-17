//! PTY spawn helpers for Tunnet SSH.

use std::io::{Read, Write};

use anyhow::Context;
#[cfg(not(any(unix, windows)))]
use anyhow::bail;
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};

use super::user;

pub struct PtyRequest {
    pub target_user: String,
    pub term_type: String,
    pub width: u16,
    pub height: u16,
    pub env_vars: Vec<(String, String)>,
    pub command: Option<String>,
}

pub struct PtySession {
    pub reader: Box<dyn Read + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child_killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
    pub master: Box<dyn MasterPty + Send>,
}

pub fn spawn_pty(req: &PtyRequest) -> anyhow::Result<PtySession> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: req.height.max(1),
            cols: req.width.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("openpty")?;

    let mut cmd = build_command(req)?;
    cmd.env("TERM", &req.term_type);
    for (k, v) in &req.env_vars {
        if is_safe_env_key(k) {
            cmd.env(k, v);
        }
    }

    let child = pair.slave.spawn_command(cmd).context("spawn pty command")?;
    drop(pair.slave);

    let reader = pair.master.try_clone_reader().context("clone pty reader")?;
    let writer = pair.master.take_writer().context("take pty writer")?;
    let killer = child.clone_killer();

    std::thread::spawn(move || {
        let mut child = child;
        let _ = child.wait();
    });

    Ok(PtySession {
        reader,
        writer,
        child_killer: killer,
        master: pair.master,
    })
}

fn build_command(req: &PtyRequest) -> anyhow::Result<CommandBuilder> {
    #[cfg(unix)]
    {
        build_unix_command(req)
    }
    #[cfg(windows)]
    {
        build_windows_command(req)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = req;
        bail!("SSH PTY is not supported on this platform");
    }
}

#[cfg(unix)]
fn build_unix_command(req: &PtyRequest) -> anyhow::Result<CommandBuilder> {
    let info = user::lookup(&req.target_user)?;
    let shell = info.shell.to_string_lossy().into_owned();
    let home = info.home_dir.to_string_lossy().into_owned();
    let name = info.username.clone();

    let mut cmd = if info.uid != unsafe { libc::getuid() } {
        build_user_switched_command(&name, &shell, req.command.as_deref())?
    } else if let Some(command) = &req.command {
        let mut c = CommandBuilder::new(&shell);
        c.arg("-c");
        c.arg(command);
        c
    } else {
        let mut c = CommandBuilder::new(&shell);
        c.arg("-l");
        c
    };
    cmd.cwd(&home);
    cmd.env("HOME", &home);
    cmd.env("USER", &name);
    cmd.env("LOGNAME", &name);
    cmd.env("SHELL", &shell);
    let _ = info;
    Ok(cmd)
}

#[cfg(unix)]
fn build_user_switched_command(
    username: &str,
    shell: &str,
    command: Option<&str>,
) -> anyhow::Result<CommandBuilder> {
    if let Some(runuser) = ["/usr/sbin/runuser", "/bin/runuser", "runuser"]
        .into_iter()
        .find(|path| std::path::Path::new(path).exists())
    {
        let mut c = CommandBuilder::new(runuser);
        c.arg("-u");
        c.arg(username);
        c.arg("--");
        c.arg(shell);
        if let Some(command) = command {
            c.arg("-c");
            c.arg(command);
        } else {
            c.arg("-l");
        }
        return Ok(c);
    }

    let mut c = CommandBuilder::new("su");
    if command.is_none() {
        c.arg("-");
        c.arg(username);
        return Ok(c);
    }

    c.arg(username);
    c.arg("-c");
    let command = command.unwrap();
    c.arg(format!("{shell} -c {command}"));
    Ok(c)
}

#[cfg(windows)]
fn build_windows_command(req: &PtyRequest) -> anyhow::Result<CommandBuilder> {
    let _info: user::UserInfo = user::lookup(&req.target_user)?;
    if let Some(command) = &req.command {
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.arg("/C");
        cmd.arg(command);
        Ok(cmd)
    } else {
        Ok(CommandBuilder::new("powershell.exe"))
    }
}

fn is_safe_env_key(key: &str) -> bool {
    matches!(
        key,
        "LANG"
            | "LC_ALL"
            | "LC_CTYPE"
            | "LC_MESSAGES"
            | "COLORTERM"
            | "TERM_PROGRAM"
            | "TERM_PROGRAM_VERSION"
    )
}
