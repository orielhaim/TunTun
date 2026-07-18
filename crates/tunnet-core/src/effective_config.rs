//! Resolve effective agent config from local TOML + remote org policy.

use std::sync::Arc;

use arc_swap::ArcSwap;
use tunnet_common::{
    EffectiveAgentConfig, LocalDualOverrides, LocalOnlySettings, RemoteAgentPolicy,
    merge_agent_config,
};

use crate::agent_config::TunnetConfig;

/// Live effective config shared across the agent runtime.
#[derive(Clone, Default)]
pub struct EffectiveConfigStore {
    inner: Arc<ArcSwap<EffectiveAgentConfigState>>,
}

#[derive(Debug, Clone)]
pub struct EffectiveAgentConfigState {
    pub remote: RemoteAgentPolicy,
    pub effective: EffectiveAgentConfig,
}

impl Default for EffectiveAgentConfigState {
    fn default() -> Self {
        let remote = RemoteAgentPolicy::default();
        let effective = merge_agent_config(
            &remote,
            &LocalDualOverrides::default(),
            LocalOnlySettings::default(),
        );
        Self { remote, effective }
    }
}

impl EffectiveConfigStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(ArcSwap::from_pointee(EffectiveAgentConfigState::default())),
        }
    }

    pub fn load(&self) -> Arc<EffectiveAgentConfigState> {
        self.inner.load_full()
    }

    pub fn recompute(
        &self,
        local: &TunnetConfig,
        remote: RemoteAgentPolicy,
    ) -> EffectiveAgentConfig {
        let effective = merge_agent_config(
            &remote,
            &local.local_dual_overrides(),
            local.local_only_settings(),
        );
        self.inner.store(Arc::new(EffectiveAgentConfigState {
            remote,
            effective: effective.clone(),
        }));
        effective
    }

    pub fn apply_remote(
        &self,
        local: &TunnetConfig,
        remote: RemoteAgentPolicy,
    ) -> EffectiveAgentConfig {
        self.recompute(local, remote)
    }

    pub fn refresh_local(&self, local: &TunnetConfig) -> EffectiveAgentConfig {
        let remote = self.inner.load().remote.clone();
        self.recompute(local, remote)
    }
}
