//! Race-free IP allocation using Postgres transactions.

use std::net::Ipv4Addr;

use ipnet::Ipv4Net;
use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;

use crate::pg_inet::{self, PgIp};

pub struct Allocated {
    pub ip: Ipv4Addr,
    pub prefix: u8,
}

/// True when `ip` is a usable host address inside `net` (not network/broadcast
/// for prefixes < 31; for /31–/32 every address in the net is usable).
fn is_usable_host(net: &Ipv4Net, ip: Ipv4Addr) -> bool {
    if !net.contains(&ip) {
        return false;
    }
    if net.prefix_len() >= 31 {
        return true;
    }
    ip != net.network() && ip != net.broadcast()
}

/// Allocate an IP for `endpoint_id` on `network_id`. Reuses the existing
/// assignment if the device is already a member with a usable host address.
/// Otherwise scans the network CIDR for the first unused host; the unique
/// `(network_id, assigned_ip)` constraint breaks ties if two enrolments race.
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
        let addr = pg_inet::to_ipv4_addr(ip)?;
        if is_usable_host(&net, addr) {
            return Ok(Allocated {
                ip: addr,
                prefix: net.prefix_len(),
            });
        }
        tracing::warn!(
            %addr,
            network = %net,
            endpoint_id,
            "existing assigned_ip is not a usable host; reallocating"
        );
    }

    let taken: Vec<(PgIp,)> =
        sqlx::query_as("SELECT assigned_ip FROM network_memberships WHERE network_id = $1")
            .bind(network_id)
            .fetch_all(&mut **tx)
            .await?;
    let taken: std::collections::HashSet<Ipv4Addr> = taken
        .into_iter()
        .filter_map(|(n,)| pg_inet::to_ipv4_addr(n).ok())
        .collect();

    let mut chosen = None;
    for host in net.hosts() {
        if !is_usable_host(&net, host) {
            continue;
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn rejects_network_and_broadcast() {
        let net = Ipv4Net::from_str("10.7.0.0/24").unwrap();
        assert!(!is_usable_host(&net, Ipv4Addr::new(10, 7, 0, 0)));
        assert!(!is_usable_host(&net, Ipv4Addr::new(10, 7, 0, 255)));
        assert!(is_usable_host(&net, Ipv4Addr::new(10, 7, 0, 1)));
    }

    #[test]
    fn slash32_single_host_ok() {
        let net = Ipv4Net::from_str("10.7.0.5/32").unwrap();
        assert!(is_usable_host(&net, Ipv4Addr::new(10, 7, 0, 5)));
        assert!(!is_usable_host(&net, Ipv4Addr::new(10, 7, 0, 0)));
    }
}

#[allow(dead_code)]
pub async fn _keep_unused_ref(_c: &mut PgConnection) {}
