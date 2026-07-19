//! Host firewall + network profile for the Tunnet TUN interface.
//!
//! Mesh packets are already authenticated and ACL'd in userspace. Windows
//! Defender Firewall still classifies Wintun adapters as Public and blocks
//! inbound ICMP/TCP by default, so OS `ping` and services on mesh IPs fail
//! even when the dataplane is healthy. Open the TUN NIC explicitly.

/// Best-effort: allow all traffic on `ifname` and prefer Private profile.
/// Failures are logged and non-fatal (agent still runs).
pub fn configure(ifname: &str) {
    #[cfg(target_os = "windows")]
    windows::configure(ifname);
    #[cfg(not(target_os = "windows"))]
    {
        let _ = ifname;
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    fn powershell(script: &str) -> std::io::Result<std::process::ExitStatus> {
        Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ])
            .status()
    }

    pub fn configure(ifname: &str) {
        // Escape single quotes for PowerShell single-quoted strings.
        let alias = ifname.replace('\'', "''");

        // netsh cannot bind rules to a named interface (only interfacetype=lan|…).
        // Use New-NetFirewallRule -InterfaceAlias instead.
        let script = format!(
            r#"
$ErrorActionPreference = 'Stop'
$alias = '{alias}'
foreach ($name in @('Tunnet Mesh Inbound','Tunnet Mesh Outbound','Tunnet ICMPv4-In','Tunnet ICMPv4-Out','Tunnet ICMPv4-EchoReply-In','Tunnet ICMPv4-EchoReply-Out')) {{
  Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
}}
New-NetFirewallRule -DisplayName 'Tunnet Mesh Inbound' -Direction Inbound -Action Allow -Profile Any -InterfaceAlias $alias -ErrorAction Stop | Out-Null
New-NetFirewallRule -DisplayName 'Tunnet Mesh Outbound' -Direction Outbound -Action Allow -Profile Any -InterfaceAlias $alias -ErrorAction Stop | Out-Null
New-NetFirewallRule -DisplayName 'Tunnet ICMPv4-In' -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow -Profile Any -InterfaceAlias $alias -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName 'Tunnet ICMPv4-Out' -Direction Outbound -Protocol ICMPv4 -IcmpType 8 -Action Allow -Profile Any -InterfaceAlias $alias -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName 'Tunnet ICMPv4-EchoReply-In' -Direction Inbound -Protocol ICMPv4 -IcmpType 0 -Action Allow -Profile Any -InterfaceAlias $alias -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName 'Tunnet ICMPv4-EchoReply-Out' -Direction Outbound -Protocol ICMPv4 -IcmpType 0 -Action Allow -Profile Any -InterfaceAlias $alias -ErrorAction SilentlyContinue | Out-Null
try {{ Set-NetConnectionProfile -InterfaceAlias $alias -NetworkCategory Private -ErrorAction Stop }} catch {{ }}
"#
        );

        match powershell(&script) {
            Ok(s) if s.success() => {
                tracing::info!(%ifname, "configured Windows firewall + Private profile for TUN");
            }
            Ok(s) => {
                tracing::warn!(%ifname, ?s, "Windows TUN firewall configure returned non-zero")
            }
            Err(e) => tracing::warn!(%ifname, ?e, "Windows TUN firewall configure failed"),
        }
    }
}
