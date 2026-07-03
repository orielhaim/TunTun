use sqlx::PgPool;
use tuntun_common::{EndpointSnapshot, Ipv6PeerEntry, NetworkMembershipSnapshot, PeerEntry};
use uuid::Uuid;

use crate::pg_inet::{self, PgIp};

pub async fn build_endpoint_snapshot(
    pool: &PgPool,
    policy_key: &ed25519_dalek::SigningKey,
    endpoint_id: &str,
) -> anyhow::Result<EndpointSnapshot> {
    let endpoint_row: Option<(String, bool, i64)> = sqlx::query_as(
        "SELECT e.organization_id, e.ipv6_enabled, o.snapshot_version \
         FROM devices e \
         JOIN organization o ON o.id = e.organization_id \
         WHERE e.endpoint_id = $1",
    )
    .bind(endpoint_id)
    .fetch_optional(pool)
    .await?;

    let (organization_id, ipv6_enabled, org_version) =
        endpoint_row.ok_or_else(|| anyhow::anyhow!("endpoint not found"))?;
    let tenant_ipv6 = if ipv6_enabled {
        Some(tuntun_common::ipv6::derive_tenant_ipv6(endpoint_id)?)
    } else {
        None
    };

    let membership_rows: Vec<(Uuid, String, PgIp, i32, i64)> = sqlx::query_as(
        "SELECT nm.network_id, n.name, nm.assigned_ip::inet, n.mtu, n.version \
         FROM network_memberships nm \
         JOIN networks n ON n.id = nm.network_id \
         WHERE nm.endpoint_id = $1 AND nm.status = 'active'",
    )
    .bind(endpoint_id)
    .fetch_all(pool)
    .await?;

    let mut memberships = Vec::with_capacity(membership_rows.len());
    for (network_id, network_name, assigned_ip, mtu, network_version) in membership_rows {
        let assigned_ipv4 = pg_inet::to_ipv4_addr(assigned_ip)?;
        let prefix = network_prefix(pool, network_id).await?;
        let ipv4_peers = load_ipv4_peers(pool, network_id, endpoint_id, &network_name).await?;
        let policy = crate::policy_store::load_network_bundle(
            pool,
            policy_key,
            network_id,
            network_version as u64,
        )
        .await?;
        let bootstrap = ipv4_peers
            .iter()
            .take(5)
            .map(|p| p.endpoint_id.clone())
            .collect();
        let gossip_topic_hex = hex::encode(blake3::hash(network_id.as_bytes()).as_bytes());
        memberships.push(NetworkMembershipSnapshot {
            network_id,
            network_name,
            assigned_ipv4,
            prefix,
            mtu: mtu as u16,
            ipv4_peers,
            policy,
            gossip_bootstrap: bootstrap,
            gossip_topic_hex,
            version: network_version as u64,
        });
    }

    let ipv6_peers = if ipv6_enabled {
        load_ipv6_peers(pool, &organization_id, endpoint_id).await?
    } else {
        vec![]
    };

    let org_policy = crate::policy_store::load_org_bundle(
        pool,
        policy_key,
        &organization_id,
        org_version as u64,
    )
    .await?;

    Ok(EndpointSnapshot {
        ipv6_enabled,
        tenant_ipv6,
        memberships,
        ipv6_peers,
        org_policy,
        version: org_version as u64,
    })
}

async fn network_prefix(pool: &PgPool, network_id: Uuid) -> anyhow::Result<u8> {
    let (cidr,): (PgIp,) = sqlx::query_as("SELECT cidr FROM networks WHERE id = $1")
        .bind(network_id)
        .fetch_one(pool)
        .await?;
    match pg_inet::to_ipnet(cidr)? {
        ipnet::IpNet::V4(n) => Ok(n.prefix_len()),
        _ => Ok(24),
    }
}

async fn load_ipv4_peers(
    pool: &PgPool,
    network_id: Uuid,
    self_endpoint_id: &str,
    _network_name: &str,
) -> anyhow::Result<Vec<PeerEntry>> {
    let hostname_expr = crate::device_metadata::device_hostname_expr("e");
    let peer_rows: Vec<(String, String, PgIp)> = sqlx::query_as(&format!(
        "SELECT e.endpoint_id, {hostname_expr} AS hostname, nm.assigned_ip::inet \
         FROM network_memberships nm \
         JOIN devices e ON e.endpoint_id = nm.endpoint_id \
         WHERE nm.network_id = $1 AND nm.status = 'active' AND nm.endpoint_id <> $2 \
           AND nm.last_seen > now() - interval '5 minutes'",
    ))
    .bind(network_id)
    .bind(self_endpoint_id)
    .fetch_all(pool)
    .await?;

    let mut peers = Vec::with_capacity(peer_rows.len());
    for (eid, host, assigned_ip) in peer_rows {
        let ip = match pg_inet::to_ipv4_addr(assigned_ip) {
            Ok(ip) => ip,
            Err(_) => continue,
        };
        let tag_rows: Vec<(String,)> =
            sqlx::query_as("SELECT tag FROM device_tags WHERE endpoint_id = $1")
                .bind(&eid)
                .fetch_all(pool)
                .await?;
        peers.push(PeerEntry {
            ip,
            endpoint_id: eid,
            hostname: host,
            tags: tag_rows.into_iter().map(|(t,)| t).collect(),
        });
    }
    Ok(peers)
}

async fn load_ipv6_peers(
    pool: &PgPool,
    organization_id: &str,
    self_endpoint_id: &str,
) -> anyhow::Result<Vec<Ipv6PeerEntry>> {
    let hostname_expr = crate::device_metadata::device_hostname_expr("devices");
    let rows: Vec<(String, String)> = sqlx::query_as(&format!(
        "SELECT endpoint_id, {hostname_expr} AS hostname FROM devices \
         WHERE organization_id = $1 AND ipv6_enabled AND endpoint_id <> $2",
    ))
    .bind(organization_id)
    .bind(self_endpoint_id)
    .fetch_all(pool)
    .await?;

    let mut peers = Vec::with_capacity(rows.len());
    for (eid, host) in rows {
        let ip = tuntun_common::ipv6::derive_tenant_ipv6(&eid)?;
        let tag_rows: Vec<(String,)> =
            sqlx::query_as("SELECT tag FROM device_tags WHERE endpoint_id = $1")
                .bind(&eid)
                .fetch_all(pool)
                .await?;
        peers.push(Ipv6PeerEntry {
            ip,
            endpoint_id: eid,
            hostname: host,
            tags: tag_rows.into_iter().map(|(t,)| t).collect(),
        });
    }
    Ok(peers)
}
