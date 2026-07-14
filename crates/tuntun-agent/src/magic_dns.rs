//! Assign PeerDNS magic IP on the TUN so the OS can reach `100.100.100.53`.

use std::net::Ipv4Addr;
use std::process::Command;

/// Ensure `magic_ip/32` is configured on the TUN interface (idempotent, best-effort).
pub fn ensure_magic_dns_addr(ifname: &str, magic_ip: Ipv4Addr) -> anyhow::Result<()> {
    #[cfg(target_os = "linux")]
    {
        let status = Command::new("ip")
            .args(["addr", "replace", &format!("{magic_ip}/32"), "dev", ifname])
            .status();
        match status {
            Ok(s) if s.success() => {
                tracing::info!(%magic_ip, ifname, "PeerDNS magic IP on TUN");
            }
            Ok(s) => tracing::warn!(?s, %magic_ip, "ip addr replace magic DNS failed"),
            Err(e) => tracing::warn!(?e, %magic_ip, "ip addr replace magic DNS failed"),
        }
    }
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("ifconfig")
            .args([
                ifname,
                "alias",
                &magic_ip.to_string(),
                "netmask",
                "255.255.255.255",
            ])
            .status();
        match status {
            Ok(s) if s.success() => {
                tracing::info!(%magic_ip, ifname, "PeerDNS magic IP on TUN");
            }
            Ok(s) => tracing::warn!(?s, %magic_ip, "ifconfig alias magic DNS failed"),
            Err(e) => tracing::warn!(?e, %magic_ip, "ifconfig alias magic DNS failed"),
        }
    }
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("netsh")
            .args([
                "interface",
                "ipv4",
                "add",
                "address",
                &format!("name={ifname}"),
                &format!("address={magic_ip}"),
                "mask=255.255.255.255",
            ])
            .status();
        match status {
            Ok(s) if s.success() => {
                tracing::info!(%magic_ip, ifname, "PeerDNS magic IP on TUN");
            }
            Ok(s) => {
                tracing::debug!(?s, %magic_ip, "netsh add magic DNS address (may already exist)");
            }
            Err(e) => tracing::warn!(?e, %magic_ip, "netsh add magic DNS address failed"),
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = (ifname, magic_ip);
        tracing::warn!("PeerDNS magic IP assignment unsupported on this OS");
    }
    Ok(())
}
