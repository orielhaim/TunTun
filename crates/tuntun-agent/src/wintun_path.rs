use std::path::{Path, PathBuf};

pub fn resolve(explicit: Option<&str>) -> PathBuf {
    if let Some(path) = explicit {
        return PathBuf::from(path);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let beside = dir.join("wintun.dll");
            if beside.is_file() {
                return beside;
            }
        }
    }
    PathBuf::from("wintun.dll")
}

pub fn wintun_load_hint(path: &Path) -> String {
    format!(
        "could not load wintun.dll at {}. Download https://wintun.net/, extract the DLL for your CPU architecture, place it next to tuntun-agent.exe (or pass --wintun-file), and run as Administrator",
        path.display()
    )
}
