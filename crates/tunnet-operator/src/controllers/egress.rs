use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use k8s_openapi::api::core::v1::{EnvVar, Service};
use kube::api::PostParams;
use kube::runtime::controller::Action;
use kube::{Api, ResourceExt};

use crate::OperatorContext;
use crate::controllers::common::{
    ReconcileError, cleanup_node_workload, load_credentials_for_crd, load_proxy_class,
    patch_status, ready_condition, reconcile_node_workload, run_with_finalizer,
    set_observed_generation, workload_labels,
};
use crate::crds::{TunnetEgress, TunnetEgressStatus};
use crate::resources::NodeWorkloadSpec;

pub async fn reconcile(
    obj: Arc<TunnetEgress>,
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
    obj: Arc<TunnetEgress>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    let name = obj.name_any();
    let namespace = obj
        .namespace()
        .unwrap_or_else(|| ctx.operator_namespace.clone());
    let generation = obj.metadata.generation.unwrap_or(0);

    let result: Result<Action, ReconcileError> = async {
        if obj.spec.proxy_group_ref.is_some() {
            let status = TunnetEgressStatus {
                conditions: vec![ready_condition(
                    "EgressReady",
                    true,
                    Some("delegated to proxyGroup".into()),
                )],
                target_mesh_ip: obj.spec.target.mesh_ip.clone(),
                observed_generation: Some(set_observed_generation(generation)),
                ..Default::default()
            };
            patch_status::<TunnetEgress>(ctx.client.clone(), Some(&namespace), &name, &status)
                .await?;
            return Ok(Action::requeue(Duration::from_secs(300)));
        }

        let creds =
            load_credentials_for_crd(&ctx, obj.spec.auth_secret_ref.as_ref(), None, None).await?;
        let network_id = obj.spec.network_ref.network_id()?;

        let workload_name = format!("tne-{namespace}-{name}");
        let proxy_class = load_proxy_class(&ctx, None).await?;

        let target_addr = obj
            .spec
            .target
            .mesh_ip
            .clone()
            .or_else(|| obj.spec.target.hostname.clone())
            .unwrap_or_else(|| "mesh-peer".into());

        let workload = NodeWorkloadSpec {
            name: workload_name.clone(),
            namespace: namespace.clone(),
            mode: "egress-proxy".into(),
            replicas: 1,
            labels: workload_labels(&workload_name, "egress"),
            proxy_class,
            extra_env: vec![
                EnvVar {
                    name: "TUNNET_EGRESS_TARGET".into(),
                    value: Some(format!("{}:{}", target_addr, obj.spec.target.port)),
                    ..Default::default()
                },
                EnvVar {
                    name: "TUNNET_EGRESS_LISTEN_PORT".into(),
                    value: Some(obj.spec.cluster_service.port.to_string()),
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
            "k8s-egress",
            Some(&labels),
            None,
        )
        .await?;

        let cluster_ip = ensure_cluster_service(&ctx, &namespace, &obj).await?;

        let status = TunnetEgressStatus {
            conditions: vec![ready_condition("EgressReady", true, None)],
            target_mesh_ip: obj.spec.target.mesh_ip.clone(),
            cluster_service_ip: Some(cluster_ip),
            observed_generation: Some(set_observed_generation(generation)),
        };
        patch_status::<TunnetEgress>(ctx.client.clone(), Some(&namespace), &name, &status).await?;

        Ok(Action::requeue(Duration::from_secs(300)))
    }
    .await;

    if let Err(e) = &result {
        let status = TunnetEgressStatus {
            conditions: vec![ready_condition("EgressReady", false, Some(e.to_string()))],
            observed_generation: Some(set_observed_generation(generation)),
            ..Default::default()
        };
        let _ = patch_status::<TunnetEgress>(ctx.client.clone(), Some(&namespace), &name, &status)
            .await;
    }

    result
}

async fn ensure_cluster_service(
    ctx: &OperatorContext,
    namespace: &str,
    obj: &TunnetEgress,
) -> anyhow::Result<String> {
    let api: Api<Service> = Api::namespaced(ctx.client.clone(), namespace);
    let svc_name = &obj.spec.cluster_service.name;
    if let Ok(existing) = api.get(svc_name).await {
        return Ok(existing
            .spec
            .and_then(|s| s.cluster_ip)
            .unwrap_or_else(|| "pending".into()));
    }

    let selector = workload_labels(&format!("tne-{namespace}-{}", obj.name_any()), "egress");
    let svc = Service {
        metadata: kube::api::ObjectMeta {
            name: Some(svc_name.clone()),
            namespace: Some(namespace.to_string()),
            labels: Some(selector.clone()),
            ..Default::default()
        },
        spec: Some(k8s_openapi::api::core::v1::ServiceSpec {
            selector: Some(selector),
            ports: Some(vec![k8s_openapi::api::core::v1::ServicePort {
                port: obj.spec.cluster_service.port as i32,
                target_port: Some(
                    k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(
                        obj.spec.cluster_service.port as i32,
                    ),
                ),
                ..Default::default()
            }]),
            ..Default::default()
        }),
        ..Default::default()
    };

    api.create(&PostParams::default(), &svc).await?;
    Ok("pending".into())
}

async fn cleanup(
    obj: Arc<TunnetEgress>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    if obj.spec.proxy_group_ref.is_some() {
        return Ok(Action::await_change());
    }
    let name = obj.name_any();
    let namespace = obj
        .namespace()
        .unwrap_or_else(|| ctx.operator_namespace.clone());
    let workload_name = format!("tne-{namespace}-{name}");
    let creds =
        load_credentials_for_crd(&ctx, obj.spec.auth_secret_ref.as_ref(), None, None).await?;
    let network_id = obj.spec.network_ref.network_id()?;
    let pairs = vec![(network_id, name.clone())];

    cleanup_node_workload(&ctx, &creds, &namespace, &workload_name, 1, &pairs).await?;

    let api: Api<Service> = Api::namespaced(ctx.client.clone(), &namespace);
    let _ = api
        .delete(&obj.spec.cluster_service.name, &Default::default())
        .await;

    Ok(Action::await_change())
}
