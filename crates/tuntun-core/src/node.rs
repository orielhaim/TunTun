use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use arc_swap::ArcSwap;
use iroh::{Endpoint, SecretKey, endpoint::presets};
use tuntun_common::TUNNEL_ALPN;

use crate::acl::{AclEngine, SelfIdentity};
use crate::control::{SignedClient, basic_metadata};
use crate::identity::AgentIdentity;
use crate::iroh_pool::ConnPool;
use crate::routing::RoutingTable;
use crate::state::{PersistedState, StatePaths, load_snapshot_cache, save_snapshot_cache};
use crate::stream::TUNNEL_STREAM_ALPN;
use crate::sync::{
    apply_membership, membership_for_network, spawn_poll_fallback, spawn_ws_processor,
};

#[derive(Clone)]
pub struct CoreNodeConfig {
    pub hostname: String,
    pub agent_version: &'static str,
    pub poll_secs: u64,
    pub advertise_datagram_alpn: bool,
    pub kind: &'static str, // "agent" | "sdk"
}

impl Default for CoreNodeConfig {
    fn default() -> Self {
        Self {
            hostname: "tuntun-node".into(),
            agent_version: env!("CARGO_PKG_VERSION"),
            poll_secs: 30,
            advertise_datagram_alpn: false,
            kind: "sdk",
        }
    }
}

#[derive(Clone)]
pub struct CoreNode {
    pub identity: AgentIdentity,
    pub persisted: PersistedState,
    pub endpoint: Endpoint,
    pub pool: ConnPool,
    pub routes: RoutingTable,
    pub acl: AclEngine,
    pub version: Arc<ArcSwap<u64>>,
    pub self_ipv4: std::net::Ipv4Addr,
    pub paths: StatePaths,
}

impl CoreNode {
    pub async fn bootstrap(
        identity: AgentIdentity,
        persisted: PersistedState,
        paths: StatePaths,
        cfg: CoreNodeConfig,
    ) -> anyhow::Result<Self> {
        let mut alpns: Vec<Vec<u8>> = vec![TUNNEL_STREAM_ALPN.to_vec()];
        if cfg.advertise_datagram_alpn {
            alpns.push(TUNNEL_ALPN.to_vec());
        }

        let secret = SecretKey::from_bytes(&identity.secret_bytes);
        let endpoint = Endpoint::builder(presets::N0)
            .secret_key(secret)
            .alpns(alpns)
            .bind()
            .await
            .context("bind iroh endpoint")?;

        let my_id_hex = format!("{}", endpoint.id());
        debug_assert_eq!(my_id_hex, identity.endpoint_id_hex());

        match tokio::time::timeout(Duration::from_secs(10), endpoint.online()).await {
            Ok(()) => tracing::info!("endpoint online"),
            Err(_) => tracing::warn!("timed out waiting for relay; continuing"),
        }

        let signed = SignedClient::new(
            persisted.control_url.clone(),
            my_id_hex.clone(),
            identity.signing_key.clone(),
        )?;

        let meta = basic_metadata(&cfg.hostname, cfg.agent_version, cfg.kind);
        let snapshot = match signed
            .register(&cfg.hostname, cfg.agent_version, Some(meta))
            .await
        {
            Ok(s) => {
                save_snapshot_cache(&paths, &s).ok();
                s
            }
            Err(e) => {
                tracing::warn!(?e, "register failed; falling back to cache");
                load_snapshot_cache(&paths).context("no cache")?
            }
        };

        let membership = membership_for_network(&snapshot, persisted.network_id)?.clone();
        let routes = RoutingTable::new();
        let version = Arc::new(ArcSwap::from_pointee(snapshot.version));
        let acl = AclEngine::new(
            SelfIdentity {
                endpoint_hex: my_id_hex.clone(),
                ip: membership.assigned_ipv4,
                tags: vec![],
                network: persisted.network_name.clone(),
            },
            routes.clone(),
            membership.policy.clone(),
        );
        apply_membership(&membership, &routes, &acl, &version, snapshot.version);

        // Sync loops.
        let ws = crate::ws_client::spawn(
            persisted.control_url.clone(),
            my_id_hex.clone(),
            identity.signing_key.clone(),
        );
        spawn_ws_processor(
            ws,
            routes.clone(),
            acl.clone(),
            version.clone(),
            paths.clone_paths(),
            persisted.network_id,
            cfg.agent_version,
        );
        spawn_poll_fallback(
            signed,
            version.clone(),
            cfg.poll_secs,
            routes.clone(),
            acl.clone(),
            persisted.network_id,
        );

        let pool = ConnPool::new(endpoint.clone(), TUNNEL_STREAM_ALPN);

        Ok(Self {
            identity,
            persisted,
            endpoint,
            pool,
            routes,
            acl,
            version,
            self_ipv4: membership.assigned_ipv4,
            paths,
        })
    }

    pub fn endpoint_id_hex(&self) -> String {
        self.identity.endpoint_id_hex()
    }

    pub async fn shutdown(&self) {
        self.endpoint.close().await;
    }
}

impl StatePaths {
    pub fn clone_paths(&self) -> StatePaths {
        StatePaths {
            dir: self.dir.clone(),
        }
    }
}
