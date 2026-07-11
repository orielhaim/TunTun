//! Inbound stream acceptor: TCP-proxy to the destination in the stream header.
//! Used when an SDK client opens a stream to a subnet/hostname-route target via this gateway.

use std::sync::Arc;

use tokio::net::TcpStream;
use tuntun_core::RoutingTable;
use tuntun_core::stream::{
    AcceptedStream, StreamHandler, serve_stream_acceptor, splice_bidirectional,
};

pub fn spawn(endpoint: iroh::Endpoint, routes: RoutingTable) {
    let handler: StreamHandler = Arc::new(move |accepted| {
        let routes = routes.clone();
        Box::pin(async move {
            handle_accepted(accepted, &routes).await;
        })
    });
    tokio::spawn(async move {
        if let Err(e) = serve_stream_acceptor(endpoint, handler).await {
            tracing::error!(?e, "subnet stream acceptor exited");
        }
    });
}

async fn handle_accepted(accepted: AcceptedStream, routes: &RoutingTable) {
    let host = accepted.header.host.clone();
    let port = accepted.header.dst_port;
    let peer_hex = accepted.peer_hex;

    if host == tuntun_core::ping::PING_HOST {
        let _ =
            tuntun_core::ping::handle_inbound_ping(&accepted.header, accepted.send, accepted.recv)
                .await;
        return;
    }

    let connect_host = if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        if !routes.is_advertised_destination(&ip) {
            tracing::warn!(%peer_hex, %host, port, "refusing stream: destination not routable here");
            return;
        }
        host
    } else if let Some(info) = routes.lookup_hostname_route(&host) {
        if !routes.is_advertised_hostname(&host) {
            tracing::warn!(%peer_hex, %host, port, "refusing stream: not our hostname route");
            return;
        }
        if let Some(target) = info.target_ip {
            target.to_string()
        } else {
            host
        }
    } else if routes.is_advertised_hostname(&host) {
        host
    } else {
        tracing::warn!(%peer_hex, %host, port, "refusing stream: destination not routable here");
        return;
    };

    let addr = format!("{connect_host}:{port}");
    let tcp = match TcpStream::connect(&addr).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(%peer_hex, %addr, ?e, "TCP connect failed for inbound stream");
            return;
        }
    };
    if let Err(e) = tcp.set_nodelay(true) {
        tracing::debug!(?e, "set_nodelay failed");
    }

    tracing::info!(%peer_hex, %addr, "proxying inbound stream to LAN/target");
    let (tcp_read, tcp_write) = tcp.into_split();
    if let Err(e) = splice_bidirectional(accepted.recv, accepted.send, tcp_read, tcp_write).await {
        tracing::debug!(%peer_hex, %addr, ?e, "stream proxy closed");
    }
}
