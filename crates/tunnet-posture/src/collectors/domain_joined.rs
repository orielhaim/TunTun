use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct DomainJoinedCollector;

#[async_trait]
impl PostureCollector for DomainJoinedCollector {
    fn name(&self) -> &'static str {
        "domain_joined"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::Windows]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let joined = check_domain_joined().await;
        let mut attrs = PostureAttributes::new(self.name());
        attrs
            .attributes
            .insert("device:domainJoined".into(), PostureValue::Bool(joined));
        Ok(attrs)
    }
}

async fn check_domain_joined() -> bool {
    #[cfg(windows)]
    {
        if let Some(out) =
            super::run_powershell("(Get-CimInstance Win32_ComputerSystem).PartOfDomain").await
        {
            return out.to_lowercase().contains("true");
        }
        if let Some(out) =
            super::run_command("wmic", &["computersystem", "get", "partofdomain"]).await
        {
            return out.to_lowercase().contains("true");
        }
        false
    }

    #[cfg(not(windows))]
    {
        false
    }
}
