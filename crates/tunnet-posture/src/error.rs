use thiserror::Error;

#[derive(Debug, Error)]
pub enum PostureError {
    #[error("collector {collector} failed: {message}")]
    CollectorFailed { collector: String, message: String },

    #[error("collector {collector} is not available on this platform")]
    NotAvailable { collector: String },

    #[error("invalid assertion: {0}")]
    InvalidAssertion(String),

    #[error("parse error: {0}")]
    Parse(String),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl PostureError {
    pub fn collector_failed(collector: impl Into<String>, message: impl Into<String>) -> Self {
        Self::CollectorFailed {
            collector: collector.into(),
            message: message.into(),
        }
    }
}
