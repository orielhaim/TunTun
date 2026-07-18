use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use kube::api::{Patch, PatchParams};
use kube::runtime::controller::Action;
use kube::runtime::finalizer::{Event, finalizer};
use kube::{Api, Client, Resource, ResourceExt};
use serde::Serialize;
use uuid::Uuid;

use crate::auth::{self, AuthCredentials};
use crate::crds::{Condition, TunnetProxyClass};
use crate::enroll::{self, EnrolledNode};
use crate::resources::{self, NodeWorkloadSpec};
use crate::{FINALIZER, OperatorContext};

/// Thin wrapper: `anyhow::Error` does not implement [`std::error::Error`], which kube 4 requires.
#[derive(Debug)]
pub struct ReconcileError(pub anyhow::Error);

impl std::fmt::Display for ReconcileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl std::error::Error for ReconcileError {}

impl From<anyhow::Error> for ReconcileError {
    fn from(err: anyhow::Error) -> Self {
        Self(err)
    }
}

fn map_finalizer_error(err: kube::runtime::finalizer::Error<ReconcileError>) -> ReconcileError {
    match err {
        kube::runtime::finalizer::Error::ApplyFailed(e)
        | kube::runtime::finalizer::Error::CleanupFailed(e) => e,
        kube::runtime::finalizer::Error::AddFinalizer(e) => ReconcileError(e.into()),
        kube::runtime::finalizer::Error::RemoveFinalizer(e) => ReconcileError(e.into()),
        kube::runtime::finalizer::Error::UnnamedObject => {
            ReconcileError(anyhow::anyhow!("object has no name"))
        }
        kube::runtime::finalizer::Error::InvalidFinalizer => {
            ReconcileError(anyhow::anyhow!("invalid finalizer path"))
        }
    }
}

pub fn error_policy<K>(_obj: Arc<K>, err: &ReconcileError, _ctx: Arc<OperatorContext>) -> Action {
    tracing::warn!(error = %err, "reconcile error");
    Action::requeue(Duration::from_secs(30))
}

pub fn ready_condition(condition_type: &str, ready: bool, message: Option<String>) -> Condition {
    Condition {
        condition_type: condition_type.to_string(),
        status: if ready { "True" } else { "False" }.into(),
        reason: None,
        message,
        last_transition_time: Some(Utc::now().to_rfc3339()),
    }
}

pub fn set_observed_generation(generation: i64) -> i64 {
    generation
}

pub async fn run_with_finalizer<K, ApplyFut, CleanupFut>(
    obj: Arc<K>,
    ctx: Arc<OperatorContext>,
    apply: impl FnOnce(Arc<K>, Arc<OperatorContext>) -> ApplyFut,
    cleanup: impl FnOnce(Arc<K>, Arc<OperatorContext>) -> CleanupFut,
) -> Result<Action, ReconcileError>
where
    K: Resource<Scope = kube::core::NamespaceResourceScope>
        + Clone
        + serde::de::DeserializeOwned
        + serde::Serialize
        + std::fmt::Debug
        + Send
        + Sync
        + 'static,
    K::DynamicType: Default,
    ApplyFut: std::future::Future<Output = Result<Action, ReconcileError>>,
    CleanupFut: std::future::Future<Output = Result<Action, ReconcileError>>,
{
    let ns = obj
        .namespace()
        .unwrap_or_else(|| ctx.operator_namespace.clone());
    let api: Api<K> = Api::namespaced(ctx.client.clone(), &ns);
    let ctx_for_finalizer = ctx.clone();
    finalizer(&api, FINALIZER, obj, move |event| {
        let ctx = ctx_for_finalizer.clone();
        async move {
            match event {
                Event::Apply(obj) => apply(obj, ctx.clone()).await,
                Event::Cleanup(obj) => cleanup(obj, ctx).await,
            }
        }
    })
    .await
    .map_err(map_finalizer_error)
}

pub async fn run_with_cluster_finalizer<K, ApplyFut, CleanupFut>(
    obj: Arc<K>,
    ctx: Arc<OperatorContext>,
    apply: impl FnOnce(Arc<K>, Arc<OperatorContext>) -> ApplyFut,
    cleanup: impl FnOnce(Arc<K>, Arc<OperatorContext>) -> CleanupFut,
) -> Result<Action, ReconcileError>
where
    K: Resource<Scope = kube::core::ClusterResourceScope>
        + Clone
        + serde::de::DeserializeOwned
        + serde::Serialize
        + std::fmt::Debug
        + Send
        + Sync
        + 'static,
    K::DynamicType: Default,
    ApplyFut: std::future::Future<Output = Result<Action, ReconcileError>>,
    CleanupFut: std::future::Future<Output = Result<Action, ReconcileError>>,
{
    let api: Api<K> = Api::all(ctx.client.clone());
    let ctx_for_finalizer = ctx.clone();
    finalizer(&api, FINALIZER, obj, move |event| {
        let ctx = ctx_for_finalizer.clone();
        async move {
            match event {
                Event::Apply(obj) => apply(obj, ctx.clone()).await,
                Event::Cleanup(obj) => cleanup(obj, ctx).await,
            }
        }
    })
    .await
    .map_err(map_finalizer_error)
}

pub async fn patch_status<K>(
    client: Client,
    namespace: Option<&str>,
    name: &str,
    status: &impl Serialize,
) -> anyhow::Result<()>
where
    K: Resource<Scope = kube::core::NamespaceResourceScope>
        + Clone
        + serde::de::DeserializeOwned
        + std::fmt::Debug,
    K::DynamicType: Default,
{
    let ns = namespace.ok_or_else(|| {
        anyhow::anyhow!("namespace required for namespaced resource status patch")
    })?;
    let api: Api<K> = Api::namespaced(client, ns);
    let patch = serde_json::json!({ "status": status });
    api.patch_status(name, &PatchParams::default(), &Patch::Merge(&patch))
        .await?;
    Ok(())
}

pub async fn patch_cluster_status<K>(
    client: Client,
    name: &str,
    status: &impl Serialize,
) -> anyhow::Result<()>
where
    K: Resource<Scope = kube::core::ClusterResourceScope>
        + Clone
        + serde::de::DeserializeOwned
        + std::fmt::Debug,
    K::DynamicType: Default,
{
    let api: Api<K> = Api::all(client);
    let patch = serde_json::json!({ "status": status });
    api.patch_status(name, &PatchParams::default(), &Patch::Merge(&patch))
        .await?;
    Ok(())
}

pub async fn load_proxy_class(
    ctx: &OperatorContext,
    name: Option<&str>,
) -> anyhow::Result<Option<TunnetProxyClass>> {
    let Some(name) = name else {
        return Ok(None);
    };
    let api: Api<TunnetProxyClass> = Api::all(ctx.client.clone());
    match api.get(name).await {
        Ok(pc) => Ok(Some(pc)),
        Err(kube::Error::Api(e)) if e.is_not_found() => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub async fn reconcile_node_workload(
    ctx: &OperatorContext,
    creds: &AuthCredentials,
    workload: &NodeWorkloadSpec,
    network_id: Uuid,
    kind: &str,
    labels: Option<&std::collections::HashMap<String, String>>,
    tags: Option<&[String]>,
) -> anyhow::Result<Vec<EnrolledNode>> {
    use tunnet_core::{ManagedState, PersistedState};

    let mut nodes = Vec::new();
    for ordinal in 0..workload.replicas {
        let hostname = if workload.replicas == 1 {
            workload.name.clone()
        } else {
            format!("{}-{}", workload.name, ordinal)
        };
        let secret_name = resources::node_secret_name(&workload.name, ordinal);

        // Reuse an existing identity Secret — re-enrolling every reconcile burns
        // mesh IPs and restarts pods (status patches re-trigger the controller).
        let node = if let Some(mut existing) =
            resources::load_node_secret(ctx, &workload.namespace, &secret_name).await?
        {
            let needs_url_refresh = match &existing.persisted {
                PersistedState::Managed(ManagedState { control_url, .. }) => {
                    control_url != &creds.control_url
                }
                _ => true,
            };
            if needs_url_refresh {
                existing.persisted = PersistedState::Managed(ManagedState {
                    control_url: creds.control_url.clone(),
                    network_name: existing.network_name.clone(),
                    network_id: existing.network_id,
                    organization_id: existing.organization_id.clone(),
                    enrolled_at: Utc::now(),
                });
                resources::upsert_node_secret(
                    ctx,
                    &workload.namespace,
                    &secret_name,
                    &existing,
                    workload.labels.clone(),
                )
                .await?;
            }
            if existing.hostname.is_empty() {
                existing.hostname = hostname;
            }
            existing
        } else {
            let node =
                enroll::enroll_node(ctx, creds, network_id, &hostname, kind, labels, tags).await?;
            resources::upsert_node_secret(
                ctx,
                &workload.namespace,
                &secret_name,
                &node,
                workload.labels.clone(),
            )
            .await?;
            node
        };
        nodes.push(node);
    }
    resources::upsert_statefulset(ctx, workload).await?;
    Ok(nodes)
}

pub async fn cleanup_node_workload(
    ctx: &OperatorContext,
    creds: &AuthCredentials,
    namespace: &str,
    workload_name: &str,
    replicas: u32,
    endpoint_ids: &[(Uuid, String)],
) -> anyhow::Result<()> {
    resources::delete_statefulset(ctx, namespace, &resources::statefulset_name(workload_name))
        .await?;
    for ordinal in 0..replicas {
        let secret_name = resources::node_secret_name(workload_name, ordinal);
        resources::delete_secret(ctx, namespace, &secret_name).await?;
    }
    let _ = enroll::deregister_nodes(creds, endpoint_ids).await?;
    Ok(())
}

pub fn workload_labels(name: &str, component: &str) -> BTreeMap<String, String> {
    BTreeMap::from([
        (
            "app.kubernetes.io/managed-by".into(),
            "tunnet-operator".into(),
        ),
        ("tunnet.io/workload".into(), name.into()),
        ("tunnet.io/component".into(), component.into()),
    ])
}

pub async fn load_credentials_for_crd(
    ctx: &OperatorContext,
    auth_secret_ref: Option<&crate::crds::AuthSecretRef>,
    control_url: Option<&str>,
    management_url: Option<&str>,
) -> anyhow::Result<AuthCredentials> {
    auth::load_auth_credentials(ctx, auth_secret_ref, control_url, management_url).await
}

pub fn nodes_from_status(
    endpoint_ids: &[(Uuid, String, String, String)],
) -> Vec<crate::crds::NodeStatus> {
    endpoint_ids
        .iter()
        .enumerate()
        .map(
            |(i, (_net, endpoint_id, hostname, mesh_ip))| crate::crds::NodeStatus {
                ordinal: Some(i as i32),
                hostname: hostname.clone(),
                endpoint_id: endpoint_id.clone(),
                mesh_ip: mesh_ip.clone(),
            },
        )
        .collect()
}
