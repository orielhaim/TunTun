use std::sync::Arc;
use std::time::Duration;

use k8s_openapi::api::coordination::v1::Lease;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::MicroTime;
use kube::api::{Patch, PatchParams, PostParams};
use kube::{Api, Client};
use uuid::Uuid;

use crate::OperatorContext;

const LEASE_NAME: &str = "tunnet-operator-leader";

fn now_micro() -> MicroTime {
    // k8s-openapi 0.28 uses jiff::Timestamp inside MicroTime.
    MicroTime(k8s_openapi::jiff::Timestamp::now())
}

pub async fn run_as_leader<F, Fut>(ctx: Arc<OperatorContext>, run: F) -> anyhow::Result<()>
where
    F: FnOnce(Arc<OperatorContext>) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<()>>,
{
    let holder_id = format!("{}-{}", ctx.pod_name, Uuid::new_v4());
    let leases: Api<Lease> = Api::namespaced(ctx.client.clone(), &ctx.operator_namespace);

    loop {
        match try_acquire(&leases, &holder_id, &ctx.pod_name).await {
            Ok(true) => {
                tracing::info!(holder = %holder_id, "acquired leader lease");
                let renew = leases.clone();
                let holder = holder_id.clone();
                let pod = ctx.pod_name.clone();
                let renew_task = tokio::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_secs(10));
                    loop {
                        interval.tick().await;
                        if renew_lease(&renew, &holder, &pod).await.is_err() {
                            break;
                        }
                    }
                });

                let result = run(ctx.clone()).await;
                renew_task.abort();
                release_lease(&leases, &holder_id).await.ok();
                result?;
                break;
            }
            Ok(false) => {
                tracing::debug!("not leader, waiting");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
            Err(e) => {
                tracing::warn!(error = %e, "leader election error");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }

    Ok(())
}

async fn try_acquire(leases: &Api<Lease>, holder_id: &str, pod_name: &str) -> anyhow::Result<bool> {
    let lease = match leases.get(LEASE_NAME).await {
        Ok(l) => l,
        Err(kube::Error::Api(e)) if e.is_not_found() => {
            let lease = Lease {
                metadata: kube::api::ObjectMeta {
                    name: Some(LEASE_NAME.into()),
                    ..Default::default()
                },
                spec: Some(k8s_openapi::api::coordination::v1::LeaseSpec {
                    holder_identity: Some(holder_id.into()),
                    lease_duration_seconds: Some(30),
                    acquire_time: Some(now_micro()),
                    renew_time: Some(now_micro()),
                    ..Default::default()
                }),
            };
            leases.create(&PostParams::default(), &lease).await?;
            return Ok(true);
        }
        Err(e) => return Err(e.into()),
    };

    let spec = lease.spec.as_ref();
    let holder = spec
        .and_then(|s| s.holder_identity.as_deref())
        .unwrap_or("");
    let lease_duration = spec.and_then(|s| s.lease_duration_seconds).unwrap_or(30) as i64;
    let expired = spec
        .and_then(|s| s.renew_time.as_ref())
        .map(|t| {
            let age = k8s_openapi::jiff::Timestamp::now()
                .duration_since(t.0)
                .as_secs();
            age > lease_duration
        })
        .unwrap_or(true);

    if holder == holder_id || holder.is_empty() || expired {
        renew_lease(leases, holder_id, pod_name).await?;
        return Ok(true);
    }

    Ok(false)
}

async fn renew_lease(leases: &Api<Lease>, holder_id: &str, pod_name: &str) -> anyhow::Result<()> {
    let now = now_micro();
    let patch = serde_json::json!({
        "spec": {
            "holderIdentity": holder_id,
            "leaseDurationSeconds": 30,
            "renewTime": now,
            "acquireTime": now,
        }
    });
    let pp = PatchParams::default();
    let _ = pod_name;
    leases.patch(LEASE_NAME, &pp, &Patch::Merge(&patch)).await?;
    Ok(())
}

async fn release_lease(leases: &Api<Lease>, holder_id: &str) -> anyhow::Result<()> {
    let patch = serde_json::json!({
        "spec": {
            "holderIdentity": null,
            "renewTime": now_micro(),
        }
    });
    let _ = holder_id;
    leases
        .patch(LEASE_NAME, &PatchParams::default(), &Patch::Merge(&patch))
        .await?;
    Ok(())
}

pub async fn ensure_lease_namespace(client: Client, namespace: &str) -> anyhow::Result<()> {
    let api: Api<k8s_openapi::api::core::v1::Namespace> = Api::all(client);
    match api.get(namespace).await {
        Ok(_) => Ok(()),
        Err(kube::Error::Api(e)) if e.is_not_found() => {
            let ns = k8s_openapi::api::core::v1::Namespace {
                metadata: kube::api::ObjectMeta {
                    name: Some(namespace.to_string()),
                    ..Default::default()
                },
                ..Default::default()
            };
            api.create(&PostParams::default(), &ns).await?;
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}
