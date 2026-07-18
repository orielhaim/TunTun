use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct ScreenLockCollector;

#[async_trait]
impl PostureCollector for ScreenLockCollector {
    fn name(&self) -> &'static str {
        "screen_lock"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::Windows, Platform::MacOS, Platform::Linux]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let (screen_lock, password) = check_screen_lock().await;
        let mut attrs = PostureAttributes::new(self.name());
        attrs.attributes.insert(
            "device:screenLockEnabled".into(),
            PostureValue::Bool(screen_lock),
        );
        if let Some(pw) = password {
            attrs
                .attributes
                .insert("device:passwordProtected".into(), PostureValue::Bool(pw));
        }
        Ok(attrs)
    }
}

async fn check_screen_lock() -> (bool, Option<bool>) {
    #[cfg(windows)]
    {
        let screen_lock = winreg_screen_lock().unwrap_or(false);
        let password = super::run_powershell(
            "[bool](Get-LocalUser | Where-Object { $_.Enabled -eq $true -and $_.PasswordRequired -eq $true })",
        )
        .await
        .map(|s| s.to_lowercase().contains("true"))
        .unwrap_or(false);
        (screen_lock, Some(password))
    }

    #[cfg(target_os = "macos")]
    {
        let screen_lock = super::run_command("sysadminctl", &["-screenLock", "status"])
            .await
            .map(|s| s.contains("enabled") || s.contains("on"))
            .unwrap_or(false);
        let password = super::run_command("dscl", &[".", "-read", "/Users/$(whoami)", "Password"])
            .await
            .map(|s| !s.is_empty())
            .unwrap_or(true);
        (screen_lock, Some(password))
    }

    #[cfg(target_os = "linux")]
    {
        let screen_lock = super::run_command(
            "gsettings",
            &["get", "org.gnome.desktop.screensaver", "lock-enabled"],
        )
        .await
        .map(|s| s.contains("true"))
        .unwrap_or(false);
        (screen_lock, None)
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        (false, None)
    }
}

#[cfg(windows)]
fn winreg_screen_lock() -> Option<bool> {
    // winreg 0.56+: HKCU is a predefined RegKey (no RegKey::predef).
    let policy = winreg::HKCU
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System")
        .ok()?;
    let timeout: u32 = policy.get_value("InactivityTimeoutSecs").unwrap_or(0);
    Some(timeout > 0)
}
