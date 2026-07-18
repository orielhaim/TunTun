#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use tunnet_policy_engine::{
    Format, content_hash, diff, export_hcl, export_json, export_yaml, parse_and_merge,
    parse_document, run_tests, simulate, validate,
};

fn format_from_str(s: &str) -> Result<Format> {
    match s.to_ascii_lowercase().as_str() {
        "json" => Ok(Format::Json),
        "hcl" => Ok(Format::Hcl),
        "yaml" | "yml" => Ok(Format::Yaml),
        other => Err(Error::from_reason(format!("unsupported format: {other}"))),
    }
}

/// Validate one or more policy document fragments (JSON/HCL/YAML).
#[napi]
pub fn policy_validate(documents_json: String, _run_tests: Option<bool>) -> Result<String> {
    let docs: Vec<serde_json::Value> =
        serde_json::from_str(&documents_json).map_err(|e| Error::from_reason(e.to_string()))?;
    let mut parsed = Vec::new();
    for doc in docs {
        let format = format_from_str(doc.get("format").and_then(|v| v.as_str()).unwrap_or("json"))?;
        let content = doc
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::from_reason("document.content required"))?;
        parsed.push((format, content.to_string()));
    }
    let merged = parse_and_merge(&parsed).map_err(|e| Error::from_reason(e.to_string()))?;
    let result = validate(&merged);
    let tests = if _run_tests.unwrap_or(false) {
        Some(run_tests(&merged))
    } else {
        None
    };
    serde_json::to_string(&serde_json::json!({
        "valid": result.valid,
        "errors": result.errors,
        "warnings": result.warnings,
        "hash": content_hash(&merged),
        "tests": tests,
    }))
    .map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub fn policy_simulate(
    document_json: String,
    format: String,
    src: String,
    dst: String,
    port: Option<u16>,
    protocol: Option<String>,
) -> Result<String> {
    let fmt = format_from_str(&format)?;
    let doc = parse_document(fmt, &document_json).map_err(|e| Error::from_reason(e.to_string()))?;
    let result = simulate(&doc, &src, &dst, port, protocol.as_deref().unwrap_or("tcp"));
    serde_json::to_string(&result).map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub fn policy_diff(a_json: String, b_json: String) -> Result<String> {
    let a = parse_document(Format::Json, &a_json).map_err(|e| Error::from_reason(e.to_string()))?;
    let b = parse_document(Format::Json, &b_json).map_err(|e| Error::from_reason(e.to_string()))?;
    let result = diff(&a, &b);
    serde_json::to_string(&result).map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub fn policy_export(document_json: String, format: String) -> Result<String> {
    let doc = parse_document(Format::Json, &document_json)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(match format.to_ascii_lowercase().as_str() {
        "hcl" => export_hcl(&doc),
        "yaml" | "yml" => export_yaml(&doc),
        _ => export_json(&doc),
    })
}

#[napi]
pub fn policy_content_hash(document_json: String) -> Result<String> {
    let doc = parse_document(Format::Json, &document_json)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(content_hash(&doc))
}
