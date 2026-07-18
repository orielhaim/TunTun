mod diff;
mod error;
mod export;
mod hash;
mod ir;
mod merge;
mod parser;
mod selector;
mod simulate;
mod test_runner;
mod validate;

pub use diff::{DiffChange, DiffKind, DiffResult};
pub use error::{PolicyError, Result};
pub use export::{export_hcl, export_json, export_terraform, export_yaml};
pub use hash::{content_hash, fmt_json};
pub use ir::PolicyDocument;
pub use parser::Format;
pub use simulate::SimulateResult;
pub use test_runner::{TestCaseResult, TestResults};
pub use validate::{ValidationIssue, ValidationResult};

pub fn parse_document(format: Format, content: &str) -> Result<PolicyDocument> {
    parser::parse(format, content)
}

pub fn parse_and_merge(docs: &[(Format, String)]) -> Result<PolicyDocument> {
    let parsed: Result<Vec<_>> = docs
        .iter()
        .map(|(fmt, content)| parser::parse(*fmt, content))
        .collect();
    merge::merge_documents(&parsed?)
}

pub fn validate(doc: &PolicyDocument) -> ValidationResult {
    validate::validate(doc)
}

pub fn diff(a: &PolicyDocument, b: &PolicyDocument) -> DiffResult {
    diff::diff(a, b)
}

pub fn simulate(
    doc: &PolicyDocument,
    src: &str,
    dst: &str,
    port: Option<u16>,
    proto: &str,
) -> SimulateResult {
    simulate::simulate(doc, src, dst, port, proto)
}

pub fn run_tests(doc: &PolicyDocument) -> TestResults {
    test_runner::run_tests(doc)
}
