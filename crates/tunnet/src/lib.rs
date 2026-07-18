//! # tunnet
//!
//! Embed a Tunnet mesh node inside any Rust application - Tailscale's tsnet for Rust.
//!
//! ```no_run
//! use tunnet::TunnetNode;
//! use tokio::io::{AsyncReadExt, AsyncWriteExt};
//!
//! #[tokio::main]
//! async fn main() -> tunnet::Result<()> {
//!     let node = TunnetNode::builder()
//!         .hostname("my-service")
//!         .state_dir("/var/lib/my-app/tunnet")
//!         .api_key("tnnt_key_...")
//!         .organization_id("org_...")
//!         .network_id("00000000-0000-0000-0000-000000000000")
//!         .control_url("https://cp.tunnet.io")
//!         .management_url("https://api.tunnet.io")
//!         .standalone(true)
//!         .start()
//!         .await?;
//!
//!     let mut stream = node.open_stream("10.0.0.5", 8080).await?;
//!     stream.write_all(b"hello").await?;
//!     let mut buf = [0u8; 64];
//!     let n = stream.read(&mut buf).await?;
//!     println!("got {} bytes", n);
//!     Ok(())
//! }
//! ```
//!
//! ## Features
//!
//! - `managed` (default) - control-plane enrollment and sync
//! - `direct` - re-exports for Direct / local-first mode types
//! - `send` - file transfer APIs
//! - `serve` - mesh reverse-proxy (`serve`) APIs

#![deny(missing_docs)]

mod enroll;
mod error;
mod features;
mod listener;
mod node;
mod peer;
mod stream;
mod types;

#[cfg(feature = "managed")]
pub use enroll::enroll;
pub use enroll::{EnrollConfig, EnrollResult};
pub use error::{Error, Result};
pub use listener::StreamListener;
pub use node::{TunnetNode, TunnetNodeBuilder};
pub use peer::Peer;
pub use stream::TunnetStream;
pub use types::policy;
pub use types::{
    EndpointSnapshot, NetworkMembershipSnapshot, PeerEntry, PolicyBundle, StreamHeader,
};

#[cfg(feature = "serve")]
pub use features::ServeInfo;
#[cfg(feature = "send")]
pub use features::Transfer;
#[cfg(feature = "serve")]
pub use tunnet_core::ServeAcl;

#[cfg(feature = "direct")]
/// Direct / local-first mode helpers and types.
pub mod direct {
    pub use tunnet_core::DirectState;
    pub use tunnet_core::NodeMode;
    pub use tunnet_core::PersistedState;
}
