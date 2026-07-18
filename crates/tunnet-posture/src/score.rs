use crate::evaluate::PostureAssertion;
use crate::value::PostureValue;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Weight configuration for a single scoring dimension.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreWeight {
    pub weight: u32,
    pub fail_score: u32,
    /// Attribute key to check (e.g. `device:diskEncryption`).
    pub attribute: String,
    /// Expected passing value when the attribute is a bool.
    #[serde(default = "default_pass_bool")]
    pub pass_value: PostureValue,
}

fn default_pass_bool() -> PostureValue {
    PostureValue::Bool(true)
}

/// Posture scoring configuration (0-100 scale).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PostureScoringConfig {
    #[serde(default)]
    pub disk_encryption: Option<ScoreWeight>,
    #[serde(default)]
    pub firewall_enabled: Option<ScoreWeight>,
    #[serde(default)]
    pub antivirus_installed: Option<ScoreWeight>,
    #[serde(default)]
    pub os_up_to_date: Option<ScoreWeight>,
    #[serde(default)]
    pub tunnet_up_to_date: Option<ScoreWeight>,
    #[serde(default)]
    pub secure_boot: Option<ScoreWeight>,
    #[serde(default)]
    pub custom: Vec<ScoreWeight>,
}

impl PostureScoringConfig {
    pub fn default_weights() -> Self {
        Self {
            disk_encryption: Some(ScoreWeight {
                weight: 25,
                fail_score: 0,
                attribute: "device:diskEncryption".into(),
                pass_value: PostureValue::Bool(true),
            }),
            firewall_enabled: Some(ScoreWeight {
                weight: 20,
                fail_score: 0,
                attribute: "device:firewallEnabled".into(),
                pass_value: PostureValue::Bool(true),
            }),
            antivirus_installed: Some(ScoreWeight {
                weight: 20,
                fail_score: 0,
                attribute: "device:antivirusInstalled".into(),
                pass_value: PostureValue::Bool(true),
            }),
            os_up_to_date: Some(ScoreWeight {
                weight: 15,
                fail_score: 5,
                attribute: "device:osUpdatePending".into(),
                pass_value: PostureValue::Bool(false),
            }),
            tunnet_up_to_date: Some(ScoreWeight {
                weight: 10,
                fail_score: 3,
                attribute: "node:tunnetVersion".into(),
                pass_value: PostureValue::String("0.7.0".into()),
            }),
            secure_boot: Some(ScoreWeight {
                weight: 10,
                fail_score: 5,
                attribute: "device:secureBoot".into(),
                pass_value: PostureValue::Bool(true),
            }),
            custom: Vec::new(),
        }
    }

    fn all_weights(&self) -> Vec<&ScoreWeight> {
        let mut weights = Vec::new();
        for w in [
            &self.disk_encryption,
            &self.firewall_enabled,
            &self.antivirus_installed,
            &self.os_up_to_date,
            &self.tunnet_up_to_date,
            &self.secure_boot,
        ]
        .into_iter()
        .flatten()
        {
            weights.push(w);
        }
        for w in &self.custom {
            weights.push(w);
        }
        weights
    }
}

/// Compute a posture health score from 0 to 100.
pub fn compute_posture_score(
    attrs: &HashMap<String, PostureValue>,
    config: &PostureScoringConfig,
) -> u32 {
    let weights = config.all_weights();
    if weights.is_empty() {
        return 100;
    }

    let total_weight: u32 = weights.iter().map(|w| w.weight).sum();
    if total_weight == 0 {
        return 100;
    }

    let mut earned: u32 = 0;
    for w in weights {
        let passed = dimension_passed(attrs, w);
        if passed {
            earned += w.weight;
        } else {
            earned += w.fail_score;
        }
    }

    ((earned as f64 / total_weight as f64) * 100.0).round() as u32
}

fn dimension_passed(attrs: &HashMap<String, PostureValue>, weight: &ScoreWeight) -> bool {
    let Some(actual) = attrs.get(&weight.attribute) else {
        return false;
    };

    if weight.attribute == "node:tunnetVersion" {
        let assertion = PostureAssertion {
            attribute: weight.attribute.clone(),
            operator: crate::evaluate::PostureOp::Gte,
            value: Some(weight.pass_value.clone()),
        };
        return assertion.evaluate(attrs);
    }

    actual == &weight.pass_value
}

/// Inject `device:postureScore` into attributes.
pub fn inject_posture_score(
    attrs: &mut HashMap<String, PostureValue>,
    config: &PostureScoringConfig,
) {
    let score = compute_posture_score(attrs, config);
    attrs.insert(
        "device:postureScore".into(),
        PostureValue::Number(score as f64),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perfect_score_when_all_pass() {
        let config = PostureScoringConfig::default_weights();
        let attrs = HashMap::from([
            ("device:diskEncryption".into(), PostureValue::Bool(true)),
            ("device:firewallEnabled".into(), PostureValue::Bool(true)),
            ("device:antivirusInstalled".into(), PostureValue::Bool(true)),
            ("device:osUpdatePending".into(), PostureValue::Bool(false)),
            (
                "node:tunnetVersion".into(),
                PostureValue::String("0.7.0".into()),
            ),
            ("device:secureBoot".into(), PostureValue::Bool(true)),
        ]);
        assert_eq!(compute_posture_score(&attrs, &config), 100);
    }

    #[test]
    fn partial_score_on_failure() {
        let config = PostureScoringConfig::default_weights();
        let attrs = HashMap::from([
            ("device:diskEncryption".into(), PostureValue::Bool(false)),
            ("device:firewallEnabled".into(), PostureValue::Bool(true)),
            ("device:antivirusInstalled".into(), PostureValue::Bool(true)),
            ("device:osUpdatePending".into(), PostureValue::Bool(false)),
            (
                "node:tunnetVersion".into(),
                PostureValue::String("0.7.0".into()),
            ),
            ("device:secureBoot".into(), PostureValue::Bool(true)),
        ]);
        let score = compute_posture_score(&attrs, &config);
        assert_eq!(score, 75);
    }
}
