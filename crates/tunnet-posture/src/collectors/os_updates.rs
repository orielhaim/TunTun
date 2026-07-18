use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct OsUpdatesCollector;

#[async_trait]
impl PostureCollector for OsUpdatesCollector {
    fn name(&self) -> &'static str {
        "os_updates"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::Windows, Platform::MacOS, Platform::Linux]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let pending = check_updates_pending().await;
        let mut attrs = PostureAttributes::new(self.name());
        attrs
            .attributes
            .insert("device:osUpdatePending".into(), PostureValue::Bool(pending));
        Ok(attrs)
    }
}

async fn check_updates_pending() -> bool {
    #[cfg(windows)]
    {
        if let Some(out) = super::run_powershell(
            "(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search('IsInstalled=0').Updates.Count",
        )
        .await
        {
            return out.parse::<u32>().unwrap_or(0) > 0;
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(out) = super::run_command("softwareupdate", &["-l"]).await {
            return out.contains("*") || out.to_lowercase().contains("recommended");
        }
        false
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(out) = super::run_command("apt", &["list", "--upgradable"]).await {
            return out.lines().count() > 1;
        }
        if let Some(out) = super::run_command("dnf", &["check-update"]).await {
            return !out.is_empty();
        }
        false
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        false
    }
}
