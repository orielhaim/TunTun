//! Transfer and serve types exposed behind Cargo features.

#[cfg(feature = "send")]
mod send_types {
    use tunnet_core::{TransferDirection, TransferRecord};

    /// A file transfer record.
    #[derive(Debug, Clone)]
    pub struct Transfer {
        /// Transfer id.
        pub transfer_id: String,
        /// `"outbound"` or `"inbound"`.
        pub direction: &'static str,
        /// Peer endpoint id (hex).
        pub peer_endpoint_id: String,
        /// Peer hostname, if known.
        pub peer_hostname: Option<String>,
        /// File or directory name.
        pub file_name: String,
        /// Total size in bytes.
        pub size: u64,
        /// Content hash.
        pub hash: String,
        /// Status string.
        pub status: String,
        /// Progress percent 0–100.
        pub percent: f32,
        /// Bytes transferred so far.
        pub bytes_transferred: u64,
        /// Optional message from the sender.
        pub message: Option<String>,
        /// Error message if failed.
        pub error: Option<String>,
        /// Local inbox path for inbound transfers.
        pub inbox_path: Option<String>,
        /// Whether this transfer is a directory.
        pub is_directory: bool,
    }

    impl From<TransferRecord> for Transfer {
        fn from(r: TransferRecord) -> Self {
            Self {
                transfer_id: r.transfer_id,
                direction: match r.direction {
                    TransferDirection::Outbound => "outbound",
                    TransferDirection::Inbound => "inbound",
                },
                peer_endpoint_id: r.peer_endpoint_id,
                peer_hostname: r.peer_hostname,
                file_name: r.file_name,
                size: r.size,
                hash: r.hash,
                status: r.status.as_str().into(),
                percent: r.percent,
                bytes_transferred: r.bytes_transferred,
                message: r.message,
                error: r.error,
                inbox_path: r.inbox_path,
                is_directory: r.is_directory,
            }
        }
    }
}

#[cfg(feature = "send")]
pub use send_types::Transfer;

#[cfg(feature = "serve")]
mod serve_types {
    /// Active serve (mesh reverse proxy) info.
    #[derive(Debug, Clone)]
    pub struct ServeInfo {
        /// Serve id.
        pub id: String,
        /// Mesh listen port.
        pub port: u16,
        /// `"tcp"` or `"https"`.
        pub protocol: String,
        /// Public URL / dial string on the mesh.
        pub url: String,
        /// Status string (`active`, `stopped`, …).
        pub status: String,
    }

    impl From<tunnet_core::ipc::protocol::ServeInfo> for ServeInfo {
        fn from(i: tunnet_core::ipc::protocol::ServeInfo) -> Self {
            Self {
                id: i.id,
                port: i.port,
                protocol: i.protocol,
                url: i.url,
                status: i.status,
            }
        }
    }
}

#[cfg(feature = "serve")]
pub use serve_types::ServeInfo;
