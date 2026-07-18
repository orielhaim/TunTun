use crate::collector::PostureCollector;
use crate::collectors::{
    AntivirusCollector, AppCheckConfig, ApplicationCheckCollector, CustomScriptCollector,
    CustomScriptConfig as LocalScriptConfig, DiskEncryptionCollector, DomainJoinedCollector,
    FileCheckCollector, FileCheckConfig, FirewallCollector, MacSecurityCollector, MdmCollector,
    OsCollector, OsUpdatesCollector, ScreenLockCollector, SecureBootCollector, TpmCollector,
};
use crate::error::PostureError;
use crate::score::{PostureScoringConfig, inject_posture_score};
use crate::value::PostureValue;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{RwLock, broadcast};
use tokio_util::sync::CancellationToken;
use tracing::{debug, warn};
use tunnet_common::posture::CustomScriptConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollectorStatus {
    Ok,
    Error,
    Unavailable,
}

#[derive(Debug, Clone)]
pub struct PostureState {
    pub attributes: HashMap<String, PostureValue>,
    pub last_collected: HashMap<String, DateTime<Utc>>,
    pub collector_statuses: HashMap<String, CollectorStatus>,
    pub state_hash: String,
}

#[derive(Debug, Clone)]
pub struct PostureChangeEvent {
    pub changed_attributes: Vec<(String, PostureValue, PostureValue)>,
    pub state_hash: String,
    pub full_snapshot: bool,
}

#[derive(Debug, Clone)]
pub struct PostureEngineConfig {
    pub interval: Duration,
    pub enabled_collectors: Option<Vec<String>>,
    pub tunnet_version: String,
    pub app_checks: Vec<AppCheckConfig>,
    pub file_checks: Vec<FileCheckConfig>,
    pub custom_scripts: Vec<CustomScriptConfig>,
    pub custom_scripts_dir: PathBuf,
    pub scoring: PostureScoringConfig,
}

impl Default for PostureEngineConfig {
    fn default() -> Self {
        Self {
            interval: Duration::from_secs(300),
            enabled_collectors: None,
            tunnet_version: env!("CARGO_PKG_VERSION").into(),
            app_checks: Vec::new(),
            file_checks: Vec::new(),
            custom_scripts: Vec::new(),
            custom_scripts_dir: default_scripts_dir(),
            scoring: PostureScoringConfig::default_weights(),
        }
    }
}

fn default_scripts_dir() -> PathBuf {
    #[cfg(unix)]
    {
        PathBuf::from("/etc/tunnet/posture.d")
    }
    #[cfg(windows)]
    {
        PathBuf::from(r"C:\ProgramData\Tunnet\posture.d")
    }
    #[cfg(not(any(unix, windows)))]
    {
        PathBuf::from("./posture.d")
    }
}

pub struct PostureEngine {
    collectors: RwLock<Vec<Box<dyn PostureCollector>>>,
    config: RwLock<PostureEngineConfig>,
    state: Arc<RwLock<PostureState>>,
    change_tx: broadcast::Sender<PostureChangeEvent>,
}

impl PostureEngine {
    pub fn new(collectors: Vec<Box<dyn PostureCollector>>, config: PostureEngineConfig) -> Self {
        let (change_tx, _) = broadcast::channel(64);
        Self {
            collectors: RwLock::new(collectors),
            config: RwLock::new(config),
            state: Arc::new(RwLock::new(PostureState {
                attributes: HashMap::new(),
                last_collected: HashMap::new(),
                collector_statuses: HashMap::new(),
                state_hash: String::new(),
            })),
            change_tx,
        }
    }

    pub fn with_default_collectors(config: PostureEngineConfig) -> Self {
        let collectors = Self::default_collectors(&config);
        Self::new(collectors, config)
    }

    pub fn default_collectors(config: &PostureEngineConfig) -> Vec<Box<dyn PostureCollector>> {
        let mut collectors: Vec<Box<dyn PostureCollector>> = vec![
            Box::new(OsCollector::new(config.tunnet_version.clone())),
            Box::new(DiskEncryptionCollector),
            Box::new(FirewallCollector),
            Box::new(AntivirusCollector),
            Box::new(SecureBootCollector),
            Box::new(TpmCollector),
            Box::new(ScreenLockCollector),
            Box::new(OsUpdatesCollector),
            Box::new(MdmCollector),
            Box::new(DomainJoinedCollector),
            Box::new(MacSecurityCollector),
        ];

        if !config.app_checks.is_empty() {
            collectors.push(Box::new(ApplicationCheckCollector::new(
                config.app_checks.clone(),
            )));
        }
        if !config.file_checks.is_empty() {
            collectors.push(Box::new(FileCheckCollector::new(
                config.file_checks.clone(),
            )));
        }
        collectors.push(Box::new(CustomScriptCollector::new(
            config.custom_scripts_dir.clone(),
            config
                .custom_scripts
                .iter()
                .map(|s| LocalScriptConfig {
                    name: s.name.clone(),
                    path: PathBuf::from(&s.path),
                })
                .collect(),
        )));

        collectors.retain(|c| c.is_available());
        collectors
    }

    pub fn subscribe(&self) -> broadcast::Receiver<PostureChangeEvent> {
        self.change_tx.subscribe()
    }

    pub async fn state(&self) -> PostureState {
        self.state.read().await.clone()
    }

    pub async fn apply_config(
        &self,
        interval: Duration,
        enabled_collectors: Option<Vec<String>>,
        custom_scripts: Vec<CustomScriptConfig>,
    ) {
        let mut config = self.config.write().await;
        config.interval = interval;
        config.enabled_collectors = enabled_collectors.clone();
        config.custom_scripts = custom_scripts;
        let mut collectors = Self::default_collectors(&config);
        if let Some(enabled) = &enabled_collectors {
            collectors.retain(|c| enabled.iter().any(|name| name == c.name()));
        }
        *self.collectors.write().await = collectors;
    }

    pub async fn collect_once(&self) -> Result<PostureChangeEvent, PostureError> {
        let (changes, full) = self.run_collection(true).await?;
        Ok(PostureChangeEvent {
            changed_attributes: changes,
            state_hash: self.state.read().await.state_hash.clone(),
            full_snapshot: full,
        })
    }

    pub async fn run(self: Arc<Self>, cancel: CancellationToken) {
        let mut is_first = true;
        loop {
            if cancel.is_cancelled() {
                break;
            }

            match self.run_collection(is_first).await {
                Ok((changes, full)) => {
                    if !changes.is_empty() || full {
                        let event = PostureChangeEvent {
                            changed_attributes: changes,
                            state_hash: self.state.read().await.state_hash.clone(),
                            full_snapshot: full,
                        };
                        let _ = self.change_tx.send(event);
                    }
                }
                Err(e) => {
                    warn!(error = %e, "posture collection cycle failed");
                }
            }

            is_first = false;

            let interval = self.config.read().await.interval;
            tokio::select! {
                _ = cancel.cancelled() => break,
                _ = tokio::time::sleep(interval) => {}
            }
        }
    }

    async fn run_collection(
        &self,
        force_all: bool,
    ) -> Result<(Vec<(String, PostureValue, PostureValue)>, bool), PostureError> {
        let now = Utc::now();
        let mut new_attrs = HashMap::new();
        let mut statuses = HashMap::new();

        let collectors = self.collectors.read().await;
        let mut results = Vec::new();
        for collector in collectors.iter() {
            if !force_all {
                let last = self
                    .state
                    .read()
                    .await
                    .last_collected
                    .get(collector.name())
                    .copied();
                if let Some(last) = last
                    && now.signed_duration_since(last).to_std().unwrap_or_default()
                        < collector.min_interval()
                {
                    continue;
                }
            }

            let name = collector.name().to_string();
            let result = if collector.is_available() {
                collector.collect().await
            } else {
                Err(PostureError::NotAvailable {
                    collector: name.clone(),
                })
            };
            results.push((name, result));
        }
        drop(collectors);

        for (name, result) in results {
            match result {
                Ok(attrs) => {
                    statuses.insert(name.clone(), CollectorStatus::Ok);
                    for (k, v) in attrs.attributes {
                        new_attrs.insert(k, v);
                    }
                    if let Some(err) = attrs.error {
                        warn!(collector = %name, error = %err, "collector reported partial error");
                    }
                }
                Err(PostureError::NotAvailable { .. }) => {
                    statuses.insert(name, CollectorStatus::Unavailable);
                }
                Err(e) => {
                    warn!(collector = %name, error = %e, "collector failed");
                    statuses.insert(name, CollectorStatus::Error);
                }
            }
        }

        let scoring = self.config.read().await.scoring.clone();
        inject_posture_score(&mut new_attrs, &scoring);

        let mut state = self.state.write().await;
        let old_attrs = state.attributes.clone();
        let was_empty = old_attrs.is_empty();

        for (k, v) in &new_attrs {
            state.attributes.insert(k.clone(), v.clone());
        }
        for (name, status) in statuses {
            state.collector_statuses.insert(name.clone(), status);
            state.last_collected.insert(name, now);
        }

        let changes = diff_attributes(&old_attrs, &state.attributes);
        state.state_hash = compute_state_hash(&state.attributes);

        debug!(
            changed = changes.len(),
            total_attrs = state.attributes.len(),
            "posture collection complete"
        );

        Ok((changes, force_all && was_empty))
    }
}

pub fn compute_state_hash(attrs: &HashMap<String, PostureValue>) -> String {
    let mut keys: Vec<&String> = attrs.keys().collect();
    keys.sort();

    let mut hasher = blake3::Hasher::new();
    for key in keys {
        if let Some(val) = attrs.get(key) {
            hasher.update(key.as_bytes());
            hasher.update(b"=");
            hasher.update(val.to_string().as_bytes());
            hasher.update(b";");
        }
    }
    hasher.finalize().to_hex().to_string()
}

fn diff_attributes(
    old: &HashMap<String, PostureValue>,
    new: &HashMap<String, PostureValue>,
) -> Vec<(String, PostureValue, PostureValue)> {
    let mut changes = Vec::new();

    for (key, new_val) in new {
        match old.get(key) {
            Some(old_val) if old_val != new_val => {
                changes.push((key.clone(), old_val.clone(), new_val.clone()));
            }
            None => changes.push((
                key.clone(),
                PostureValue::String(String::new()),
                new_val.clone(),
            )),
            _ => {}
        }
    }

    for key in old.keys() {
        if !new.contains_key(key) {
            changes.push((
                key.clone(),
                old[key].clone(),
                PostureValue::String(String::new()),
            ));
        }
    }

    changes
}
