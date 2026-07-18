use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;
use sha2::{Digest, Sha256};
use std::path::Path;
use tokio::fs;

#[derive(Debug, Clone)]
pub struct FileCheckConfig {
    pub path: String,
    pub expected_sha256: Option<String>,
}

pub struct FileCheckCollector {
    files: Vec<FileCheckConfig>,
}

impl FileCheckCollector {
    pub fn new(files: Vec<FileCheckConfig>) -> Self {
        Self { files }
    }
}

#[async_trait]
impl PostureCollector for FileCheckCollector {
    fn name(&self) -> &'static str {
        "file_check"
    }

    fn supported_platforms(&self) -> &[Platform] {
        &[
            Platform::Windows,
            Platform::MacOS,
            Platform::Linux,
            Platform::FreeBSD,
        ]
    }

    fn namespace(&self) -> &'static str {
        "device"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let mut attrs = PostureAttributes::new(self.name());

        for file in &self.files {
            let path = &file.path;
            let exists = Path::new(path).exists();
            attrs.attributes.insert(
                format!("device:fileExists:{path}"),
                PostureValue::Bool(exists),
            );

            if exists && let Ok(hash) = sha256_file(path).await {
                attrs.attributes.insert(
                    format!("device:fileSha256:{path}"),
                    PostureValue::String(hash),
                );
            }
        }

        Ok(attrs)
    }
}

async fn sha256_file(path: &str) -> Result<String, std::io::Error> {
    let data = fs::read(path).await?;
    let hash = Sha256::digest(&data);
    Ok(hex::encode(hash))
}
