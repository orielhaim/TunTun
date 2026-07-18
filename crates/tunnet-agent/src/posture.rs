use std::collections::HashMap;
use std::sync::Arc;

use arc_swap::ArcSwap;
use chrono::Utc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tunnet_common::posture::CustomScriptConfig;
use tunnet_common::ws::ClientMsg;
use tunnet_core::PostureHooks;
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
                tokio::spawn(async move {
                    let _ = (interval_secs, enabled_collectors, custom_scripts);
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
                }
            },
        )),
    }
}

fn json_map(attrs: &HashMap<String, PostureValue>) -> HashMap<String, serde_json::Value> {
    attrs
        .iter()
        .filter_map(|(k, v)| serde_json::to_value(v).ok().map(|j| (k.clone(), j)))
        .collect()
}
