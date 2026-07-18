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
use crate::crds::{TunnetIngress, TunnetIngressStatus};
use crate::resources::NodeWorkloadSpec;

pub async fn reconcile(
    obj: Arc<TunnetIngress>,
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
    obj: Arc<TunnetIngress>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    let name = obj.name_any();
    let namespace = obj
        .namespace()
        .unwrap_or_else(|| ctx.operator_namespace.clone());
    let generation = obj.metadata.generation.unwrap_or(0);

    let result: Result<Action, ReconcileError> = async {
        if obj.spec.proxy_group_ref.is_some() {
            let status = TunnetIngressStatus {
                conditions: vec![ready_condition(
                    "IngressReady",
                    true,
                    Some("delegated to proxyGroup".into()),
                )],
                mesh_hostname: Some(format!(
                    "{}.{}.tunnet",
                    obj.spec.serve.hostname,
                    obj.spec.network_ref.id.clone().unwrap_or_default()
                )),
                observed_generation: Some(set_observed_generation(generation)),
                ..Default::default()
            };
            patch_status::<TunnetIngress>(ctx.client.clone(), Some(&namespace), &name, &status)
                .await?;
            return Ok(Action::requeue(Duration::from_secs(300)));
        }

        let creds =
            load_credentials_for_crd(&ctx, obj.spec.auth_secret_ref.as_ref(), None, None).await?;
        let network_id = obj.spec.network_ref.network_id()?;

        let backend = resolve_service_cluster_ip(&ctx, &namespace, &obj.spec.service.name).await?;
        let workload_name = format!("tni-{namespace}-{name}");
        let proxy_class = load_proxy_class(&ctx, None).await?;

        let mesh_hostname = format!("{}.{}.tunnet", obj.spec.serve.hostname, network_id);

        let workload = NodeWorkloadSpec {
            name: workload_name.clone(),
            namespace: namespace.clone(),
            mode: "ingress-proxy".into(),
            replicas: 1,
            labels: workload_labels(&workload_name, "ingress"),
            proxy_class,
            extra_env: vec![
                EnvVar {
                    name: "TUNNET_SERVE_HOSTNAME".into(),
                    value: Some(obj.spec.serve.hostname.clone()),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_SERVE_PROTOCOL".into(),
                    value: Some(obj.spec.serve.protocol.clone()),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_BACKEND_ADDR".into(),
                    value: Some(format!("{backend}:{}", obj.spec.service.port)),
                    ..Default::default()
                },
            ],
        };

        let labels: HashMap<String, String> = HashMap::new();
        let nodes = reconcile_node_workload(
            &ctx,
            &creds,
            &workload,
            network_id,
            "k8s-ingress",
            Some(&labels),
            obj.spec.serve.acl.as_ref().map(|a| a.allow_tags.as_slice()),
        )
        .await?;

        let mesh_ip = nodes.first().map(|n| n.mesh_ip.clone());

        let status = TunnetIngressStatus {
            conditions: vec![ready_condition("IngressReady", true, None)],
            mesh_hostname: Some(mesh_hostname),
            mesh_ip,
            observed_generation: Some(set_observed_generation(generation)),
        };
        patch_status::<TunnetIngress>(ctx.client.clone(), Some(&namespace), &name, &status).await?;

        Ok(Action::requeue(Duration::from_secs(300)))
    }
    .await;

    if let Err(e) = &result {
        let status = TunnetIngressStatus {
            conditions: vec![ready_condition("IngressReady", false, Some(e.to_string()))],
            observed_generation: Some(set_observed_generation(generation)),
            ..Default::default()
        };
        let _ = patch_status::<TunnetIngress>(ctx.client.clone(), Some(&namespace), &name, &status)
            .await;
    }

    result
}

async fn cleanup(
    obj: Arc<TunnetIngress>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    if obj.spec.proxy_group_ref.is_some() {
        return Ok(Action::await_change());
    }
    let name = obj.name_any();
    let namespace = obj
        .namespace()
        .unwrap_or_else(|| ctx.operator_namespace.clone());
    let workload_name = format!("tni-{namespace}-{name}");
    let creds =
        load_credentials_for_crd(&ctx, obj.spec.auth_secret_ref.as_ref(), None, None).await?;
    let network_id = obj.spec.network_ref.network_id()?;
    let pairs = obj
        .status
        .as_ref()
        .map(|_| vec![(network_id, obj.name_any())])
        .unwrap_or_default();

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
