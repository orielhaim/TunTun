use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct TpmCollector;

#[async_trait]
impl PostureCollector for TpmCollector {
    fn name(&self) -> &'static str {
        "tpm"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::Windows, Platform::Linux]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let (present, version) = check_tpm().await;
        let mut attrs = PostureAttributes::new(self.name());
        attrs
            .attributes
            .insert("device:tpmPresent".into(), PostureValue::Bool(present));
        if let Some(v) = version {
            attrs
                .attributes
                .insert("device:tpmVersion".into(), PostureValue::String(v));
        }
        Ok(attrs)
    }
}

async fn check_tpm() -> (bool, Option<String>) {
    #[cfg(windows)]
    {
        if let Ok(present) = wmi_tpm() {
            return present;
        }
        if let Some(out) =
            super::run_powershell("(Get-Tpm -ErrorAction SilentlyContinue).TpmPresent").await
        {
            let present = out.to_lowercase().contains("true");
            let version = super::run_powershell(
                "(Get-Tpm -ErrorAction SilentlyContinue).ManufacturerVersionInfo",
            )
            .await;
            return (present, version.filter(|v| !v.is_empty()));
        }
        (false, None)
    }

    #[cfg(target_os = "linux")]
    {
        let tpm_path = std::path::Path::new("/sys/class/tpm/tpm0");
        if tpm_path.exists() {
            let version = std::fs::read_to_string(tpm_path.join("tpm_version_major"))
                .ok()
                .map(|v| format!("{}.0", v.trim()));
            return (true, version);
        }
        (false, None)
    }

    #[cfg(not(any(windows, target_os = "linux")))]
    {
        (false, None)
    }
}

#[cfg(windows)]
fn wmi_tpm() -> Result<(bool, Option<String>), ()> {
    use std::collections::HashMap;
    use wmi::WMIConnection;

    // wmi 0.18+ initializes COM per-thread internally; no COMLibrary handle needed.
    let wmi = WMIConnection::new().map_err(|_| ())?;
    let results: Vec<HashMap<String, wmi::Variant>> = wmi
        .raw_query("SELECT IsEnabled_InitialValue, SpecVersion FROM Win32_Tpm")
        .map_err(|_| ())?;

    if let Some(row) = results.into_iter().next() {
        let present = row
            .get("IsEnabled_InitialValue")
            .and_then(|v| match v {
                wmi::Variant::Bool(b) => Some(*b),
                _ => None,
            })
            .unwrap_or(true);
        let version = row.get("SpecVersion").and_then(|v| match v {
            wmi::Variant::String(s) => Some(s.clone()),
            _ => None,
        });
        return Ok((present, version));
    }
    Ok((false, None))
}
