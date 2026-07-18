mod common;
mod connector;
mod egress;
mod ingress;
mod proxyclass;
mod proxygroup;
mod tunnel;

use std::sync::Arc;

use futures::StreamExt;
use kube::Api;
use kube::runtime::Controller;

use crate::OperatorContext;
use crate::crds::{
    TunnetConnector, TunnetEgress, TunnetIngress, TunnetProxyClass, TunnetProxyGroup, TunnetTunnel,
};

use self::common::error_policy;

pub async fn spawn_all(ctx: Arc<OperatorContext>) -> anyhow::Result<()> {
    let client = ctx.client.clone();
    let watcher_config = kube::runtime::watcher::Config::default();

    let connector = Controller::new(
        Api::<TunnetConnector>::all(client.clone()),
        watcher_config.clone(),
    )
    .shutdown_on_signal()
    .run(connector::reconcile, error_policy, ctx.clone());

    let ingress = Controller::new(
        Api::<TunnetIngress>::all(client.clone()),
        watcher_config.clone(),
    )
    .shutdown_on_signal()
    .run(ingress::reconcile, error_policy, ctx.clone());

    let tunnel = Controller::new(
        Api::<TunnetTunnel>::all(client.clone()),
        watcher_config.clone(),
    )
    .shutdown_on_signal()
    .run(tunnel::reconcile, error_policy, ctx.clone());

    let egress = Controller::new(
        Api::<TunnetEgress>::all(client.clone()),
        watcher_config.clone(),
    )
    .shutdown_on_signal()
    .run(egress::reconcile, error_policy, ctx.clone());

    let proxygroup = Controller::new(
        Api::<TunnetProxyGroup>::all(client.clone()),
        watcher_config.clone(),
    )
    .shutdown_on_signal()
    .run(proxygroup::reconcile, error_policy, ctx.clone());

    let proxyclass = Controller::new(Api::<TunnetProxyClass>::all(client.clone()), watcher_config)
        .shutdown_on_signal()
        .run(proxyclass::reconcile, error_policy, ctx.clone());

    let h1 = tokio::spawn(connector.for_each(|_| async {}));
    let h2 = tokio::spawn(ingress.for_each(|_| async {}));
    let h3 = tokio::spawn(tunnel.for_each(|_| async {}));
    let h4 = tokio::spawn(egress.for_each(|_| async {}));
    let h5 = tokio::spawn(proxygroup.for_each(|_| async {}));
    let h6 = tokio::spawn(proxyclass.for_each(|_| async {}));

    let (r1, r2, r3, r4, r5, r6) = tokio::join!(h1, h2, h3, h4, h5, h6);
    r1?;
    r2?;
    r3?;
    r4?;
    r5?;
    r6?;

    Ok(())
}
