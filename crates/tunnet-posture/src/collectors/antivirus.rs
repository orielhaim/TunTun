use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct AntivirusCollector;

#[async_trait]
impl PostureCollector for AntivirusCollector {
    fn name(&self) -> &'static str {
        "antivirus"
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
            attrs.attributes.insert(
                "device:antivirusInstalled".into(),
                PostureValue::Bool(false),
            );
        }

        Ok(attrs)
    }
}

#[cfg(windows)]
async fn collect_windows(attrs: &mut PostureAttributes) {
    let (installed, name, up_to_date) = windows_av_status().await;
    attrs.attributes.insert(
        "device:antivirusInstalled".into(),
        PostureValue::Bool(installed),
    );
    if let Some(n) = name {
        attrs
            .attributes
            .insert("device:antivirusName".into(), PostureValue::String(n));
    }
    if let Some(up) = up_to_date {
        attrs
            .attributes
            .insert("device:antivirusUpToDate".into(), PostureValue::Bool(up));
    }
}

#[cfg(windows)]
async fn windows_av_status() -> (bool, Option<String>, Option<bool>) {
    if let Ok(products) = wmi_antivirus()
        && let Some((name, up_to_date)) = products.into_iter().next()
    {
        return (true, Some(name), Some(up_to_date));
    }

    if let Some(out) = super::run_powershell(
        "Get-MpComputerStatus -ErrorAction SilentlyContinue | \
         Select-Object -ExpandProperty AntivirusEnabled",
    )
    .await
    {
        let enabled = out.to_lowercase().contains("true");
        if enabled {
            let up = super::run_powershell(
                "Get-MpComputerStatus -ErrorAction SilentlyContinue | \
                 Select-Object -ExpandProperty AntispywareSignatureLastUpdated",
            )
            .await
            .is_some();
            return (true, Some("Windows Defender".into()), Some(up));
        }
    }

    (false, None, None)
}

#[cfg(windows)]
fn wmi_antivirus() -> Result<Vec<(String, bool)>, ()> {
    use std::collections::HashMap;
    use wmi::WMIConnection;

    // wmi 0.18+ initializes COM per-thread internally; no COMLibrary handle needed.
    let wmi = WMIConnection::with_namespace_path("ROOT\\SecurityCenter2").map_err(|_| ())?;
    let results: Vec<HashMap<String, wmi::Variant>> = wmi
        .raw_query("SELECT displayName, productState FROM AntiVirusProduct")
        .map_err(|_| ())?;

    let mut products = Vec::new();
    for row in results {
        let name = row
            .get("displayName")
            .and_then(|v| match v {
                wmi::Variant::String(s) => Some(s.clone()),
                _ => None,
            })
            .unwrap_or_else(|| "Unknown".into());

        let up_to_date = row
            .get("productState")
            .and_then(|v| match v {
                wmi::Variant::UI4(state) => {
                    // ProductState bitmask: signatures up-to-date when bits indicate so
                    Some((*state & 0x10) != 0)
                }
                _ => None,
            })
            .unwrap_or(false);

        products.push((name, up_to_date));
    }
    Ok(products)
}

#[cfg(target_os = "macos")]
async fn collect_macos(attrs: &mut PostureAttributes) {
    let xprotect = super::run_command(
        "defaults",
        &[
            "read",
            "/Library/Preferences/com.apple.XProtect.plist",
            "Version",
        ],
    )
    .await
    .is_some()
        || std::path::Path::new("/Library/Apple/System/Library/CoreServices/XProtect.app").exists();

    attrs.attributes.insert(
        "device:antivirusInstalled".into(),
        PostureValue::Bool(xprotect),
    );
    if xprotect {
        attrs.attributes.insert(
            "device:antivirusName".into(),
            PostureValue::String("XProtect".into()),
        );
    }
}

#[cfg(target_os = "linux")]
async fn collect_linux(attrs: &mut PostureAttributes) {
    let clam = super::run_command("which", &["clamdscan"])
        .await
        .or(super::run_command("which", &["clamscan"]).await)
        .is_some();

    let known = ["clamd", "freshclam", "sophos", "esets_daemon"];
    let mut process_av = false;
    for p in known {
        if std::path::Path::new(&format!("/proc/{p}")).exists()
            || super::run_command("pgrep", &[p]).await.is_some()
        {
            process_av = true;
            break;
        }
    }

    let installed = clam || process_av;
    attrs.attributes.insert(
        "device:antivirusInstalled".into(),
        PostureValue::Bool(installed),
    );
    if clam {
        attrs.attributes.insert(
            "device:antivirusName".into(),
            PostureValue::String("ClamAV".into()),
        );
    }
}
