//! Windows Service Control Manager (SCM) integration.
//!
//! When launched as `tunnet.exe run --service`, the process must call
//! `StartServiceCtrlDispatcher` promptly, report `SERVICE_RUNNING`, and honor
//! `SERVICE_CONTROL_STOP`. Without this, SCM leaves the service stuck in
//! "Starting" and cannot stop it cleanly.

#![cfg(windows)]

use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use anyhow::Context;
use clap::Parser;
use tokio_util::sync::CancellationToken;
use windows_service::define_windows_service;
use windows_service::service::{
    ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl, ServiceExitCode,
    ServiceInfo, ServiceStartType, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::service_dispatcher;
use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};

use crate::cli::Cli;

pub const SERVICE_NAME: &str = "tunnet";
const SERVICE_DISPLAY_NAME: &str = "Tunnet Agent";
const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

define_windows_service!(ffi_service_main, service_main);

/// Enter the SCM dispatcher. Blocks until the service stops.
/// Must be called from the process entry point before a tokio runtime is built.
pub fn run_as_service() -> anyhow::Result<()> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)
        .context("StartServiceCtrlDispatcher failed (run via `tunnet service start`, not console)")
}

fn service_main(_arguments: Vec<OsString>) {
    if let Err(e) = run_service() {
        // No console under SCM - best-effort log if tracing was initialized.
        eprintln!("tunnet service failed: {e:#}");
    }
}

fn run_service() -> anyhow::Result<()> {
    let (shutdown_tx, shutdown_rx) = mpsc::channel();

    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            ServiceControl::Stop | ServiceControl::Shutdown => {
                let _ = shutdown_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)
        .context("RegisterServiceCtrlHandler")?;

    status_handle
        .set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::StartPending,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 1,
            wait_hint: Duration::from_secs(30),
            process_id: None,
        })
        .context("report StartPending")?;

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("create tokio runtime")?;

    let token = CancellationToken::new();

    status_handle
        .set_service_status(ServiceStatus {
            service_type: SERVICE_TYPE,
            current_state: ServiceState::Running,
            controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })
        .context("report Running")?;

    let exit = runtime.block_on(async {
        let app_token = token.clone();
        tokio::spawn(async move {
            let _ = tokio::task::spawn_blocking(move || shutdown_rx.recv()).await;
            token.cancel();
            let _ = status_handle.set_service_status(ServiceStatus {
                service_type: SERVICE_TYPE,
                current_state: ServiceState::StopPending,
                controls_accepted: ServiceControlAccept::empty(),
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 1,
                wait_hint: Duration::from_secs(30),
                process_id: None,
            });
        });

        run_agent_service(app_token).await
    });

    let win32_exit = if exit.is_ok() { 0 } else { 1 };
    let _ = status_handle.set_service_status(ServiceStatus {
        service_type: SERVICE_TYPE,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(win32_exit),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    });

    exit
}

async fn run_agent_service(shutdown: CancellationToken) -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let cli = Cli::parse();
    crate::cli::init_logging(&cli);

    match cli.command {
        crate::cli::Command::Run(args) => {
            crate::cli::run_agent_with_shutdown(args, cli.state_dir.as_deref(), Some(shutdown))
                .await
        }
        _ => anyhow::bail!("Windows service must be started as `tunnet run --service`"),
    }
}

/// Install (or update) the Tunnet service via the SCM API - avoids `sc create` quoting bugs.
pub fn install(exe: &str, state_dir: Option<&str>) -> anyhow::Result<()> {
    let dir = state_dir
        .map(str::to_string)
        .unwrap_or_else(|| tunnet_core::StatePaths::system_dir().display().to_string());
    let _ = std::process::Command::new("setx")
        .args(["TUNNET_STATE_DIR", &dir, "/M"])
        .status();

    let manager_access = ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE;
    let manager = ServiceManager::local_computer(None::<&str>, manager_access)
        .context("open Service Control Manager (need Administrator)")?;

    let service_info = ServiceInfo {
        name: OsString::from(SERVICE_NAME),
        display_name: OsString::from(SERVICE_DISPLAY_NAME),
        service_type: SERVICE_TYPE,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: PathBuf::from(exe),
        launch_arguments: vec![OsString::from("run"), OsString::from("--service")],
        dependencies: vec![],
        account_name: None,
        account_password: None,
    };

    match manager.open_service(
        SERVICE_NAME,
        ServiceAccess::CHANGE_CONFIG | ServiceAccess::START,
    ) {
        Ok(service) => {
            service
                .change_config(&service_info)
                .context("update existing tunnet service config")?;
            let _ = service.set_description("Tunnet mesh agent");
        }
        Err(_) => {
            let service = manager
                .create_service(
                    &service_info,
                    ServiceAccess::CHANGE_CONFIG | ServiceAccess::START,
                )
                .context("create tunnet service")?;
            let _ = service.set_description("Tunnet mesh agent");
        }
    }

    // Failure restart policy (same intent as former `sc failure`).
    let _ = std::process::Command::new("sc")
        .args(["failure", SERVICE_NAME, "reset= 0", "actions= restart/2000"])
        .status();

    Ok(())
}

pub fn uninstall() -> anyhow::Result<()> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
        .context("open Service Control Manager")?;
    let service = manager
        .open_service(SERVICE_NAME, ServiceAccess::DELETE | ServiceAccess::STOP)
        .context("open tunnet service")?;
    let _ = service.stop();
    // Give SCM a moment to release the service before delete.
    std::thread::sleep(Duration::from_millis(500));
    service.delete().context("delete tunnet service")?;
    Ok(())
}
