use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct DiskEncryptionCollector;

#[async_trait]
impl PostureCollector for DiskEncryptionCollector {
    fn name(&self) -> &'static str {
        "disk_encryption"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::Windows, Platform::MacOS, Platform::Linux]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let mut attrs = PostureAttributes::new(self.name());

        #[cfg(windows)]
        {
            collect_windows(&mut attrs).await;
        }
        #[cfg(target_os = "macos")]
        {
            collect_macos(&mut attrs).await;
        }
        #[cfg(target_os = "linux")]
        {
            collect_linux(&mut attrs).await;
        }
        #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
        {
            attrs
                .attributes
                .insert("device:diskEncryption".into(), PostureValue::Bool(false));
            attrs.attributes.insert(
                "device:diskEncryptionType".into(),
                PostureValue::String("none".into()),
            );
        }

        Ok(attrs)
    }
}

#[cfg(windows)]
async fn collect_windows(attrs: &mut PostureAttributes) {
    let (enabled, enc_type) = windows_disk_encryption().await;
    attrs
        .attributes
        .insert("device:diskEncryption".into(), PostureValue::Bool(enabled));
    attrs.attributes.insert(
        "device:diskEncryptionType".into(),
        PostureValue::String(enc_type),
    );
}

#[cfg(windows)]
async fn windows_disk_encryption() -> (bool, String) {
    if let Some(out) = super::run_powershell(
        "Get-BitLockerVolume -ErrorAction SilentlyContinue | \
         Select-Object -ExpandProperty VolumeStatus -First 1",
    )
    .await
    {
        let enabled = out.contains("FullyEncrypted") || out.contains("EncryptionInProgress");
        if enabled {
            return (true, "bitlocker".into());
        }
    }

    if let Ok(volumes) = wmi_disk_encryption()
        && volumes
    {
        return (true, "bitlocker".into());
    }

    (false, "none".into())
}

#[cfg(windows)]
fn wmi_disk_encryption() -> Result<bool, ()> {
    use std::collections::HashMap;
    use wmi::WMIConnection;

    // wmi 0.18+ initializes COM per-thread internally; no COMLibrary handle needed.
    let wmi =
        WMIConnection::with_namespace_path("ROOT\\CIMV2\\Security\\MicrosoftVolumeEncryption")
            .map_err(|_| ())?;
    let results: Vec<HashMap<String, wmi::Variant>> = wmi
        .raw_query("SELECT ProtectionStatus FROM Win32_EncryptableVolume")
        .map_err(|_| ())?;

    for row in results {
        if let Some(wmi::Variant::UI1(status)) = row.get("ProtectionStatus")
            && *status == 1
        {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(target_os = "macos")]
async fn collect_macos(attrs: &mut PostureAttributes) {
    let enabled = super::run_command("fdesetup", &["status"])
        .await
        .map(|s| s.contains("FileVault is On"))
        .unwrap_or(false);

    attrs
        .attributes
        .insert("device:diskEncryption".into(), PostureValue::Bool(enabled));
    attrs.attributes.insert(
        "device:diskEncryptionType".into(),
        PostureValue::String(if enabled {
            "filevault".into()
        } else {
            "none".into()
        }),
    );
}

#[cfg(target_os = "linux")]
async fn collect_linux(attrs: &mut PostureAttributes) {
    let luks = super::run_command("lsblk", &["-o", "TYPE", "-n"])
        .await
        .map(|s| s.lines().any(|l| l.trim() == "crypt"))
        .unwrap_or(false);

    attrs
        .attributes
        .insert("device:diskEncryption".into(), PostureValue::Bool(luks));
    attrs.attributes.insert(
        "device:diskEncryptionType".into(),
        PostureValue::String(if luks { "luks".into() } else { "none".into() }),
    );
}
