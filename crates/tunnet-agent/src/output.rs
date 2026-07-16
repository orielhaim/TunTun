//! Human-friendly CLI output with optional `--json` and TTY-aware color.

use std::io::{self, IsTerminal, Write};

pub struct Output {
    pub json: bool,
    color: bool,
}

impl Output {
    pub fn new(json: bool) -> Self {
        Self {
            json,
            color: !json && io::stdout().is_terminal(),
        }
    }

    pub fn print_json<T: serde::Serialize>(&self, value: &T) -> anyhow::Result<()> {
        println!("{}", serde_json::to_string_pretty(value)?);
        Ok(())
    }

    pub fn paint(&self, code: &str, text: &str) -> String {
        if self.color {
            format!("\x1b[{code}m{text}\x1b[0m")
        } else {
            text.to_string()
        }
    }

    pub fn green(&self, text: &str) -> String {
        self.paint("32", text)
    }
    pub fn red(&self, text: &str) -> String {
        self.paint("31", text)
    }
    pub fn dim(&self, text: &str) -> String {
        self.paint("2", text)
    }
    pub fn bold(&self, text: &str) -> String {
        self.paint("1", text)
    }
    pub fn cyan(&self, text: &str) -> String {
        self.paint("36", text)
    }
    pub fn yellow(&self, text: &str) -> String {
        self.paint("33", text)
    }

    pub fn online_dot(&self, online: bool) -> String {
        if online {
            self.green("●")
        } else {
            self.dim("○")
        }
    }

    pub fn writeln(&self, line: impl AsRef<str>) {
        let _ = writeln!(io::stdout(), "{}", line.as_ref());
    }
}

pub fn short_endpoint(id: &str) -> String {
    if id.len() <= 12 {
        id.to_string()
    } else {
        format!("{}…{}", &id[..6], &id[id.len() - 4..])
    }
}

pub fn format_uptime(secs: u64) -> String {
    let days = secs / 86_400;
    let hours = (secs % 86_400) / 3_600;
    let mins = (secs % 3_600) / 60;
    let s = secs % 60;
    if days > 0 {
        format!("{days}d{hours}h")
    } else if hours > 0 {
        format!("{hours}h{mins}m")
    } else if mins > 0 {
        format!("{mins}m{s}s")
    } else {
        format!("{s}s")
    }
}
