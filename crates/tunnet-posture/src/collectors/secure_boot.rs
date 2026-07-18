use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct SecureBootCollector;

#[async_trait]
impl PostureCollector for SecureBootCollector {
    fn name(&self) -> &'static str {
        "secure_boot"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::Windows, Platform::Linux]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let enabled = check_secure_boot().await;
        let mut attrs = PostureAttributes::new(self.name());
        attrs
            .attributes
            .insert("device:secureBoot".into(), PostureValue::Bool(enabled));
        Ok(attrs)
    }
}

async fn check_secure_boot() -> bool {
    #[cfg(windows)]
    {
        if let Some(out) =
            super::run_powershell("Confirm-SecureBootUEFI -ErrorAction SilentlyContinue").await
        {
            return out.to_lowercase().contains("true");
        }
        false
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(out) = super::run_command("mokutil", &["--sb-state"]).await {
            return out.contains("SecureBoot enabled");
        }
        if std::path::Path::new(
            "/sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c",
        )
        .exists()
        {
            return true;
        }
        false
    }

    #[cfg(not(any(windows, target_os = "linux")))]
    {
        false
    }
}
