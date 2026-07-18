use std::sync::Arc;
use std::time::Duration;

use kube::ResourceExt;
use kube::runtime::controller::Action;

use crate::OperatorContext;
use crate::controllers::common::{
    ReconcileError, patch_cluster_status, ready_condition, run_with_cluster_finalizer,
    set_observed_generation,
};
use crate::crds::{TunnetProxyClass, TunnetProxyClassStatus};

pub async fn reconcile(
    obj: Arc<TunnetProxyClass>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    run_with_cluster_finalizer(
        obj,
        ctx,
        |o, c| async move { apply(o, c).await },
        |o, _c| async move { cleanup(o).await },
    )
    .await
}

async fn apply(
    obj: Arc<TunnetProxyClass>,
    ctx: Arc<OperatorContext>,
) -> Result<Action, ReconcileError> {
    let name = obj.name_any();
    let generation = obj.metadata.generation.unwrap_or(0);

    let status = TunnetProxyClassStatus {
        conditions: vec![ready_condition("ProxyClassReady", true, None)],
        observed_generation: Some(set_observed_generation(generation)),
    };
    patch_cluster_status::<TunnetProxyClass>(ctx.client.clone(), &name, &status).await?;

    Ok(Action::requeue(Duration::from_secs(600)))
}

async fn cleanup(_obj: Arc<TunnetProxyClass>) -> Result<Action, ReconcileError> {
    Ok(Action::await_change())
}
