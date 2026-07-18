//! One-shot enrollment into a Tunnet network.

use tunnet_core::{AgentIdentity, ManagedState, PersistedState, StatePaths};

use crate::error::{Error, Result};

/// Configuration for [`enroll`].
#[derive(Debug, Clone, Default)]
pub struct EnrollConfig {
    /// Control plane base URL (required for token enrollment; also used when persisting managed state).
    pub control_url: Option<String>,
    /// One-time enrollment token (agent-style enrollment).
    pub token: Option<String>,
    /// Management API base URL for API-key SDK enrollment.
    pub management_url: Option<String>,
    /// Management API key (`tnnt_...`).
    pub api_key: Option<String>,
    /// Organization id for API-key enrollment.
    pub organization_id: Option<String>,
    /// Network id (UUID) for API-key enrollment.
    pub network_id: Option<String>,
    /// Hostname advertised to the control plane.
    pub hostname: Option<String>,
    /// State directory for identity + persisted state.
    pub state_dir: Option<String>,
    /// Optional process name metadata.
    pub process_name: Option<String>,
    /// Optional runtime metadata (e.g. `"tokio"`).
    pub runtime: Option<String>,
}

/// Result of a successful enrollment.
#[derive(Debug, Clone)]
pub struct EnrollResult {
    /// Hex-encoded endpoint id.
    pub endpoint_id: String,
    /// Assigned overlay IPv4.
    pub ip: String,
    /// Network name.
    pub network: String,
}

/// One-shot enrollment. Persists identity + state to `state_dir` so subsequent
/// [`crate::TunnetNode::builder`] `.start()` calls can bootstrap without a token.
#[cfg(feature = "managed")]
pub async fn enroll(cfg: EnrollConfig) -> Result<EnrollResult> {
    let paths = StatePaths::resolve(cfg.state_dir.as_deref());
    paths.ensure().map_err(Error::from_anyhow)?;

    let identity = AgentIdentity::generate();
    let hostname = cfg
        .hostname
        .unwrap_or_else(|| std::env::var("HOSTNAME").unwrap_or_else(|_| "tunnet-sdk".into()));

    let mut metadata =
        tunnet_core::control::basic_metadata(&hostname, env!("CARGO_PKG_VERSION"), "sdk");
    if let Some(name) = cfg.process_name {
        metadata["processName"] = name.into();
    }
    if let Some(runtime) = cfg.runtime {
        metadata["runtime"] = runtime.into();
    }

    let control_url = cfg
        .control_url
        .clone()
        .or_else(|| std::env::var("CONTROL_PLANE_URL").ok())
        .unwrap_or_default();

    let resp = if let (Some(api_key), Some(org_id), Some(network_id)) = (
        cfg.api_key.as_deref(),
        cfg.organization_id.as_deref(),
        cfg.network_id.as_deref(),
    ) {
        let management_url = cfg
            .management_url
            .clone()
            .or_else(|| std::env::var("MANAGEMENT_URL").ok())
            .ok_or_else(|| {
                Error::InvalidConfig("management_url is required for API key enrolment".into())
            })?;
        let client = tunnet_core::control::ManagementClient::new(management_url)
            .map_err(Error::enrollment)?;
        let network_uuid = uuid::Uuid::parse_str(network_id)
            .map_err(|_| Error::InvalidConfig("invalid network_id".into()))?;
        client
            .register_sdk_node(
                api_key,
                org_id,
                network_uuid,
                &identity.endpoint_id_hex(),
                &hostname,
                Some(metadata.clone()),
                None,
                None,
                None,
                None,
            )
            .await
            .map_err(Error::enrollment)?
    } else {
        let token = cfg.token.ok_or_else(|| {
            Error::InvalidConfig(
                "either token or api_key + organization_id + network_id is required".into(),
            )
        })?;
        if control_url.is_empty() {
            return Err(Error::InvalidConfig(
                "control_url is required for token enrolment".into(),
            ));
        }
        let client =
            tunnet_core::UnauthedClient::new(control_url.clone()).map_err(Error::enrollment)?;
        client
            .enroll(tunnet_common::EnrollRequest {
                enrollment_token: Some(token),
                organization_slug: None,
                network_id: None,
                network_name: None,
                endpoint_id: identity.endpoint_id_hex(),
                hostname: hostname.clone(),
                os: std::env::consts::OS.to_string(),
                agent_version: env!("CARGO_PKG_VERSION").to_string(),
                metadata: Some(metadata.clone()),
                labels: None,
                expires_in: None,
            })
            .await
            .map_err(Error::enrollment)?
    };

    let membership = resp
        .snapshot
        .memberships
        .iter()
        .find(|m| m.network_id == resp.network_id)
        .ok_or_else(|| Error::EnrollmentFailed("enrolled network missing from snapshot".into()))?;

    let persisted = PersistedState::Managed(ManagedState {
        control_url,
        network_name: resp.network_name.clone(),
        network_id: resp.network_id,
        organization_id: resp.organization_id.clone(),
        enrolled_at: chrono::Utc::now(),
    });
    let policy = tunnet_core::SealPolicy::from_env_and_flag(false);
    tunnet_core::persist_agent(&paths, &identity, persisted, policy).map_err(Error::enrollment)?;
    tunnet_core::state::save_snapshot_cache(&paths, &resp.snapshot).map_err(Error::enrollment)?;

    Ok(EnrollResult {
        endpoint_id: identity.endpoint_id_hex(),
        ip: membership.assigned_ipv4.to_string(),
        network: resp.network_name,
    })
}
