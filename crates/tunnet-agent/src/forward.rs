pub fn ensure_ip_forwarding(advertise: bool) {
    if !advertise {
        return;
    }
    #[cfg(target_os = "linux")]
    {
        if let Err(e) = std::fs::write("/proc/sys/net/ipv4/ip_forward", b"1") {
            tracing::warn!(?e, "failed to enable net.ipv4.ip_forward");
        } else {
            tracing::info!("enabled net.ipv4.ip_forward for subnet route gateway");
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        tracing::info!(
            "subnet routes advertised; ensure OS IP forwarding/NAT is configured for return traffic"
        );
    }
}
