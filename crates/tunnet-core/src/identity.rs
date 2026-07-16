use ed25519_dalek::SigningKey;

#[derive(Clone)]
pub struct AgentIdentity {
    pub secret_bytes: [u8; 32],
    pub signing_key: SigningKey,
}

impl AgentIdentity {
    pub fn generate() -> Self {
        let sk = SigningKey::generate(&mut rand::rng());
        Self {
            secret_bytes: sk.to_bytes(),
            signing_key: sk,
        }
    }

    pub fn from_bytes(b: [u8; 32]) -> Self {
        let sk = SigningKey::from_bytes(&b);
        Self {
            secret_bytes: b,
            signing_key: sk,
        }
    }

    pub fn endpoint_id_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().to_bytes())
    }
}
