// Windows Service implementation for Memento Daemon
// Uses the windows-service crate to properly integrate with SCM

use std::ffi::OsString;
use std::sync::Arc;
use std::time::Duration;

use windows_service::{
    define_windows_service,
    service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
};

use crate::core::ShutdownController;
use tracing::{error, info};

/// Service name - must match what's registered with sc.exe
pub const SERVICE_NAME: &str = "SearchEngineDaemon";
pub const SERVICE_DISPLAY_NAME: &str = "Memento AI Daemon";
pub const SERVICE_DESCRIPTION: &str = "Background screen capture and OCR service for Memento AI";

/// Windows Service type constants
const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

// Define the Windows service entry point
define_windows_service!(ffi_service_main, service_main);

/// Entry point for running as a Windows Service
pub fn run_as_service() -> Result<(), windows_service::Error> {
    // Register the service entry point and start dispatcher
    // This will block until the service is stopped
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
    Ok(())
}

/// Main service function called by Windows SCM
fn service_main(arguments: Vec<OsString>) {
    if let Err(e) = run_service(arguments) {
        error!("Service main failed: {:?}", e);
    }
}

/// Runs the service logic with proper SCM event handling
fn run_service(_arguments: Vec<OsString>) -> Result<(), windows_service::Error> {
    // Create the shutdown controller that will be triggered by SCM
    let shutdown_controller = Arc::new(ShutdownController::new());
    let shutdown_for_handler = Arc::clone(&shutdown_controller);

    // Create the service control handler
    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop => {
                info!("SCM requested service stop");
                shutdown_for_handler.request_shutdown();
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            ServiceControl::Shutdown => {
                info!("System shutdown - stopping service");
                shutdown_for_handler.request_shutdown();
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    // Register the service control handler
    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;

    // Report that we're starting
    status_handle.set_service_status(ServiceStatus {
        service_type: SERVICE_TYPE,
        current_state: ServiceState::StartPending,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::from_secs(30),
        process_id: None,
    })?;

    // Create the tokio runtime and run the actual daemon logic
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| {
            error!("Failed to create tokio runtime: {:?}", e);
            windows_service::Error::Winapi(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ))
        })?;

    // Clone shutdown controller for the daemon
    let daemon_shutdown = Arc::clone(&shutdown_controller);

    // Run the daemon in the runtime
    let result = runtime.block_on(async {
        // Report that we're now running
        status_handle
            .set_service_status(ServiceStatus {
                service_type: SERVICE_TYPE,
                current_state: ServiceState::Running,
                controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: Duration::ZERO,
                process_id: None,
            })
            .ok();

        // Run the actual daemon logic
        crate::run_daemon_logic(daemon_shutdown).await
    });

    // Report that we're stopping
    status_handle.set_service_status(ServiceStatus {
        service_type: SERVICE_TYPE,
        current_state: ServiceState::StopPending,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::from_secs(10),
        process_id: None,
    })?;

    // Give tasks a moment to clean up
    std::thread::sleep(Duration::from_millis(500));

    // Report stopped
    status_handle.set_service_status(ServiceStatus {
        service_type: SERVICE_TYPE,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: if result.is_ok() {
            ServiceExitCode::Win32(0)
        } else {
            ServiceExitCode::Win32(1)
        },
        checkpoint: 0,
        wait_hint: Duration::ZERO,
        process_id: None,
    })?;

    Ok(())
}

/// Check if the process is running as a Windows Service
/// Services are started with no console attached and specific environment
pub fn is_running_as_service() -> bool {
    // When run as a service, there's typically no console window
    // We can check for the --service flag or environment
    std::env::args().any(|arg| arg == "--service")
        || std::env::var("RUNNING_AS_SERVICE").is_ok()
}
