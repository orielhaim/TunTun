use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use k8s_openapi::api::core::v1::{EnvVar, Service};
use kube::runtime::controller::Action;
use kube::{Api, ResourceExt};

use crate::OperatorContext;
use crate::controllers::common::{
    ReconcileError, cleanup_node_workload, load_credentials_for_crd, load_proxy_class,
    patch_status, ready_condition, reconcile_node_workload, run_with_finalizer,
    set_observed_generation, workload_labels,
};
use crate::crds::{TunnetTunnel, TunnetTunnelStatus};
use crate::resources::NodeWorkloadSpec;

pub async fn reconcile(
    obj: Arc<TunnetTunnel>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    run_with_finalizer(
        obj,
        ctx,
        |o, c| async move { apply(o, c).await },
        |o, c| async move { cleanup(o, c).await },
    )
    .await
}

async fn apply(
    obj: Arc<TunnetTunnel>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    let name = obj.name_any();
    let namespace = obj
        .namespace()
        .unwrap_or_else(|| ctx.operator_namespace.clone());
    let generation = obj.metadata.generation.unwrap_or(0);

    let result: Result<Action, ReconcileError> = async {
        if obj.spec.proxy_group_ref.is_some() {
            let public_url = public_url_from_spec(&obj);
            let status = TunnetTunnelStatus {
                conditions: vec![ready_condition(
                    "TunnelReady",
                    true,
                    Some("delegated to proxyGroup".into()),
                )],
                public_url: Some(public_url),
                observed_generation: Some(set_observed_generation(generation)),
                ..Default::default()
            };
            patch_status::<TunnetTunnel>(ctx.client.clone(), Some(&namespace), &name, &status)
                .await?;
            return Ok(Action::requeue(Duration::from_secs(300)));
        }

        let creds =
            load_credentials_for_crd(&ctx, obj.spec.auth_secret_ref.as_ref(), None, None).await?;
        let network_id = obj.spec.network_ref.network_id()?;

        let backend = resolve_service_cluster_ip(&ctx, &namespace, &obj.spec.service.name).await?;
        let workload_name = format!("tnt-{namespace}-{name}");
        let proxy_class = load_proxy_class(&ctx, None).await?;
        let redirect_rules =
            serde_json::to_string(&obj.spec.tunnel.redirect_rules).unwrap_or_else(|_| "[]".into());

        let workload = NodeWorkloadSpec {
            name: workload_name.clone(),
            namespace: namespace.clone(),
            mode: "tunnel-proxy".into(),
            replicas: 1,
            labels: workload_labels(&workload_name, "tunnel"),
            proxy_class,
            extra_env: vec![
                EnvVar {
                    name: "TUNNET_TUNNEL_PROTOCOL".into(),
                    value: Some(obj.spec.tunnel.protocol.clone()),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_TUNNEL_SUBDOMAIN".into(),
                    value: obj.spec.tunnel.subdomain.clone(),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_TUNNEL_CUSTOM_DOMAIN".into(),
                    value: obj.spec.tunnel.custom_domain.clone(),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_TUNNEL_RELAY_URL".into(),
                    value: obj.spec.tunnel.relay_url.clone(),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_BACKEND_ADDR".into(),
                    value: Some(format!("{backend}:{}", obj.spec.service.port)),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_TUNNEL_REDIRECT_RULES".into(),
                    value: Some(redirect_rules),
                    ..Default::default()
                },
            ],
        };

        let labels: HashMap<String, String> = HashMap::new();
        reconcile_node_workload(
            &ctx,
            &creds,
            &workload,
            network_id,
            "k8s-tunnel",
            Some(&labels),
            None,
        )
        .await?;

        let public_url = public_url_from_spec(&obj);
        let status = TunnetTunnelStatus {
            conditions: vec![ready_condition("TunnelReady", true, None)],
            public_url: Some(public_url.clone()),
            custom_domain_verified: obj.spec.tunnel.custom_domain.as_ref().map(|_| false),
            observed_generation: Some(set_observed_generation(generation)),
        };
        patch_status::<TunnetTunnel>(ctx.client.clone(), Some(&namespace), &name, &status).await?;

        Ok(Action::requeue(Duration::from_secs(300)))
    }
    .await;

    if let Err(e) = &result {
        let status = TunnetTunnelStatus {
            conditions: vec![ready_condition("TunnelReady", false, Some(e.to_string()))],
            observed_generation: Some(set_observed_generation(generation)),
            ..Default::default()
        };
        let _ = patch_status::<TunnetTunnel>(ctx.client.clone(), Some(&namespace), &name, &status)
            .await;
    }

    result
}

fn public_url_from_spec(obj: &TunnetTunnel) -> String {
    if let Some(domain) = &obj.spec.tunnel.custom_domain {
        return format!("{}://{}", obj.spec.tunnel.protocol, domain);
    }
    if let Some(sub) = &obj.spec.tunnel.subdomain {
        let relay = obj
            .spec
            .tunnel
            .relay_url
            .as_deref()
            .unwrap_or("https://relay.tunnet.io");
        let host = relay
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        return format!("{}://{sub}.{host}", obj.spec.tunnel.protocol);
    }
    "pending".into()
}

async fn cleanup(
    obj: Arc<TunnetTunnel>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    if obj.spec.proxy_group_ref.is_some() {
        return Ok(Action::await_change());
    }
    let name = obj.name_any();
    let namespace = obj
        .namespace()
        .unwrap_or_else(|| ctx.operator_namespace.clone());
    let workload_name = format!("tnt-{namespace}-{name}");
    let creds =
        load_credentials_for_crd(&ctx, obj.spec.auth_secret_ref.as_ref(), None, None).await?;
    let network_id = obj.spec.network_ref.network_id()?;
    let pairs = vec![(network_id, name.clone())];

    cleanup_node_workload(&ctx, &creds, &namespace, &workload_name, 1, &pairs).await?;
    Ok(Action::await_change())
}

async fn resolve_service_cluster_ip(
    ctx: &OperatorContext,
    namespace: &str,
    name: &str,
) -> anyhow::Result<String> {
    let api: Api<Service> = Api::namespaced(ctx.client.clone(), namespace);
    let svc = api.get(name).await?;
    svc.spec
        .and_then(|s| s.cluster_ip)
        .filter(|ip| ip != "None")
        .ok_or_else(|| anyhow::anyhow!("service {namespace}/{name} has no ClusterIP"))
}
