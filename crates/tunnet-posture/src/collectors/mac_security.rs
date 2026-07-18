use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;

pub struct MacSecurityCollector;

#[async_trait]
impl PostureCollector for MacSecurityCollector {
    fn name(&self) -> &'static str {
        "mac_security"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[Platform::MacOS]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let mut attrs = PostureAttributes::new(self.name());

        #[cfg(target_os = "macos")]
        {
            let sip = super::run_command("csrutil", &["status"])
                .await
                .map(|s| s.contains("enabled"))
                .unwrap_or(false);
            attrs
                .attributes
                .insert("device:sipEnabled".into(), PostureValue::Bool(sip));

            let gatekeeper = super::run_command("spctl", &["--status"])
                .await
                .map(|s| s.contains("enabled"))
                .unwrap_or(false);
            attrs.attributes.insert(
                "device:gatekeeperEnabled".into(),
                PostureValue::Bool(gatekeeper),
            );
        }

        #[cfg(not(target_os = "macos"))]
        {
            attrs
                .attributes
                .insert("device:sipEnabled".into(), PostureValue::Bool(false));
            attrs
                .attributes
                .insert("device:gatekeeperEnabled".into(), PostureValue::Bool(false));
        }

        Ok(attrs)
    }
}
