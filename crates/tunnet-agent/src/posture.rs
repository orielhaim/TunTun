use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use arc_swap::ArcSwap;
use chrono::Utc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tunnet_common::posture::CustomScriptConfig;
use tunnet_common::ws::ClientMsg;
use tunnet_common::{EffectiveAgentConfig, RemoteAgentPolicy, merge_agent_config};
use tunnet_core::{AgentConfigHooks, EffectiveConfigStore, PostureHooks, TunnetConfig};
use tunnet_posture::{PostureEngine, PostureEngineConfig, PostureValue};

pub struct PostureRuntime {
    engine: Arc<PostureEngine>,
    hooks: PostureHooks,
    src_posture_ok: Arc<ArcSwap<bool>>,
}

impl PostureRuntime {
    pub fn new(agent_version: &str) -> Self {
        let src_posture_ok = Arc::new(ArcSwap::from_pointee(true));
        let config = PostureEngineConfig {
            tunnet_version: agent_version.to_string(),
            ..PostureEngineConfig::default()
        };
        let engine = Arc::new(PostureEngine::with_default_collectors(config));
        let hooks = build_hooks(engine.clone(), src_posture_ok.clone());
        Self {
            engine,
            hooks,
            src_posture_ok,
        }
    }

    pub fn hooks(&self) -> PostureHooks {
        self.hooks.clone()
    }

    pub fn engine(&self) -> Arc<PostureEngine> {
        self.engine.clone()
    }

    pub fn src_posture_ok(&self) -> Arc<ArcSwap<bool>> {
        self.src_posture_ok.clone()
    }

    pub fn spawn(self, client_tx: mpsc::Sender<ClientMsg>, cancel: CancellationToken) {
        let engine = self.engine;
        let mut change_rx = engine.subscribe();

        let run_engine = engine.clone();
        let run_cancel = cancel.clone();
        tokio::spawn(async move {
            run_engine.run(run_cancel).await;
        });

        let delta_tx = client_tx.clone();
        let report_cancel = cancel.clone();
        let delta_engine = engine.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = report_cancel.cancelled() => break,
                    changed = change_rx.recv() => {
                        match changed {
                            Ok(event) => {
                                let attrs = if event.full_snapshot {
                                    delta_engine.state().await.attributes
                                } else {
                                    event.changed_attributes.iter().map(|(k, _, new)| (k.clone(), new.clone())).collect()
                                };
                                let msg = ClientMsg::PostureReport {
                                    full: event.full_snapshot,
                                    attributes: json_map(&attrs),
                                    collected_at: Utc::now(),
                                };
                                if delta_tx.send(msg).await.is_err() {
                                    break;
                                }
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        }
                    }
                }
            }
        });

        let initial_engine = engine.clone();
        tokio::spawn(async move {
            match initial_engine.collect_once().await {
                Ok(event) => {
                    let attrs = initial_engine.state().await.attributes;
                    let msg = ClientMsg::PostureReport {
                        full: event.full_snapshot,
                        attributes: json_map(&attrs),
                        collected_at: Utc::now(),
                    };
                    if client_tx.send(msg).await.is_err() {
                        tracing::debug!("initial posture report dropped (ws closed)");
                    }
                }
                Err(e) => tracing::warn!(?e, "initial posture report failed"),
            }
        });
    }
}

/// Build hooks that merge remote policy with local TOML and apply posture collector settings.
pub fn build_agent_config_hooks(
    paths: tunnet_core::StatePaths,
    store: EffectiveConfigStore,
    posture_engine: Option<Arc<PostureEngine>>,
) -> AgentConfigHooks {
    let on_remote_policy: Arc<dyn Fn(RemoteAgentPolicy) -> EffectiveAgentConfig + Send + Sync> =
        Arc::new(move |policy: RemoteAgentPolicy| {
            let local = TunnetConfig::try_load(&paths)
                .ok()
                .flatten()
                .unwrap_or_default();
            let effective = store.apply_remote(&local, policy.clone());

            if let Some(engine) = &posture_engine {
                let interval = effective.posture_interval_secs.value;
                let collectors = if effective.posture_enabled_collectors.value.is_empty() {
                    None
                } else {
                    Some(effective.posture_enabled_collectors.value.clone())
                };
                let scripts = policy
                    .posture
                    .as_ref()
                    .map(|p| p.custom_scripts.clone())
                    .unwrap_or_default();
                let engine = engine.clone();
                tokio::spawn(async move {
                    engine
                        .apply_config(Duration::from_secs(interval.max(30)), collectors, scripts)
                        .await;
                    if let Err(e) = engine.collect_once().await {
                        tracing::warn!(?e, "posture recollect after config update failed");
                    }
                });
            }

            tracing::info!(
                mdns = effective.mdns.value,
                mdns_source = ?effective.mdns.source,
                posture_interval = effective.posture_interval_secs.value,
                "agent config merged"
            );
            effective
        });

    AgentConfigHooks {
        on_remote_policy: Some(on_remote_policy),
    }
}

fn build_hooks(engine: Arc<PostureEngine>, src_posture_ok: Arc<ArcSwap<bool>>) -> PostureHooks {
    let recheck_engine = engine.clone();
    let config_engine = engine.clone();
    let status_flag = src_posture_ok;

    PostureHooks {
        on_recheck: Some(Arc::new(move || {
            let engine = recheck_engine.clone();
            tokio::spawn(async move {
                if let Err(e) = engine.collect_once().await {
                    tracing::warn!(?e, "posture recheck failed");
                }
            });
        })),
        on_config_update: Some(Arc::new(
            move |interval_secs, enabled_collectors, custom_scripts: Vec<CustomScriptConfig>| {
                tracing::info!(
                    interval_secs,
                    collectors = enabled_collectors.len(),
                    scripts = custom_scripts.len(),
                    "posture config update received"
                );
                let engine = config_engine.clone();
                let collectors = if enabled_collectors.is_empty() {
                    None
                } else {
                    Some(enabled_collectors)
                };
                tokio::spawn(async move {
                    engine
                        .apply_config(
                            Duration::from_secs(interval_secs.max(30)),
                            collectors,
                            custom_scripts,
                        )
                        .await;
                    if let Err(e) = engine.collect_once().await {
                        tracing::warn!(?e, "posture config recheck failed");
                    }
                });
            },
        )),
        on_status: Some(Arc::new(
            move |postures, enforcement_action, grace_secs, remediation| {
                let failing = postures.iter().filter(|p| !p.passed).count();
                // Only revoke blocks ACL rules with srcPosture; grace/warn/allow keep access.
                let ok = enforcement_action != "revoke";
                status_flag.store(Arc::new(ok));
                if failing > 0 {
                    tracing::warn!(
                        %enforcement_action,
                        ?grace_secs,
                        failing,
                        ?remediation,
                        src_posture_ok = ok,
                        "device posture non-compliant"
                    );
                } else {
                    tracing::debug!(%enforcement_action, "device posture compliant");
                }
            },
        )),
    }
}

fn json_map(attrs: &HashMap<String, PostureValue>) -> HashMap<String, serde_json::Value> {
    attrs
        .iter()
        .map(|(k, v)| {
            (
                k.clone(),
                serde_json::to_value(v).unwrap_or(serde_json::Value::Null),
            )
        })
        .collect()
}

#[allow(dead_code)]
fn _touch_merge() {
    let _ = merge_agent_config;
}
