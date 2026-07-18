use crate::evaluate::PostureAssertion;
use crate::platform::Platform;

/// User-facing remediation guidance for a failing assertion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemediationMessage {
    pub attribute: String,
    pub title: String,
    pub steps: Vec<String>,
}

/// Generate remediation messages for failing assertions.
pub fn remediation_for_failures(assertions: &[PostureAssertion]) -> Vec<RemediationMessage> {
    assertions
        .iter()
        .filter_map(|a| remediation_for_attribute(&a.attribute))
        .collect()
}

/// Generate a single remediation message for a known attribute.
pub fn remediation_for_attribute(attribute: &str) -> Option<RemediationMessage> {
    let base = attribute.split(':').nth(1).unwrap_or(attribute);
    let base = base.split(':').next().unwrap_or(base);

    match base {
        "diskEncryption" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Disk encryption is disabled".into(),
            steps: platform_steps(&[
                (
                    "macos",
                    "System Settings → Privacy & Security → FileVault → Turn On",
                ),
                (
                    "windows",
                    "Settings → Privacy & Security → Device encryption → Turn on",
                ),
                ("linux", "Contact your IT admin to enable LUKS encryption"),
            ]),
        }),
        "firewallEnabled" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Firewall is disabled".into(),
            steps: platform_steps(&[
                ("macos", "System Settings → Network → Firewall → Turn On"),
                (
                    "windows",
                    "Settings → Privacy & Security → Windows Security → Firewall → Turn on",
                ),
                ("linux", "Enable ufw or firewalld: `sudo ufw enable`"),
            ]),
        }),
        "antivirusInstalled" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Antivirus is not installed".into(),
            steps: platform_steps(&[
                (
                    "macos",
                    "Ensure XProtect is active or install your organization's EDR agent",
                ),
                (
                    "windows",
                    "Settings → Privacy & Security → Windows Security → Virus & threat protection",
                ),
                ("linux", "Install ClamAV or your organization's EDR agent"),
            ]),
        }),
        "osUpdatePending" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Operating system updates are pending".into(),
            steps: platform_steps(&[
                (
                    "macos",
                    "System Settings → General → Software Update → Install updates",
                ),
                ("windows", "Settings → Windows Update → Check for updates"),
                ("linux", "Run your package manager update command"),
            ]),
        }),
        "screenLockEnabled" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Screen lock is not enabled".into(),
            steps: platform_steps(&[
                (
                    "macos",
                    "System Settings → Lock Screen → Require password immediately",
                ),
                (
                    "windows",
                    "Settings → Accounts → Sign-in options → Screen timeout",
                ),
                (
                    "linux",
                    "Enable screensaver lock in your desktop environment settings",
                ),
            ]),
        }),
        "secureBoot" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Secure Boot is disabled".into(),
            steps: platform_steps(&[
                ("windows", "Restart into UEFI/BIOS and enable Secure Boot"),
                (
                    "linux",
                    "Enable Secure Boot in firmware settings (mokutil --sb-state)",
                ),
            ]),
        }),
        "tpmPresent" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "TPM is not present or not enabled".into(),
            steps: platform_steps(&[
                (
                    "windows",
                    "Enable TPM in firmware settings and verify with `tpm.msc`",
                ),
                ("linux", "Ensure TPM module is enabled in BIOS"),
            ]),
        }),
        "mdmManaged" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Device is not MDM-managed".into(),
            steps: vec!["Enroll this device in your organization's MDM solution".into()],
        }),
        "sipEnabled" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "System Integrity Protection (SIP) is disabled".into(),
            steps: vec!["Boot into Recovery Mode and run: csrutil enable".into()],
        }),
        "gatekeeperEnabled" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Gatekeeper is disabled".into(),
            steps: vec!["Run: sudo spctl --master-enable".into()],
        }),
        "postureScore" => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Device posture score is below the required threshold".into(),
            steps: vec![
                "Review failing posture checks and address each security requirement".into(),
            ],
        }),
        attr if attr.starts_with("fileExists") => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Required file is missing".into(),
            steps: vec!["Contact your IT admin to install the required file on this device".into()],
        }),
        attr if attr.starts_with("appRunning") => Some(RemediationMessage {
            attribute: attribute.to_string(),
            title: "Required application is not running".into(),
            steps: vec!["Start the required security application or contact your IT admin".into()],
        }),
        _ => None,
    }
}

/// Format remediation messages for display to the user.
pub fn format_remediation_messages(
    messages: &[RemediationMessage],
    grace_minutes: Option<u32>,
) -> Vec<String> {
    messages
        .iter()
        .map(|m| format_single_message(m, grace_minutes))
        .collect()
}

fn format_single_message(msg: &RemediationMessage, grace_minutes: Option<u32>) -> String {
    let mut out = format!("⚠ Device posture check failed: {}\n", msg.title);
    out.push_str("\nTo fix this:\n");
    for step in &msg.steps {
        out.push_str(&format!("• {step}\n"));
    }
    if let Some(mins) = grace_minutes {
        out.push_str(&format!(
            "\nYou have {mins} minutes before access may be revoked.\n"
        ));
    }
    out
}

fn platform_steps(steps: &[(&str, &str)]) -> Vec<String> {
    let current = Platform::current().as_str();
    let mut result = Vec::new();
    for (platform, step) in steps {
        if *platform == current {
            result.insert(0, format!("{platform}: {step}"));
        } else {
            result.push(format!("{platform}: {step}"));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::evaluate::{evaluate_posture, parse_assertion};

    #[test]
    fn generates_disk_encryption_remediation() {
        let assertion = parse_assertion("device:diskEncryption == true").unwrap();
        let result = evaluate_posture(&[assertion], &std::collections::HashMap::new());
        let msgs = remediation_for_failures(&result.failing_assertions);
        assert!(!msgs.is_empty());
        assert!(msgs[0].title.contains("encryption"));
    }
}
