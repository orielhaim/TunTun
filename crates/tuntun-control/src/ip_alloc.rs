//! Race-free IP allocation using Postgres transactions.

use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;

use crate::pg_inet::{self, PgIp};

pub struct Allocated {
    pub ip: std::net::Ipv4Addr,
    pub prefix: u8,
}

/// Allocate an IP for `endpoint_id` on `network_id`. Reuses the existing
/// assignment if the device is already a member. Otherwise scans the network
/// CIDR for the first unused host; the unique `(network_id, assigned_ip)`
/// constraint breaks ties if two enrolments race.
pub async fn allocate<'c>(
    tx: &mut Transaction<'c, Postgres>,
    network_id: Uuid,
    endpoint_id: &str,
) -> anyhow::Result<Allocated> {
    let (cidr,): (PgIp,) = sqlx::query_as("SELECT cidr FROM networks WHERE id = $1 FOR UPDATE")
        .bind(network_id)
        .fetch_one(&mut **tx)
        .await?;

    let net = match pg_inet::to_ipnet(cidr)? {
        ipnet::IpNet::V4(n) => n,
        _ => anyhow::bail!("IPv6 networks not supported yet"),
    };

    if let Some((ip,)) = sqlx::query_as::<_, (PgIp,)>(
        "SELECT assigned_ip FROM network_memberships \
         WHERE network_id = $1 AND endpoint_id = $2",
    )
    .bind(network_id)
    .bind(endpoint_id)
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok(Allocated {
            ip: pg_inet::to_ipv4_addr(ip)?,
            prefix: net.prefix_len(),
        });
    }

    let taken: Vec<(PgIp,)> =
        sqlx::query_as("SELECT assigned_ip FROM network_memberships WHERE network_id = $1")
            .bind(network_id)
            .fetch_all(&mut **tx)
            .await?;
    let taken: std::collections::HashSet<std::net::Ipv4Addr> = taken
        .into_iter()
        .filter_map(|(n,)| pg_inet::to_ipv4_addr(n).ok())
        .collect();

    let mut chosen = None;
    for host in net.hosts() {
        if !taken.contains(&host) {
            chosen = Some(host);
            break;
        }
    }
    let ip = chosen.ok_or_else(|| anyhow::anyhow!("network full"))?;

    Ok(Allocated {
        ip,
        prefix: net.prefix_len(),
    })
}

#[allow(dead_code)]
pub async fn _keep_unused_ref(_c: &mut PgConnection) {}
