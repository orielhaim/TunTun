use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct MdmCollector;

#[async_trait]
impl PostureCollector for MdmCollector {
    fn name(&self) -> &'static str {
        "mdm"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::Windows, Platform::MacOS]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let managed = check_mdm().await;
        let mut attrs = PostureAttributes::new(self.name());
        attrs
            .attributes
            .insert("device:mdmManaged".into(), PostureValue::Bool(managed));
        Ok(attrs)
    }
}

async fn check_mdm() -> bool {
    #[cfg(windows)]
    {
        if let Some(out) = super::run_powershell(
            "(Get-CimInstance -Namespace root/cimv2/mdm/dmmap -ClassName MDM_DevDetail -ErrorAction SilentlyContinue).InstanceID",
        )
        .await
        {
            return !out.is_empty();
        }
        if let Ok(managed) = winreg_mdm() {
            return managed;
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(out) = super::run_command("profiles", &["status", "-type", "enrollment"]).await
        {
            return out.contains("Enrolled via MDM") || out.contains("MDM enrollment");
        }
        false
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        false
    }
}

#[cfg(windows)]
fn winreg_mdm() -> Result<bool, ()> {
    // winreg 0.56+: HKLM is a predefined RegKey (no RegKey::predef).
    let key = winreg::HKLM
        .open_subkey("SOFTWARE\\Microsoft\\Enrollments")
        .ok();
    Ok(key.is_some())
}
