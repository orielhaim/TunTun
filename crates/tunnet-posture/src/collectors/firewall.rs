use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct FirewallCollector;

#[async_trait]
impl PostureCollector for FirewallCollector {
    fn name(&self) -> &'static str {
        "firewall"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::Windows, Platform::MacOS, Platform::Linux]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let enabled = check_firewall().await;
        let mut attrs = PostureAttributes::new(self.name());
        attrs
            .attributes
            .insert("device:firewallEnabled".into(), PostureValue::Bool(enabled));
        Ok(attrs)
    }
}

async fn check_firewall() -> bool {
    #[cfg(windows)]
    {
        if let Some(out) =
            super::run_command("netsh", &["advfirewall", "show", "allprofiles", "state"]).await
        {
            return out.to_lowercase().contains("on");
        }
        if let Some(out) = super::run_powershell(
            "(Get-NetFirewallProfile | Where-Object { $_.Enabled -eq $true }).Count",
        )
        .await
        {
            return out.parse::<u32>().unwrap_or(0) > 0;
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(out) = super::run_command(
            "/usr/libexec/ApplicationFirewall/socketfilterfw",
            &["--getglobalstate"],
        )
        .await
        {
            return out.contains("enabled");
        }
        if let Some(out) = super::run_command(
            "defaults",
            &["read", "/Library/Preferences/com.apple.alf", "globalstate"],
        )
        .await
        {
            return out == "1" || out == "2";
        }
        false
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(out) = super::run_command("ufw", &["status"]).await
            && out.contains("active")
        {
            return true;
        }
        if let Some(out) = super::run_command("firewall-cmd", &["--state"]).await
            && out.contains("running")
        {
            return true;
        }
        if let Some(out) = super::run_command("nft", &["list", "ruleset"]).await
            && !out.is_empty()
        {
            return true;
        }
        if let Some(out) = super::run_command("iptables", &["-L", "-n"]).await {
            return !out.is_empty();
        }
        false
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        false
    }
}
