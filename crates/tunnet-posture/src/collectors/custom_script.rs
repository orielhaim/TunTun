use crate::collector::{PostureAttributes, PostureCollector};
use crate::error::PostureError;
use crate::platform::Platform;
use crate::value::PostureValue;
use async_trait::async_trait;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::fs;
use tokio::process::Command;

#[derive(Debug, Clone)]
pub struct CustomScriptConfig {
    pub name: String,
    pub path: PathBuf,
}

pub struct CustomScriptCollector {
    scripts_dir: PathBuf,
    scripts: Vec<CustomScriptConfig>,
}

impl CustomScriptCollector {
    pub fn new(scripts_dir: PathBuf, scripts: Vec<CustomScriptConfig>) -> Self {
        Self {
            scripts_dir,
            scripts,
        }
    }

    pub fn scripts_dir(&self) -> &Path {
        &self.scripts_dir
    }
}

#[async_trait]
impl PostureCollector for CustomScriptCollector {
    fn name(&self) -> &'static str {
        "custom_script"
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
        "custom"
    }

    async fn collect(&self) -> Result<PostureAttributes, PostureError> {
        let mut attrs = PostureAttributes::new(self.name());
        let scripts = if self.scripts.is_empty() {
            discover_scripts(&self.scripts_dir).await
        } else {
            self.scripts.clone()
        };

        for script in scripts {
            match run_script(&script.path).await {
                Ok(custom_attrs) => {
                    for (k, v) in custom_attrs {
                        let key = if k.starts_with("custom:") {
                            k
                        } else {
                            format!("custom:{k}")
                        };
                        attrs.attributes.insert(key, v);
                    }
                }
                Err(e) => {
                    tracing::warn!(script = %script.name, error = %e, "custom script failed");
                }
            }
        }

        Ok(attrs)
    }
}

async fn discover_scripts(dir: &Path) -> Vec<CustomScriptConfig> {
    let mut scripts = Vec::new();
    let Ok(mut entries) = fs::read_dir(dir).await else {
        return scripts;
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.is_file() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("script")
                .to_string();
            scripts.push(CustomScriptConfig { name, path });
        }
    }
    scripts
}

async fn run_script(path: &Path) -> Result<HashMap<String, PostureValue>, PostureError> {
    let (program, args) = script_command(path);

    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .env_clear()
        .env("PATH", std::env::var("PATH").unwrap_or_default())
        .env("HOME", std::env::var("HOME").unwrap_or_default())
        .env("USER", std::env::var("USER").unwrap_or_default());

    #[cfg(windows)]
    {
        cmd.env(
            "SystemRoot",
            std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()),
        );
    }

    let child = cmd.spawn().map_err(|e| {
        PostureError::collector_failed("custom_script", format!("spawn failed: {e}"))
    })?;

    let output = tokio::time::timeout(Duration::from_secs(30), child.wait_with_output())
        .await
        .map_err(|_| PostureError::collector_failed("custom_script", "script timed out"))?
        .map_err(|e| {
            PostureError::collector_failed("custom_script", format!("wait failed: {e}"))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(PostureError::collector_failed(
            "custom_script",
            format!("exit {}: {stderr}", output.status),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_script_output(&stdout)
}

fn script_command(path: &Path) -> (&'static str, Vec<String>) {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "ps1" => (
            "powershell",
            vec![
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-ExecutionPolicy".into(),
                "Bypass".into(),
                "-File".into(),
                path.display().to_string(),
            ],
        ),
        "bat" | "cmd" => ("cmd", vec!["/C".into(), path.display().to_string()]),
        _ => {
            #[cfg(unix)]
            {
                ("sh", vec![path.display().to_string()])
            }
            #[cfg(not(unix))]
            {
                ("cmd", vec!["/C".into(), path.display().to_string()])
            }
        }
    }
}

fn parse_script_output(stdout: &str) -> Result<HashMap<String, PostureValue>, PostureError> {
    let value: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|e| PostureError::Parse(format!("script output is not valid JSON: {e}")))?;

    let obj = value
        .as_object()
        .ok_or_else(|| PostureError::Parse("script output must be a JSON object".into()))?;

    let mut attrs = HashMap::new();
    for (k, v) in obj {
        attrs.insert(k.clone(), json_to_posture_value(v)?);
    }
    Ok(attrs)
}

fn json_to_posture_value(v: &serde_json::Value) -> Result<PostureValue, PostureError> {
    match v {
        serde_json::Value::String(s) => Ok(PostureValue::String(s.clone())),
        serde_json::Value::Number(n) => {
            Ok(PostureValue::Number(n.as_f64().ok_or_else(|| {
                PostureError::Parse("invalid number".into())
            })?))
        }
        serde_json::Value::Bool(b) => Ok(PostureValue::Bool(*b)),
        serde_json::Value::Array(items) => {
            let list: Result<Vec<String>, _> = items
                .iter()
                .map(|item| {
                    item.as_str()
                        .map(|s| s.to_string())
                        .ok_or_else(|| PostureError::Parse("list items must be strings".into()))
                })
                .collect();
            Ok(PostureValue::StringList(list?))
        }
        _ => Err(PostureError::Parse(
            "unsupported JSON value type in script output".into(),
        )),
    }
}
