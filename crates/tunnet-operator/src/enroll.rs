use std::collections::HashMap;

use chrono::Utc;
use tunnet_core::control::ManagementClient;
use tunnet_core::{AgentIdentity, ManagedState, PersistedState};
use uuid::Uuid;

use crate::OperatorContext;
use crate::auth::AuthCredentials;

#[derive(Clone)]
pub struct EnrolledNode {
    pub identity: AgentIdentity,
    pub endpoint_id: String,
    pub hostname: String,
    pub network_id: Uuid,
    pub network_name: String,
    pub organization_id: String,
    pub mesh_ip: String,
    pub persisted: PersistedState,
}

pub async fn enroll_node(
    ctx: &OperatorContext,
    creds: &AuthCredentials,
    network_id: Uuid,
    hostname: &str,
    kind: &str,
    labels: Option<&HashMap<String, String>>,
    tags: Option<&[String]>,
) -> anyhow::Result<EnrolledNode> {
    let identity = AgentIdentity::generate();
    let endpoint_id = identity.endpoint_id_hex();

    let metadata = serde_json::json!({
        "hostname": hostname,
        "kind": kind,
        "operatorManaged": true,
        "reportedAt": Utc::now().to_rfc3339(),
    });

    let client = ManagementClient::new(creds.management_url.clone())?;
    let response = client
        .register_sdk_node(
            &creds.api_key,
            &creds.org_id,
            network_id,
            &endpoint_id,
            hostname,
            Some(metadata),
            Some(kind),
            labels,
            Some(ctx.node_expires_in.as_str()),
            tags,
        )
        .await?;

    let mesh_ip = response
        .snapshot
        .memberships
        .iter()
        .find(|m| m.network_id == network_id)
        .map(|m| m.assigned_ipv4.to_string())
        .unwrap_or_else(|| "0.0.0.0".into());

    let persisted = PersistedState::Managed(ManagedState {
        control_url: creds.control_url.clone(),
        network_name: response.network_name.clone(),
        network_id: response.network_id,
        organization_id: response.organization_id.clone(),
        enrolled_at: Utc::now(),
    });

    Ok(EnrolledNode {
        identity,
        endpoint_id,
        hostname: hostname.to_string(),
        network_id: response.network_id,
        network_name: response.network_name,
        organization_id: response.organization_id,
        mesh_ip,
        persisted,
    })
}

pub async fn deregister_nodes(
    creds: &AuthCredentials,
    items: &[(Uuid, String)],
) -> anyhow::Result<u32> {
    if items.is_empty() {
        return Ok(0);
    }
    let refs: Vec<(Uuid, &str)> = items.iter().map(|(n, e)| (*n, e.as_str())).collect();
    let client = ManagementClient::new(creds.management_url.clone())?;
    client
        .delete_devices(&creds.api_key, &creds.org_id, &refs)
        .await
}
