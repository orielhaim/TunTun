use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;
use sysinfo::{ProcessesToUpdate, System};

#[derive(Debug, Clone)]
pub struct AppCheckConfig {
    pub id: String,
    pub path_or_bundle: String,
}

pub struct ApplicationCheckCollector {
    apps: Vec<AppCheckConfig>,
}

impl ApplicationCheckCollector {
    pub fn new(apps: Vec<AppCheckConfig>) -> Self {
        Self { apps }
    }
}

#[async_trait]
impl PostureCollector for ApplicationCheckCollector {
    fn name(&self) -> &'static str {
        "app_check"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[
            Platform::Windows,
            Platform::MacOS,
            Platform::Linux,
            Platform::FreeBSD,
        ]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let mut attrs = PostureAttributes::new(self.name());

        for app in &self.apps {
            let running = is_app_running(&app.path_or_bundle).await;
            let key = format!("device:appRunning:{}", app.id);
            attrs.attributes.insert(key, PostureValue::Bool(running));
        }

        Ok(attrs)
    }
}

async fn is_app_running(path_or_bundle: &str) -> bool {
    if is_process_running(path_or_bundle) {
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        if path_or_bundle.contains('.') {
            if let Some(out) = super::run_command("pgrep", &["-f", path_or_bundle]).await {
                return !out.is_empty();
            }
        }
    }

    #[cfg(windows)]
    {
        let escaped = path_or_bundle.replace('\'', "''");
        if let Some(out) = super::run_powershell(&format!(
            "Get-Process -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -like '*{escaped}*' }} | Select-Object -First 1"
        ))
        .await
        {
            return !out.is_empty();
        }
    }

    std::path::Path::new(path_or_bundle).exists()
        && super::run_command("pgrep", &["-f", path_or_bundle])
            .await
            .map(|s| !s.is_empty())
            .unwrap_or(false)
}

fn is_process_running(name: &str) -> bool {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let needle = name.to_lowercase();
    sys.processes().values().any(|p| {
        let exe = p
            .exe()
            .and_then(|e| e.file_name())
            .map(|n| n.to_string_lossy().to_lowercase());
        let proc_name = p.name().to_string_lossy().to_lowercase();
        proc_name.contains(&needle) || exe.as_ref().is_some_and(|e| e.contains(&needle))
    })
}
