use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use clap::{Args, Subcommand};
use tunnet_policy_engine::{
    Format, PolicyDocument, content_hash, export_hcl, export_json, export_terraform, export_yaml,
    fmt_json, parse_and_merge, parse_document, run_tests, simulate, validate,
};

use crate::output::Output;
use crate::policy_api::{PolicyApi, require_ok};

#[derive(Subcommand, Debug)]
pub enum PolicyCommand {
    /// Validate policy document schema and references
    Validate(PolicyPathArgs),
    /// Run embedded policy tests
    Test(PolicyPathArgs),
    /// Simulate traffic between selectors
    Simulate(PolicySimulateArgs),
    /// Format policy JSON (canonical sorted keys)
    Fmt(PolicyPathArgs),
    /// Export policy document to another format
    Export(PolicyExportArgs),
    /// Semantic diff against live control plane
    Diff(PolicyRemotePathArgs),
    /// Apply policy document to live control plane
    Apply(PolicyApplyArgs),
    /// Detect drift between local document and live state
    Drift(PolicyRemotePathArgs),
    /// Show policy revision history
    History(PolicyHistoryArgs),
    /// Rollback to a previous revision
    Rollback(PolicyRollbackArgs),
}

#[derive(Args, Debug)]
pub struct PolicyPathArgs {
    /// Policy file or directory (.json, .hcl, .yaml)
    pub path: PathBuf,
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug)]
pub struct PolicyRemotePathArgs {
    /// Policy file or directory (.json, .hcl, .yaml)
    pub path: PathBuf,
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug)]
pub struct PolicyApplyArgs {
    /// Policy file or directory (.json, .hcl, .yaml)
    pub path: PathBuf,
    /// Overwrite even when live state has drifted
    #[arg(long)]
    pub force: bool,
    /// Expected base revision / content hash for optimistic concurrency
    #[arg(long)]
    pub base_revision: Option<String>,
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug)]
pub struct PolicyHistoryArgs {
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug)]
pub struct PolicyRollbackArgs {
    #[arg(long)]
    pub revision_id: String,
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug)]
pub struct PolicySimulateArgs {
    #[arg(long)]
    pub src: String,
    #[arg(long)]
    pub dst: String,
    #[arg(long)]
    pub port: Option<u16>,
    #[arg(long, default_value = "tcp")]
    pub protocol: String,
    #[arg(long, short = 'f')]
    pub file: PathBuf,
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug)]
pub struct PolicyExportArgs {
    /// Source policy file or directory (local export)
    #[arg(long)]
    pub from_file: Option<PathBuf>,
    /// Export from live control plane (requires API env vars)
    #[arg(long)]
    pub remote: bool,
    #[arg(long, value_enum, default_value_t = ExportFormatArg::Json)]
    pub format: ExportFormatArg,
    #[arg(long)]
    pub out: Option<PathBuf>,
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Clone, Copy, clap::ValueEnum)]
pub enum ExportFormatArg {
    Json,
    Hcl,
    Yaml,
    Terraform,
}

pub async fn run(command: PolicyCommand) -> Result<()> {
    match command {
        PolicyCommand::Validate(args) => run_validate(args),
        PolicyCommand::Test(args) => run_test(args),
        PolicyCommand::Simulate(args) => run_simulate(args),
        PolicyCommand::Fmt(args) => run_fmt(args),
        PolicyCommand::Export(args) => run_export(args).await,
        PolicyCommand::Diff(args) => run_diff(args).await,
        PolicyCommand::Apply(args) => run_apply(args).await,
        PolicyCommand::Drift(args) => run_drift(args).await,
        PolicyCommand::History(args) => run_history(args).await,
        PolicyCommand::Rollback(args) => run_rollback(args).await,
    }
}

fn documents_payload(path: &Path) -> Result<Vec<serde_json::Value>> {
    let mut out = Vec::new();
    if path.is_file() {
        let content =
            fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let format = Format::from_path(path.to_string_lossy().as_ref())
            .context("unsupported file extension; use .json, .hcl, or .yaml")?;
        out.push(serde_json::json!({
            "path": path.display().to_string(),
            "format": format_str(format),
            "content": content,
        }));
        return Ok(out);
    }
    if path.is_dir() {
        let mut docs = Vec::new();
        collect_policy_files(path, &mut docs)?;
        for (i, (format, content)) in docs.into_iter().enumerate() {
            out.push(serde_json::json!({
                "path": format!("fragment-{i}.{}", format_str(format)),
                "format": format_str(format),
                "content": content,
            }));
        }
        return Ok(out);
    }
    bail!("path not found: {}", path.display())
}

fn format_str(format: Format) -> &'static str {
    match format {
        Format::Json => "json",
        Format::Hcl => "hcl",
        Format::Yaml => "yaml",
    }
}

async fn run_diff(args: PolicyRemotePathArgs) -> Result<()> {
    let out = Output::new(args.json);
    let api = PolicyApi::from_env()?;
    let body = serde_json::json!({ "documents": documents_payload(&args.path)? });
    let (status, value) = api.post_json("/policy/diff", &body).await?;
    require_ok(status, &value, "policy diff")?;
    if out.json {
        out.print_json(&value)?;
    } else {
        println!("{}", serde_json::to_string_pretty(&value)?);
    }
    Ok(())
}

async fn run_apply(args: PolicyApplyArgs) -> Result<()> {
    let out = Output::new(args.json);
    let api = PolicyApi::from_env()?;
    let mut body = serde_json::json!({
        "documents": documents_payload(&args.path)?,
        "force": args.force,
    });
    if let Some(rev) = &args.base_revision {
        body["baseRevision"] = serde_json::json!(rev);
    }
    let (status, value) = api.post_json("/policy/apply", &body).await?;
    if status == 409 {
        if out.json {
            out.print_json(&value)?;
        } else {
            eprintln!("drift detected - re-run with --force to overwrite");
            println!("{}", serde_json::to_string_pretty(&value)?);
        }
        std::process::exit(1);
    }
    require_ok(status, &value, "policy apply")?;
    if out.json {
        out.print_json(&value)?;
    } else {
        println!("applied: {value}");
    }
    Ok(())
}

async fn run_drift(args: PolicyRemotePathArgs) -> Result<()> {
    let out = Output::new(args.json);
    let api = PolicyApi::from_env()?;
    let body = serde_json::json!({ "documents": documents_payload(&args.path)? });
    let (status, value) = api.post_json("/policy/drift", &body).await?;
    require_ok(status, &value, "policy drift")?;
    if out.json {
        out.print_json(&value)?;
    } else {
        println!("{}", serde_json::to_string_pretty(&value)?);
    }
    Ok(())
}

async fn run_history(args: PolicyHistoryArgs) -> Result<()> {
    let out = Output::new(args.json);
    let api = PolicyApi::from_env()?;
    let (status, value) = api.get_json("/policy/history").await?;
    require_ok(status, &value, "policy history")?;
    if out.json {
        out.print_json(&value)?;
    } else {
        println!("{}", serde_json::to_string_pretty(&value)?);
    }
    Ok(())
}

async fn run_rollback(args: PolicyRollbackArgs) -> Result<()> {
    let out = Output::new(args.json);
    let api = PolicyApi::from_env()?;
    let body = serde_json::json!({ "revisionId": args.revision_id });
    let (status, value) = api.post_json("/policy/rollback", &body).await?;
    require_ok(status, &value, "policy rollback")?;
    if out.json {
        out.print_json(&value)?;
    } else {
        println!("rolled back: {value}");
    }
    Ok(())
}

fn run_validate(args: PolicyPathArgs) -> Result<()> {
    let out = Output::new(args.json);
    let doc = load_policy(&args.path)?;
    let result = validate(&doc);

    if out.json {
        out.print_json(&serde_json::json!({
            "valid": result.valid,
            "errors": result.errors,
            "warnings": result.warnings,
        }))?;
    } else if result.valid {
        println!("policy: ok (hash {})", content_hash(&doc));
        for w in &result.warnings {
            eprintln!(
                "warning{}: {}",
                w.path
                    .as_deref()
                    .map(|p| format!(" [{p}]"))
                    .unwrap_or_default(),
                w.message
            );
        }
    } else {
        for e in &result.errors {
            eprintln!(
                "error{}: {}",
                e.path
                    .as_deref()
                    .map(|p| format!(" [{p}]"))
                    .unwrap_or_default(),
                e.message
            );
        }
        bail!("{} validation error(s)", result.errors.len());
    }

    if !result.valid {
        std::process::exit(1);
    }
    Ok(())
}

fn run_test(args: PolicyPathArgs) -> Result<()> {
    let out = Output::new(args.json);
    let doc = load_policy(&args.path)?;
    let results = run_tests(&doc);

    if out.json {
        out.print_json(&serde_json::json!({
            "passed": results.passed,
            "failed": results.failed,
            "results": results.results,
        }))?;
    } else {
        for case in &results.results {
            if case.passed {
                println!("PASS  {}", case.name);
            } else {
                eprintln!(
                    "FAIL  {}{}",
                    case.name,
                    case.message
                        .as_deref()
                        .map(|m| format!(" - {m}"))
                        .unwrap_or_default()
                );
            }
        }
        println!("\n{} passed, {} failed", results.passed, results.failed);
    }

    if results.failed > 0 {
        std::process::exit(1);
    }
    Ok(())
}

fn run_simulate(args: PolicySimulateArgs) -> Result<()> {
    let out = Output::new(args.json);
    let doc = load_policy(&args.file)?;
    let result = simulate(&doc, &args.src, &args.dst, args.port, &args.protocol);

    if out.json {
        out.print_json(&serde_json::json!({
            "src": args.src,
            "dst": args.dst,
            "port": args.port,
            "protocol": args.protocol,
            "verdict": result.verdict,
            "matched_rules": result.matched_rules,
        }))?;
    } else {
        println!("verdict: {}", result.verdict);
        if result.matched_rules.is_empty() {
            println!("matched: (none)");
        } else {
            println!("matched: {}", result.matched_rules.join(", "));
        }
    }
    Ok(())
}

fn run_fmt(args: PolicyPathArgs) -> Result<()> {
    let doc = load_policy(&args.path)?;
    let formatted = fmt_json(&doc);
    let path = if args.path.is_dir() {
        args.path.join("policy.json")
    } else {
        args.path.clone()
    };
    fs::write(&path, formatted).with_context(|| format!("write {}", path.display()))?;
    println!("formatted {}", path.display());
    Ok(())
}

async fn run_export(args: PolicyExportArgs) -> Result<()> {
    let out = Output::new(args.json);

    if args.remote {
        let api = PolicyApi::from_env()?;
        let format = match args.format {
            ExportFormatArg::Json => "json",
            ExportFormatArg::Hcl => "hcl",
            ExportFormatArg::Yaml => "yaml",
            ExportFormatArg::Terraform => "json",
        };
        let (status, value) = api
            .get_json(&format!("/policy/export?format={format}"))
            .await?;
        require_ok(status, &value, "policy export")?;
        let content = value
            .get("content")
            .and_then(|c| c.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| serde_json::to_string_pretty(&value).unwrap_or_default());
        if let Some(out_path) = &args.out {
            fs::write(out_path, &content)
                .with_context(|| format!("write {}", out_path.display()))?;
            println!("wrote {}", out_path.display());
        } else if out.json {
            out.print_json(&value)?;
        } else {
            print!("{content}");
        }
        return Ok(());
    }

    let Some(from) = &args.from_file else {
        bail!("provide --from-file <path> or --remote");
    };

    let doc = load_policy(from)?;
    let rendered = match args.format {
        ExportFormatArg::Json => export_json(&doc),
        ExportFormatArg::Hcl => export_hcl(&doc),
        ExportFormatArg::Yaml => export_yaml(&doc),
        ExportFormatArg::Terraform => export_terraform(&doc),
    };

    if let Some(out_path) = &args.out {
        if out_path.is_dir() {
            let filename = match args.format {
                ExportFormatArg::Json => "policy.json",
                ExportFormatArg::Hcl => "policy.hcl",
                ExportFormatArg::Yaml => "policy.yaml",
                ExportFormatArg::Terraform => "groups.tf",
            };
            let file = out_path.join(filename);
            fs::write(&file, &rendered).with_context(|| format!("write {}", file.display()))?;
            println!("wrote {}", file.display());
        } else {
            fs::write(out_path, &rendered)
                .with_context(|| format!("write {}", out_path.display()))?;
            println!("wrote {}", out_path.display());
        }
    } else if out.json {
        out.print_json(&serde_json::json!({ "content": rendered }))?;
    } else {
        print!("{rendered}");
    }
    Ok(())
}

pub fn load_policy(path: &Path) -> Result<PolicyDocument> {
    if path.is_file() {
        let content =
            fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let format = Format::from_path(path.to_string_lossy().as_ref())
            .context("unsupported file extension; use .json, .hcl, or .yaml")?;
        return parse_document(format, &content).context("parse policy document");
    }

    if path.is_dir() {
        let mut docs = Vec::new();
        collect_policy_files(path, &mut docs)?;
        if docs.is_empty() {
            bail!("no policy files found under {}", path.display());
        }
        return parse_and_merge(&docs).context("parse and merge policy fragments");
    }

    bail!("path not found: {}", path.display())
}

fn collect_policy_files(dir: &Path, docs: &mut Vec<(Format, String)>) -> Result<()> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .with_context(|| format!("read dir {}", dir.display()))?
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.path());

    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            collect_policy_files(&path, docs)?;
            continue;
        }
        let Some(format) = Format::from_path(path.to_string_lossy().as_ref()) else {
            continue;
        };
        let content =
            fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        docs.push((format, content));
    }
    Ok(())
}
