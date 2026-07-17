use std::path::PathBuf;
use std::time::Duration;

use anyhow::Context;
use iroh::{Endpoint, EndpointId};
use iroh_gossip::net::Gossip;
use iroh_gossip::{TopicId, api::Event};
use serde::{Deserialize, Serialize};

use futures_util::StreamExt;

#[derive(Serialize, Deserialize)]
struct Beacon {
    endpoint_id: String,
    hostname: String,
    agent_version: String,
    ts: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mesh_ip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ssh_host_key: Option<String>,
}

pub struct GossipPresenceArgs {
    pub endpoint: Endpoint,
    pub gossip: Gossip,
    pub topic_hex: String,
    pub bootstrap: Vec<EndpointId>,
    pub self_hostname: String,
    pub mesh_ip: Option<String>,
    pub ssh_host_key: Option<String>,
    pub state_dir: PathBuf,
    pub dns_suffix: String,
}

pub async fn spawn(args: GossipPresenceArgs) -> anyhow::Result<()> {
    let GossipPresenceArgs {
        endpoint,
        gossip,
        topic_hex,
        bootstrap,
        self_hostname,
        mesh_ip,
        ssh_host_key,
        state_dir,
        dns_suffix,
    } = args;

    let topic_bytes = hex::decode(&topic_hex).context("topic hex")?;
    let arr: [u8; 32] = topic_bytes
        .as_slice()
        .try_into()
        .context("topic must be 32 bytes")?;
    let topic = TopicId::from_bytes(arr);

    let self_id = format!("{}", endpoint.id());
    let (sender, mut receiver) = gossip.subscribe(topic, bootstrap).await?.split();

    let recv_dir = state_dir.clone();
    let recv_suffix = dns_suffix.clone();
    let recv = tokio::spawn(async move {
        while let Some(ev) = receiver.next().await {
            match ev {
                Ok(Event::Received(msg)) => {
                    if let Ok(beacon) = serde_json::from_slice::<Beacon>(&msg.content) {
                        tracing::debug!(
                            peer = %beacon.endpoint_id,
                            host = %beacon.hostname,
                            "gossip presence"
                        );
                        if let Some(key) = beacon.ssh_host_key.as_deref().filter(|k| !k.is_empty())
                        {
                            let fqdn = format!("{}.{}", beacon.hostname, recv_suffix);
                            let mut hosts = vec![beacon.hostname.as_str(), fqdn.as_str()];
                            if let Some(ip) = beacon.mesh_ip.as_deref() {
                                hosts.insert(0, ip);
                            }
                            if let Err(e) = tunnet_core::known_hosts::upsert_known_hosts_entry(
                                &recv_dir, &hosts, key,
                            ) {
                                tracing::debug!(?e, "gossip known_hosts upsert skipped");
                            }
                        }
                    }
                }
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!(?e, "gossip event error");
                    break;
                }
            }
        }
    });

    let publisher_id = self_id.clone();
    let publish = tokio::spawn(async move {
        // Hold Gossip for the publisher lifetime.
        let _gossip = gossip;
        let mut ticker = tokio::time::interval(Duration::from_secs(30));
        loop {
            ticker.tick().await;
            let b = Beacon {
                endpoint_id: publisher_id.clone(),
                hostname: self_hostname.clone(),
                agent_version: env!("CARGO_PKG_VERSION").into(),
                ts: chrono::Utc::now().timestamp(),
                mesh_ip: mesh_ip.clone(),
                ssh_host_key: ssh_host_key.clone(),
            };
            let Ok(bytes) = serde_json::to_vec(&b) else {
                continue;
            };
            if let Err(e) = sender.broadcast(bytes.into()).await {
                tracing::debug!(?e, "gossip broadcast skipped");
                break;
            }
        }
    });

    tokio::select! {
        _ = recv => tracing::debug!("gossip receiver exited"),
        _ = publish => tracing::debug!("gossip publisher exited"),
    }
    Ok(())
}
