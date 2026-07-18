use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use k8s_openapi::api::core::v1::Service;
use kube::api::ListParams;
use kube::runtime::controller::Action;
use kube::{Api, ResourceExt};

use k8s_openapi::api::core::v1::EnvVar;

use crate::OperatorContext;
use crate::controllers::common::{
    ReconcileError, cleanup_node_workload, load_credentials_for_crd, load_proxy_class,
    nodes_from_status, patch_cluster_status, ready_condition, reconcile_node_workload,
    run_with_cluster_finalizer, set_observed_generation, workload_labels,
};
use crate::crds::{TunnetConnector, TunnetConnectorStatus};
use crate::resources::NodeWorkloadSpec;

pub async fn reconcile(
    obj: Arc<TunnetConnector>,
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

async fn apply(
    obj: Arc<TunnetConnector>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    let name = obj.name_any();
    let generation = obj.metadata.generation.unwrap_or(0);

    let result: Result<Action, ReconcileError> = async {
        let creds = load_credentials_for_crd(
            &ctx,
            obj.spec.auth_secret_ref.as_ref(),
            obj.spec.control_url.as_deref(),
            obj.spec.management_url.as_deref(),
        )
        .await?;

        let network_id = obj.spec.network_ref.network_id()?;

        let mut routes = obj.spec.subnet_router.routes.clone();
        if obj.spec.subnet_router.auto_discover_cluster_cidrs {
            routes.extend(discover_cluster_cidrs(&ctx).await?);
        }
        routes.sort();
        routes.dedup();

        let _hostname = obj.spec.hostname.clone().unwrap_or_else(|| name.clone());
        let workload_name = format!("tnc-{name}");
        let proxy_class = load_proxy_class(&ctx, obj.spec.proxy_class_ref.as_deref()).await?;

        let labels = workload_labels(&workload_name, "connector");
        let mesh_labels: HashMap<String, String> = obj
            .spec
            .labels
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        let workload = NodeWorkloadSpec {
            name: workload_name.clone(),
            namespace: ctx.operator_namespace.clone(),
            mode: "connector".into(),
            replicas: obj.spec.replicas.max(1),
            labels: labels.clone(),
            proxy_class,
            extra_env: vec![
                EnvVar {
                    name: "TUNNET_ADVERTISED_ROUTES".into(),
                    value: Some(routes.join(",")),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_EXIT_NODE".into(),
                    value: Some(obj.spec.exit_node.to_string()),
                    ..Default::default()
                },
            ],
        };

        let nodes = reconcile_node_workload(
            &ctx,
            &creds,
            &workload,
            network_id,
            "k8s-connector",
            Some(&mesh_labels),
            Some(&obj.spec.tags),
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

        let status = TunnetConnectorStatus {
            conditions: vec![
                ready_condition("ConnectorReady", true, None),
                ready_condition("SubnetRoutesAdvertised", !routes.is_empty(), None),
            ],
            nodes: node_status,
            advertised_routes: routes,
            observed_generation: Some(set_observed_generation(generation)),
        };

        patch_cluster_status::<TunnetConnector>(ctx.client.clone(), &name, &status).await?;

        Ok(Action::requeue(Duration::from_secs(300)))
    }
    .await;

    if let Err(e) = &result {
        let status = TunnetConnectorStatus {
            conditions: vec![ready_condition(
                "ConnectorReady",
                false,
                Some(e.to_string()),
            )],
            observed_generation: Some(set_observed_generation(generation)),
            ..Default::default()
        };
        let _ = patch_cluster_status::<TunnetConnector>(ctx.client.clone(), &name, &status).await;
    }

    result
}

async fn cleanup(
    obj: Arc<TunnetConnector>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    let name = obj.name_any();
    let workload_name = format!("tnc-{name}");
    let creds = load_credentials_for_crd(
        &ctx,
        obj.spec.auth_secret_ref.as_ref(),
        obj.spec.control_url.as_deref(),
        obj.spec.management_url.as_deref(),
    )
    .await?;

    let network_id = obj.spec.network_ref.network_id()?;
    let endpoint_pairs: Vec<_> = obj
        .status
        .as_ref()
        .map(|s| {
            s.nodes
                .iter()
                .map(|n| (network_id, n.endpoint_id.clone()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    cleanup_node_workload(
        &ctx,
        &creds,
        &ctx.operator_namespace,
        &workload_name,
        obj.spec.replicas.max(1),
        &endpoint_pairs,
    )
    .await?;

    Ok(Action::await_change())
}

async fn discover_cluster_cidrs(ctx: &OperatorContext) -> anyhow::Result<Vec<String>> {
    use k8s_openapi::api::core::v1::Node;
    use std::collections::BTreeSet;
    use std::net::Ipv4Addr;

    let mut cidrs = BTreeSet::new();

    // Pod networks from Node.spec.podCIDR(s)
    let nodes: Api<Node> = Api::all(ctx.client.clone());
    match nodes.list(&ListParams::default()).await {
        Ok(list) => {
            for node in list {
                let Some(spec) = node.spec else {
                    continue;
                };
                if let Some(pod_cidr) = spec.pod_cidr
                    && let Some(normalized) = normalize_ipv4_cidr(&pod_cidr)
                {
                    cidrs.insert(normalized);
                }
                for pod_cidr in spec.pod_cidrs.unwrap_or_default() {
                    if let Some(normalized) = normalize_ipv4_cidr(&pod_cidr) {
                        cidrs.insert(normalized);
                    }
                }
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "could not list nodes for pod CIDR discovery");
        }
    }

    // Service ClusterIP range: use the default/kubernetes Service as the anchor.
    // Do not invent /8 from every Service ClusterIP — that produces invalid CIDRs
    // like 10.109.101.0/8 and triggers control-plane 500s.
    let services: Api<Service> = Api::namespaced(ctx.client.clone(), "default");
    if let Ok(svc) = services.get("kubernetes").await
        && let Some(cluster_ip) = svc.spec.and_then(|s| s.cluster_ip)
        && cluster_ip != "None"
        && let Ok(ip) = cluster_ip.parse::<Ipv4Addr>()
    {
        cidrs.insert(infer_service_cidr(ip));
    }

    Ok(cidrs.into_iter().collect())
}

fn ipv4_network(ip: std::net::Ipv4Addr, prefix: u8) -> String {
    let prefix = prefix.min(32);
    let mask = if prefix == 0 {
        0u32
    } else {
        u32::MAX << (32 - prefix)
    };
    let net = std::net::Ipv4Addr::from(u32::from(ip) & mask);
    format!("{net}/{prefix}")
}

fn normalize_ipv4_cidr(cidr: &str) -> Option<String> {
    let (addr, prefix_str) = cidr.split_once('/')?;
    let ip: std::net::Ipv4Addr = addr.parse().ok()?;
    let prefix: u8 = prefix_str.parse().ok()?;
    Some(ipv4_network(ip, prefix))
}

fn infer_service_cidr(ip: std::net::Ipv4Addr) -> String {
    let o = ip.octets();
    // Kubernetes default service CIDR (kind, kubeadm).
    if o[0] == 10 && o[1] == 96 {
        return "10.96.0.0/12".into();
    }
    if o[0] == 172 && (16..=31).contains(&o[1]) {
        return ipv4_network(ip, 12);
    }
    ipv4_network(ip, 16)
}
