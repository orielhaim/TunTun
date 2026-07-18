use std::collections::BTreeMap;

use anyhow::Context;
use k8s_openapi::api::apps::v1::{StatefulSet, StatefulSetSpec};
use k8s_openapi::api::core::v1::{
    Container, ContainerPort, EnvVar, PodSecurityContext, PodSpec, PodTemplateSpec, Secret,
    SecretVolumeSource, Volume, VolumeMount,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::LabelSelector;
use kube::api::{ObjectMeta, Patch, PatchParams};
use kube::{Api, ResourceExt};
use tunnet_core::PersistedState;

use crate::OperatorContext;
use crate::crds::TunnetProxyClass;
use crate::enroll::EnrolledNode;

pub const IDENTITY_SECRET_KEY: &str = "identity.hex";
pub const STATE_SECRET_KEY: &str = "state.json";

#[derive(Clone, Debug)]
pub struct NodeWorkloadSpec {
    pub name: String,
    pub namespace: String,
    pub mode: String,
    pub replicas: u32,
    pub labels: BTreeMap<String, String>,
    pub proxy_class: Option<TunnetProxyClass>,
    pub extra_env: Vec<EnvVar>,
}

pub fn node_secret_name(workload: &str, ordinal: u32) -> String {
    format!("{workload}-node-{ordinal}")
}

pub fn statefulset_name(workload: &str) -> String {
    workload.to_string()
}

pub async fn load_node_secret(
    ctx: &OperatorContext,
    namespace: &str,
    secret_name: &str,
) -> anyhow::Result<Option<EnrolledNode>> {
    use tunnet_core::{AgentIdentity, ManagedState, PersistedState};

    let secrets: Api<Secret> = Api::namespaced(ctx.client.clone(), namespace);
    let secret = match secrets.get(secret_name).await {
        Ok(s) => s,
        Err(kube::Error::Api(e)) if e.is_not_found() => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let data = secret.data.unwrap_or_default();

    let identity_hex = data
        .get(IDENTITY_SECRET_KEY)
        .map(|b| String::from_utf8_lossy(&b.0).into_owned())
        .ok_or_else(|| anyhow::anyhow!("secret {secret_name} missing {IDENTITY_SECRET_KEY}"))?;
    let identity_bytes = hex::decode(identity_hex.trim())
        .with_context(|| format!("decode identity in {secret_name}"))?;
    let identity_arr: [u8; 32] = identity_bytes
        .as_slice()
        .try_into()
        .map_err(|_| anyhow::anyhow!("identity in {secret_name} must be 32 bytes"))?;
    let identity = AgentIdentity::from_bytes(identity_arr);

    let state_raw = data
        .get(STATE_SECRET_KEY)
        .ok_or_else(|| anyhow::anyhow!("secret {secret_name} missing {STATE_SECRET_KEY}"))?;
    let persisted: PersistedState =
        serde_json::from_slice(&state_raw.0).context("parse state.json")?;

    let (network_id, network_name, organization_id) = match &persisted {
        PersistedState::Managed(ManagedState {
            network_id,
            network_name,
            organization_id,
            ..
        }) => (*network_id, network_name.clone(), organization_id.clone()),
        _ => anyhow::bail!("secret {secret_name} is not managed state"),
    };

    let endpoint_id = data
        .get("endpointId")
        .map(|b| String::from_utf8_lossy(&b.0).into_owned())
        .unwrap_or_else(|| identity.endpoint_id_hex());
    let hostname = data
        .get("hostname")
        .map(|b| String::from_utf8_lossy(&b.0).into_owned())
        .unwrap_or_default();
    let mesh_ip = data
        .get("meshIp")
        .map(|b| String::from_utf8_lossy(&b.0).into_owned())
        .unwrap_or_else(|| "0.0.0.0".into());

    Ok(Some(EnrolledNode {
        identity,
        endpoint_id,
        hostname,
        network_id,
        network_name,
        organization_id,
        mesh_ip,
        persisted,
    }))
}

pub async fn upsert_node_secret(
    ctx: &OperatorContext,
    namespace: &str,
    secret_name: &str,
    node: &EnrolledNode,
    owner_labels: BTreeMap<String, String>,
) -> anyhow::Result<()> {
    let secrets: Api<Secret> = Api::namespaced(ctx.client.clone(), namespace);

    let mut labels = owner_labels;
    labels.insert("app.kubernetes.io/name".into(), "tunnet-kube-node".into());
    // K8s label values max 63 chars; endpoint ids are 64-char hex - keep a short prefix.
    let ep_label: String = node.endpoint_id.chars().take(63).collect();
    labels.insert("tunnet.io/endpoint-id".into(), ep_label);

    let state_json = serde_json::to_string(&node.persisted).context("serialize persisted state")?;

    let to_b64 =
        |s: &str| -> k8s_openapi::ByteString { k8s_openapi::ByteString(s.as_bytes().to_vec()) };

    let secret = Secret {
        metadata: ObjectMeta {
            name: Some(secret_name.to_string()),
            namespace: Some(namespace.to_string()),
            labels: Some(labels),
            annotations: Some(BTreeMap::from([(
                "tunnet.io/endpoint-id".into(),
                node.endpoint_id.clone(),
            )])),
            ..Default::default()
        },
        type_: Some("Opaque".into()),
        data: Some(BTreeMap::from([
            (
                IDENTITY_SECRET_KEY.into(),
                to_b64(&hex::encode(node.identity.secret_bytes)),
            ),
            (STATE_SECRET_KEY.into(), to_b64(&state_json)),
            ("endpointId".into(), to_b64(&node.endpoint_id)),
            ("hostname".into(), to_b64(&node.hostname)),
            ("meshIp".into(), to_b64(&node.mesh_ip)),
        ])),
        ..Default::default()
    };

    let pp = PatchParams::apply("tunnet-operator").force();
    secrets
        .patch(secret_name, &pp, &Patch::Apply(&secret))
        .await
        .map_err(|e| anyhow::anyhow!("apply node secret {namespace}/{secret_name}: {e:?}"))?;
    Ok(())
}

pub async fn delete_secret(
    ctx: &OperatorContext,
    namespace: &str,
    name: &str,
) -> anyhow::Result<()> {
    let secrets: Api<Secret> = Api::namespaced(ctx.client.clone(), namespace);
    match secrets.delete(name, &Default::default()).await {
        Ok(_) => Ok(()),
        Err(kube::Error::Api(e)) if e.is_not_found() => Ok(()),
        Err(e) => Err(e.into()),
    }
}

pub async fn upsert_statefulset(
    ctx: &OperatorContext,
    spec: &NodeWorkloadSpec,
) -> anyhow::Result<()> {
    let sts_api: Api<StatefulSet> = Api::namespaced(ctx.client.clone(), &spec.namespace);
    let sts = build_statefulset(ctx, spec);
    let name = sts.name_any();
    let pp = PatchParams::apply("tunnet-operator").force();
    sts_api
        .patch(&name, &pp, &Patch::Apply(&sts))
        .await
        .with_context(|| format!("apply statefulset {}/{}", spec.namespace, name))?;
    Ok(())
}

pub async fn delete_statefulset(
    ctx: &OperatorContext,
    namespace: &str,
    name: &str,
) -> anyhow::Result<()> {
    let sts_api: Api<StatefulSet> = Api::namespaced(ctx.client.clone(), namespace);
    match sts_api.delete(name, &Default::default()).await {
        Ok(_) => Ok(()),
        Err(kube::Error::Api(e)) if e.is_not_found() => Ok(()),
        Err(e) => Err(e.into()),
    }
}

pub fn build_statefulset(ctx: &OperatorContext, spec: &NodeWorkloadSpec) -> StatefulSet {
    let name = statefulset_name(&spec.name);
    let mut labels = spec.labels.clone();
    labels.insert("app.kubernetes.io/name".into(), "tunnet-kube-node".into());
    labels.insert("app.kubernetes.io/component".into(), spec.mode.clone());
    labels.insert("tunnet.io/workload".into(), spec.name.clone());

    let mut pod_labels = labels.clone();
    let mut pod_annotations = BTreeMap::new();
    let mut resources = None;
    let mut tolerations = Vec::new();
    let mut node_selector = BTreeMap::new();
    let mut image_pull_secrets = Vec::new();

    if let Some(pc) = &spec.proxy_class {
        pod_labels.extend(pc.spec.pod.labels.clone());
        pod_annotations.extend(pc.spec.pod.annotations.clone());
        resources = pc.spec.pod.resources.as_ref().map(|r| {
            let mut req = BTreeMap::new();
            for (k, v) in &r.requests {
                req.insert(k.clone(), Quantity(v.clone()));
            }
            let mut lim = BTreeMap::new();
            for (k, v) in &r.limits {
                lim.insert(k.clone(), Quantity(v.clone()));
            }
            k8s_openapi::api::core::v1::ResourceRequirements {
                requests: Some(req),
                limits: Some(lim),
                ..Default::default()
            }
        });
        tolerations = pc
            .spec
            .pod
            .tolerations
            .iter()
            .map(|t| k8s_openapi::api::core::v1::Toleration {
                key: Some(t.key.clone()),
                operator: Some(t.operator.clone()),
                value: t.value.clone(),
                effect: Some(t.effect.clone()),
                ..Default::default()
            })
            .collect();
        node_selector = pc.spec.pod.node_selector.clone();
        image_pull_secrets = pc
            .spec
            .pod
            .image_pull_secrets
            .iter()
            .map(|s| k8s_openapi::api::core::v1::LocalObjectReference {
                name: s.name.clone(),
            })
            .collect();
    }

    let metrics_port = spec
        .proxy_class
        .as_ref()
        .and_then(|pc| pc.spec.metrics.as_ref())
        .filter(|m| m.enabled)
        .map(|m| m.port)
        .unwrap_or(9090);

    let mut env = vec![
        EnvVar {
            name: "TUNNET_MODE".into(),
            value: Some(spec.mode.clone()),
            ..Default::default()
        },
        EnvVar {
            name: "TUNNET_STATE_DIR".into(),
            value: Some("/var/lib/tunnet".into()),
            ..Default::default()
        },
        EnvVar {
            name: "TUNNET_BOOTSTRAP_DIR".into(),
            value: Some("/var/run/tunnet".into()),
            ..Default::default()
        },
        EnvVar {
            name: "HOSTNAME".into(),
            value_from: Some(k8s_openapi::api::core::v1::EnvVarSource {
                field_ref: Some(k8s_openapi::api::core::v1::ObjectFieldSelector {
                    field_path: "metadata.name".into(),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    ];
    env.extend(spec.extra_env.clone());

    let container = Container {
        name: "tunnet-kube-node".into(),
        image: Some(ctx.kube_node_image.clone()),
        image_pull_policy: Some("Never".into()),
        env: Some(env),
        ports: Some(vec![
            ContainerPort {
                name: Some("health".into()),
                container_port: 8080,
                ..Default::default()
            },
            ContainerPort {
                name: Some("metrics".into()),
                container_port: metrics_port as i32,
                ..Default::default()
            },
        ]),
        volume_mounts: Some(vec![
            VolumeMount {
                name: "tunnet-state".into(),
                mount_path: "/var/lib/tunnet".into(),
                ..Default::default()
            },
            VolumeMount {
                name: "tunnet-bootstrap".into(),
                mount_path: "/var/run/tunnet".into(),
                read_only: Some(true),
                ..Default::default()
            },
        ]),
        resources,
        liveness_probe: Some(k8s_openapi::api::core::v1::Probe {
            http_get: Some(k8s_openapi::api::core::v1::HTTPGetAction {
                path: Some("/healthz".into()),
                port: k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(8080),
                ..Default::default()
            }),
            ..Default::default()
        }),
        readiness_probe: Some(k8s_openapi::api::core::v1::Probe {
            http_get: Some(k8s_openapi::api::core::v1::HTTPGetAction {
                path: Some("/readyz".into()),
                port: k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(8080),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    };

    let pod_spec = PodSpec {
        containers: vec![container],
        volumes: Some(vec![
            Volume {
                name: "tunnet-state".into(),
                empty_dir: Some(Default::default()),
                ..Default::default()
            },
            Volume {
                name: "tunnet-bootstrap".into(),
                secret: Some(SecretVolumeSource {
                    secret_name: Some(node_secret_name(&spec.name, 0)),
                    ..Default::default()
                }),
                ..Default::default()
            },
        ]),
        tolerations: if tolerations.is_empty() {
            None
        } else {
            Some(tolerations)
        },
        node_selector: if node_selector.is_empty() {
            None
        } else {
            Some(node_selector)
        },
        image_pull_secrets: if image_pull_secrets.is_empty() {
            None
        } else {
            Some(image_pull_secrets)
        },
        security_context: Some(PodSecurityContext::default()),
        host_aliases: host_gateway_aliases(),
        ..Default::default()
    };

    StatefulSet {
        metadata: ObjectMeta {
            name: Some(name.clone()),
            namespace: Some(spec.namespace.clone()),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(StatefulSetSpec {
            replicas: Some(spec.replicas as i32),
            service_name: Some(name),
            selector: LabelSelector {
                match_labels: Some(BTreeMap::from([(
                    "tunnet.io/workload".into(),
                    spec.name.clone(),
                )])),
                ..Default::default()
            },
            template: PodTemplateSpec {
                metadata: Some(ObjectMeta {
                    labels: Some(pod_labels),
                    annotations: if pod_annotations.is_empty() {
                        None
                    } else {
                        Some(pod_annotations)
                    },
                    ..Default::default()
                }),
                spec: Some(pod_spec),
            },
            ..Default::default()
        }),
        ..Default::default()
    }
}

/// Optional IPv4 host gateway for kind/Docker Desktop (TUNNET_HOST_GATEWAY).
fn host_gateway_aliases() -> Option<Vec<k8s_openapi::api::core::v1::HostAlias>> {
    let ip = std::env::var("TUNNET_HOST_GATEWAY").unwrap_or_else(|_| "192.168.65.254".into());
    if ip.is_empty() {
        return None;
    }
    Some(vec![k8s_openapi::api::core::v1::HostAlias {
        ip,
        hostnames: Some(vec![
            "host.docker.internal".into(),
            "gateway.docker.internal".into(),
        ]),
    }])
}

/// Build per-ordinal secret data for standalone single-replica workloads.
pub fn persisted_state_json(state: &PersistedState) -> anyhow::Result<String> {
    Ok(serde_json::to_string(state)?)
}
