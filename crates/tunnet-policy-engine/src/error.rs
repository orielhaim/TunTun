use thiserror::Error;

pub type Result<T> = std::result::Result<T, PolicyError>;

#[derive(Debug, Error)]
pub enum PolicyError {
    #[error("parse error: {0}")]
    Parse(String),
    #[error("merge conflict: {entity} '{name}' defined in multiple fragments")]
    MergeConflict { entity: String, name: String },
    #[error("{0}")]
    Other(String),
}

impl From<serde_json::Error> for PolicyError {
    fn from(e: serde_json::Error) -> Self {
        PolicyError::Parse(e.to_string())
    }
}

impl From<::hcl::Error> for PolicyError {
    fn from(e: ::hcl::Error) -> Self {
        PolicyError::Parse(e.to_string())
    }
}

impl From<yaml_serde::Error> for PolicyError {
    fn from(e: yaml_serde::Error) -> Self {
        PolicyError::Parse(e.to_string())
    }
}
