use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use anyhow::Context;
use clap::{Args, Subcommand};
use tunnet_posture::{
    PostureEngine, PostureEngineConfig, PostureScoringConfig, PostureValue, compute_posture_score,
    evaluate_named_postures, parse_assertion,
};

use crate::output::Output;

#[derive(Subcommand, Debug)]
pub enum PostureCommand {
    /// Show locally collected posture attributes
    Status(PostureStatusArgs),
    /// Evaluate posture assertions (optional local file)
    Check(PostureCheckArgs),
}

#[derive(Args, Debug)]
pub struct PostureStatusArgs {
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug)]
pub struct PostureCheckArgs {
    /// Path to JSON file: { "posture:name": ["assertion", ...] }
    #[arg(long)]
    pub file: Option<PathBuf>,
    #[arg(long)]
    pub json: bool,
}

pub async fn run(command: PostureCommand) -> anyhow::Result<()> {
    match command {
        PostureCommand::Status(args) => run_status(args).await,
        PostureCommand::Check(args) => run_check(args).await,
    }
}

fn local_engine() -> PostureEngine {
    let config = PostureEngineConfig {
        tunnet_version: env!("CARGO_PKG_VERSION").to_string(),
        ..PostureEngineConfig::default()
    };
    PostureEngine::with_default_collectors(config)
}

async fn run_status(args: PostureStatusArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let engine = local_engine();
    engine.collect_once().await.context("collect posture")?;
    let attrs = engine.state().await.attributes;

    if out.json {
        let rows: Vec<_> = attrs
            .iter()
            .map(|(k, v)| serde_json::json!({ "attribute": k, "value": v }))
            .collect();
        out.print_json(&rows)?;
        return Ok(());
    }

    out.writeln(out.bold("Posture attributes"));
    if attrs.is_empty() {
        out.writeln(out.dim("  (none collected)"));
        return Ok(());
    }
    let mut keys: Vec<_> = attrs.keys().collect();
    keys.sort();
    for key in keys {
        let value = &attrs[key];
        out.writeln(format!("  {} = {}", out.cyan(key), value));
    }
    Ok(())
}

async fn run_check(args: PostureCheckArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let engine = local_engine();
    engine.collect_once().await.context("collect posture")?;
    let attrs = engine.state().await.attributes;

    let raw_definitions = if let Some(path) = args.file {
        let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        serde_json::from_str::<HashMap<String, Vec<String>>>(&raw)
            .context("parse posture definitions JSON")?
    } else {
        HashMap::new()
    };

    let definitions: HashMap<String, Vec<_>> = raw_definitions
        .into_iter()
        .map(|(name, lines)| {
            let assertions = lines
                .iter()
                .filter_map(|l| parse_assertion(l).ok())
                .collect();
            (name, assertions)
        })
        .collect();

    let names: Vec<String> = definitions.keys().cloned().collect();
    let summary = if definitions.is_empty() {
        tunnet_posture::PostureEvalSummary {
            passed: true,
            results: HashMap::new(),
        }
    } else {
        evaluate_named_postures(&definitions, &names, &attrs)
    };

    let score = compute_posture_score(&attrs, &PostureScoringConfig::default_weights());

    if out.json {
        let payload = serde_json::json!({
            "score": score,
            "results": summary.results.iter().map(|(name, r)| serde_json::json!({
                "name": name,
                "passed": r.passed,
                "failing_assertions": r.failing_assertions,
            })).collect::<Vec<_>>(),
            "attributes": attrs,
        });
        out.print_json(&payload)?;
        return Ok(());
    }

    out.writeln(out.bold("Posture check"));
    if definitions.is_empty() {
        out.writeln(out.dim("  No assertions file - showing score and attributes only."));
        out.writeln(format!("  Score: {}", out.green(&score.to_string())));
        for (k, v) in &attrs {
            out.writeln(format!("  {} = {}", out.cyan(k), format_value(v)));
        }
        return Ok(());
    }

    out.writeln(format!("  Score: {}", score_color(&out, score)));
    for (name, result) in &summary.results {
        let status = if result.passed {
            out.green("pass")
        } else {
            out.red("fail")
        };
        out.writeln(format!("  {} {}", out.cyan(name), status));
        for fail in &result.failing_assertions {
            out.writeln(format!(
                "    {}",
                out.dim(&format!("{} {:?}", fail.attribute, fail.operator))
            ));
        }
    }
    Ok(())
}

fn score_color(out: &Output, score: u32) -> String {
    if score >= 80 {
        out.green(&score.to_string())
    } else if score >= 50 {
        out.yellow(&score.to_string())
    } else {
        out.red(&score.to_string())
    }
}

fn format_value(value: &PostureValue) -> String {
    value.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tunnet_posture::evaluate_posture;

    #[test]
    fn parse_local_assertion_roundtrip() {
        let a = parse_assertion("device:diskEncryption == true").unwrap();
        let mut attrs = HashMap::new();
        attrs.insert("device:diskEncryption".into(), PostureValue::Bool(true));
        assert!(evaluate_posture(&[a], &attrs).passed);
    }
}
