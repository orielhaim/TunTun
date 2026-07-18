//! Error types for the Tunnet SDK.

use std::fmt;

/// Result alias for the Tunnet SDK.
pub type Result<T> = std::result::Result<T, Error>;

/// Errors returned by the Tunnet SDK.
#[derive(Debug)]
pub enum Error {
    /// No persisted identity; call [`crate::enroll`] or pass API key credentials.
    NotEnrolled,
    /// No peer matches the requested host.
    PeerNotFound(String),
    /// Opening or using a mesh stream failed.
    StreamFailed(String),
    /// Enrollment with the control plane / management API failed.
    EnrollmentFailed(String),
    /// Operation requires the coordinator process (not available in client mode).
    CoordinatorRequired(&'static str),
    /// Inbound stream listener is only available on the coordinator.
    ListenerUnavailable,
    /// Stream listener was already taken.
    ListenerTaken,
    /// Invalid configuration or argument.
    InvalidConfig(String),
    /// Underlying I/O error.
    Io(std::io::Error),
    /// Other internal error.
    Internal(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotEnrolled => write!(
                f,
                "no persisted identity; run enroll() first or pass api_key credentials"
            ),
            Self::PeerNotFound(host) => write!(f, "no peer matches host {host}"),
            Self::StreamFailed(msg) => write!(f, "stream failed: {msg}"),
            Self::EnrollmentFailed(msg) => write!(f, "enrollment failed: {msg}"),
            Self::CoordinatorRequired(op) => {
                write!(f, "{op} requires the coordinator process")
            }
            Self::ListenerUnavailable => {
                write!(
                    f,
                    "stream listener is not available in coordinator client mode"
                )
            }
            Self::ListenerTaken => write!(f, "stream listener already taken"),
            Self::InvalidConfig(msg) => write!(f, "invalid config: {msg}"),
            Self::Io(e) => write!(f, "io error: {e}"),
            Self::Internal(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for Error {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl Error {
    pub(crate) fn from_anyhow(e: impl fmt::Display) -> Self {
        Self::Internal(e.to_string())
    }

    #[cfg(feature = "managed")]
    pub(crate) fn enrollment(e: impl fmt::Display) -> Self {
        Self::EnrollmentFailed(e.to_string())
    }

    pub(crate) fn stream(e: impl fmt::Display) -> Self {
        Self::StreamFailed(e.to_string())
    }
}
