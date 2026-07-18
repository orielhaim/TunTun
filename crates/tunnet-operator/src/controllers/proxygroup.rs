use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use kube::ResourceExt;
use kube::runtime::controller::Action;

use crate::OperatorContext;
use crate::controllers::common::{
    ReconcileError, cleanup_node_workload, load_credentials_for_crd, load_proxy_class,
    nodes_from_status, patch_cluster_status, ready_condition, reconcile_node_workload,
    run_with_cluster_finalizer, set_observed_generation, workload_labels,
};
use crate::crds::{TunnetProxyGroup, TunnetProxyGroupStatus};
use crate::resources::NodeWorkloadSpec;

pub async fn reconcile(
    obj: Arc<TunnetProxyGroup>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    run_with_cluster_finalizer(
        obj,
        ctx,
        |o, c| async move { apply(o, c).await },
        |o, c| async move { cleanup(o, c).await },
    )
    .await
}

fn mode_for_type(proxy_type: &str) -> &'static str {
    match proxy_type {
        "ingress" => "ingress-proxy",
        "egress" => "egress-proxy",
        "connector" => "connector",
        "tunnel" => "tunnel-proxy",
        _ => "connector",
    }
}

fn kind_for_type(proxy_type: &str) -> &'static str {
    match proxy_type {
        "ingress" => "k8s-ingress",
        "egress" => "k8s-egress",
        "connector" => "k8s-connector",
        "tunnel" => "k8s-tunnel",
        _ => "k8s-connector",
    }
}

async fn apply(
    obj: Arc<TunnetProxyGroup>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    let name = obj.name_any();
    let generation = obj.metadata.generation.unwrap_or(0);

    let result: Result<Action, ReconcileError> = async {
        let creds =
            load_credentials_for_crd(&ctx, obj.spec.auth_secret_ref.as_ref(), None, None).await?;
        let network_id = obj.spec.network_ref.network_id()?;

        let workload_name = format!("tnpg-{name}");
        let proxy_class = load_proxy_class(&ctx, obj.spec.proxy_class_ref.as_deref()).await?;
        let mode = mode_for_type(&obj.spec.proxy_type);
        let kind = kind_for_type(&obj.spec.proxy_type);

        let workload = NodeWorkloadSpec {
            name: workload_name.clone(),
            namespace: ctx.operator_namespace.clone(),
            mode: mode.into(),
            replicas: obj.spec.replicas.max(1),
            labels: workload_labels(&workload_name, &obj.spec.proxy_type),
            proxy_class,
            extra_env: Vec::new(),
        };

        let labels: HashMap<String, String> = HashMap::new();
        let nodes = reconcile_node_workload(
            &ctx,
            &creds,
            &workload,
            network_id,
            kind,
            Some(&labels),
            None,
        )
        .await?;

        let node_status = nodes_from_status(
            &nodes
                .iter()
                .map(|n| {
                    (
                        n.network_id,
                        n.endpoint_id.clone(),
                        n.hostname.clone(),
                        n.mesh_ip.clone(),
                    )
                })
                .collect::<Vec<_>>(),
        );

        let status = TunnetProxyGroupStatus {
            conditions: vec![ready_condition("ProxyGroupReady", true, None)],
            ready_replicas: Some(nodes.len() as u32),
            nodes: node_status,
            observed_generation: Some(set_observed_generation(generation)),
        };
        patch_cluster_status::<TunnetProxyGroup>(ctx.client.clone(), &name, &status).await?;

        Ok(Action::requeue(Duration::from_secs(300)))
    }
    .await;

    if let Err(e) = &result {
        let status = TunnetProxyGroupStatus {
            conditions: vec![ready_condition(
                "ProxyGroupReady",
                false,
                Some(e.to_string()),
            )],
            observed_generation: Some(set_observed_generation(generation)),
            ..Default::default()
        };
        let _ = patch_cluster_status::<TunnetProxyGroup>(ctx.client.clone(), &name, &status).await;
    }

    result
}

async fn cleanup(
    obj: Arc<TunnetProxyGroup>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    let name = obj.name_any();
    let workload_name = format!("tnpg-{name}");
    let creds =
        load_credentials_for_crd(&ctx, obj.spec.auth_secret_ref.as_ref(), None, None).await?;
    let network_id = obj.spec.network_ref.network_id()?;

    let pairs: Vec<_> = obj
        .status
        .as_ref()
        .map(|s| {
            s.nodes
                .iter()
                .map(|n| (network_id, n.endpoint_id.clone()))
                .collect()
        })
        .unwrap_or_default();

    cleanup_node_workload(
        &ctx,
        &creds,
        &ctx.operator_namespace,
        &workload_name,
        obj.spec.replicas.max(1),
        &pairs,
    )
    .await?;

    Ok(Action::await_change())
}
