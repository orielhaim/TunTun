//! Helpers to persist public state + sealed secrets together.

use crate::identity::AgentIdentity;
use crate::secret_store::{self, AgentSecrets, SealPolicy, SealTier};
use crate::state::{PersistedState, StatePaths};

/// Write `state.json` + `state.enc`.
pub fn persist_agent(
    paths: &StatePaths,
    identity: &AgentIdentity,
    state: PersistedState,
    policy: SealPolicy,
) -> anyhow::Result<SealTier> {
    let network_secret = state.as_direct().map(|d| d.network_secret.clone());
    let doc_ticket = state.as_direct().and_then(|d| d.doc_ticket.clone());
    let auth = secret_store::load_auth(paths).ok().flatten();

    let secrets = AgentSecrets {
        identity_seed: identity.secret_bytes,
        network_secret,
        doc_ticket,
        auth,
    };

    state.save_public(paths)?;
    secret_store::save_secrets(paths, &secrets, policy)
}

/// Load identity + persisted state with secrets merged from `state.enc`.
pub fn load_agent(
    paths: &StatePaths,
    _policy: SealPolicy,
) -> anyhow::Result<(AgentIdentity, PersistedState, SealTier)> {
    let (secrets, tier) = secret_store::load_secrets(paths)?;
    let identity = secrets.identity();
    let mut state = PersistedState::load(paths)?;
    state.apply_secrets(&secrets);
    Ok((identity, state, tier))
}
