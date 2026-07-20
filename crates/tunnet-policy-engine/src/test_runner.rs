use crate::ir::PolicyDocument;
use crate::simulate::simulate;

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct TestResults {
    pub passed: usize,
    pub failed: usize,
    pub results: Vec<TestCaseResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct TestCaseResult {
    pub name: String,
    pub passed: bool,
    pub message: Option<String>,
}

pub fn run_tests(doc: &PolicyDocument) -> TestResults {
    let mut results = Vec::new();
    let mut passed = 0usize;
    let mut failed = 0usize;

    for test in &doc.tests {
        let mut messages = Vec::new();

        for dst in &test.accept {
            let (dst_sel, port, proto) = split_dst(dst);
            let result = simulate(doc, &test.src, &dst_sel, port, &proto);
            if result.verdict != "allow" {
                messages.push(format!(
                    "expected allow for dst '{dst}', got {} (rules: {:?})",
                    result.verdict, result.matched_rules
                ));
            }
        }

        for dst in &test.deny {
            let (dst_sel, port, proto) = split_dst(dst);
            let result = simulate(doc, &test.src, &dst_sel, port, &proto);
            if result.verdict != "deny" {
                messages.push(format!(
                    "expected deny for dst '{dst}', got {} (rules: {:?})",
                    result.verdict, result.matched_rules
                ));
            }
        }

        let ok = messages.is_empty();
        if ok {
            passed += 1;
        } else {
            failed += 1;
        }
        results.push(TestCaseResult {
            name: test.name.clone(),
            passed: ok,
            message: if messages.is_empty() {
                None
            } else {
                Some(messages.join("; "))
            },
        });
    }

    TestResults {
        passed,
        failed,
        results,
    }
}

/// Optional `selector:port/proto` suffix, e.g. `tag:staging:443/tcp`.
fn split_dst(dst: &str) -> (String, Option<u16>, String) {
    let parts: Vec<&str> = dst.rsplitn(2, ':').collect();
    if parts.len() == 2
        && let Ok(port) = parts[0]
            .split('/')
            .next()
            .unwrap_or(parts[0])
            .parse::<u16>()
    {
        let selector = parts[1].to_string();
        let proto = parts[0].split('/').nth(1).unwrap_or("tcp").to_string();
        return (selector, Some(port), proto);
    }
    (dst.to_string(), None, "tcp".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{AclRule, PolicyTest, TagDefinition};

    #[test]
    fn run_tests_accept_and_deny_pass() {
        let doc = PolicyDocument {
            tags: vec![
                TagDefinition {
                    name: "eng".into(),
                    owners: vec![],
                },
                TagDefinition {
                    name: "staging".into(),
                    owners: vec![],
                },
            ],
            acls: vec![
                AclRule {
                    name: "allow-eng-staging".into(),
                    slug: None,
                    action: "allow".into(),
                    src: vec!["tag:eng".into()],
                    dst: vec!["tag:staging".into()],
                    ports: vec!["443".into()],
                    protocol: Some("tcp".into()),
                    priority: 100,
                    posture: vec![],
                    labels: Default::default(),
                    enabled: true,
                },
                AclRule {
                    name: "default-deny".into(),
                    slug: None,
                    action: "deny".into(),
                    src: vec!["*".into()],
                    dst: vec!["*".into()],
                    ports: vec![],
                    protocol: None,
                    priority: 1,
                    posture: vec![],
                    labels: Default::default(),
                    enabled: true,
                },
            ],
            tests: vec![
                PolicyTest {
                    name: "eng-can-reach-staging".into(),
                    src: "tag:eng".into(),
                    accept: vec!["tag:staging:443/tcp".into()],
                    deny: vec![],
                },
                PolicyTest {
                    name: "eng-denied-elsewhere".into(),
                    src: "tag:eng".into(),
                    accept: vec![],
                    deny: vec!["tag:prod".into()],
                },
            ],
            ..Default::default()
        };

        let results = run_tests(&doc);
        assert_eq!(results.passed, 2);
        assert_eq!(results.failed, 0);
        assert!(results.results.iter().all(|r| r.passed));
    }
}
