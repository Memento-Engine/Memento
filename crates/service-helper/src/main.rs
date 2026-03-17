// Service Helper - Admin-elevated tool for managing the Memento Daemon service
// This executable requests admin elevation via its manifest and handles:
// - Service installation with proper permissions
// - Service uninstallation
// - Service start/stop

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use std::process::{Command, ExitCode};

/// Service name constants
const SERVICE_NAME: &str = "SearchEngineDaemon";
const SERVICE_DISPLAY_NAME: &str = "Memento AI Daemon";
const SERVICE_DESCRIPTION: &str = "Background screen capture and OCR service for Memento AI";

/// SDDL string that grants:
/// - Full control to Local System (SY)
/// - Full control to Administrators (BA)  
/// - Read, Start, Stop, Query status to Built-in Users (BU)
/// This allows non-admin users to control the service after installation
const SERVICE_SDDL: &str = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;BU)(A;;RPWPCR;;;BU)";

#[derive(Parser)]
#[command(name = "service-helper")]
#[command(about = "Admin helper for Memento AI service management")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Install the service and configure permissions
    Install {
        /// Path to the daemon executable
        #[arg(long)]
        daemon_path: String,
    },
    /// Uninstall the service
    Uninstall,
    /// Start the service
    Start,
    /// Stop the service
    Stop,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Install { daemon_path } => install_service(&daemon_path),
        Commands::Uninstall => uninstall_service(),
        Commands::Start => start_service(),
        Commands::Stop => stop_service(),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("Error: {:#}", e);
            ExitCode::FAILURE
        }
    }
}

/// Install the service with proper permissions and failure recovery
fn install_service(daemon_path: &str) -> Result<()> {
    println!("Installing service: {}", SERVICE_NAME);

    // 1. Create the service
    // Note: Path must be quoted for paths with spaces, and binPath= needs space before value
    let bin_path = format!("\"{}\" --service", daemon_path);
    
    let output = Command::new("sc")
        .args([
            "create",
            SERVICE_NAME,
            &format!("binPath= {}", bin_path),
            &format!("DisplayName= {}", SERVICE_DISPLAY_NAME),
            "start= auto",
            "type= own",
        ])
        .output()
        .context("Failed to run sc create")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check if service already exists (error 1073)
        if !stderr.contains("1073") {
            return Err(anyhow!("sc create failed: {}", stderr));
        }
        println!("Service already exists, updating configuration...");
    } else {
        println!("Service created successfully");
    }

    // 2. Set service description
    let _ = Command::new("sc")
        .args(["description", SERVICE_NAME, SERVICE_DESCRIPTION])
        .output();

    // 3. Set failure recovery (restart on crash)
    let output = Command::new("sc")
        .args([
            "failure",
            SERVICE_NAME,
            "reset= 86400",      // Reset failure count after 24 hours
            "actions= restart/5000/restart/10000/restart/30000",  // Restart after 5s, 10s, then 30s
        ])
        .output()
        .context("Failed to run sc failure")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("Warning: Failed to set failure recovery: {}", stderr);
    } else {
        println!("Failure recovery configured");
    }

    // 4. Set service permissions - THIS IS CRITICAL FOR SILENT UPDATES
    // This allows non-admin users to stop/start the service
    let output = Command::new("sc")
        .args(["sdset", SERVICE_NAME, SERVICE_SDDL])
        .output()
        .context("Failed to run sc sdset")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("sc sdset failed: {}. This is critical for silent updates!", stderr));
    }
    println!("Service permissions configured for silent updates");

    // 5. Start the service
    let output = Command::new("sc")
        .args(["start", SERVICE_NAME])
        .output()
        .context("Failed to start service")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("Warning: Service did not start: {}", stderr);
    } else {
        println!("Service started");
    }

    println!("Service installation complete!");
    Ok(())
}

/// Uninstall the service
fn uninstall_service() -> Result<()> {
    println!("Uninstalling service: {}", SERVICE_NAME);

    // 1. Stop the service first
    let _ = Command::new("sc")
        .args(["stop", SERVICE_NAME])
        .output();

    // Wait a moment for the service to stop
    std::thread::sleep(std::time::Duration::from_secs(2));

    // 2. Delete the service
    let output = Command::new("sc")
        .args(["delete", SERVICE_NAME])
        .output()
        .context("Failed to run sc delete")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check if service doesn't exist (error 1060)
        if stderr.contains("1060") {
            println!("Service was already uninstalled");
            return Ok(());
        }
        return Err(anyhow!("sc delete failed: {}", stderr));
    }

    println!("Service uninstalled successfully");
    Ok(())
}

/// Start the service
fn start_service() -> Result<()> {
    let output = Command::new("sc")
        .args(["start", SERVICE_NAME])
        .output()
        .context("Failed to run sc start")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check if already running (error 1056)
        if stderr.contains("1056") {
            println!("Service is already running");
            return Ok(());
        }
        return Err(anyhow!("sc start failed: {}", stderr));
    }

    println!("Service started successfully");
    Ok(())
}

/// Stop the service
fn stop_service() -> Result<()> {
    let output = Command::new("sc")
        .args(["stop", SERVICE_NAME])
        .output()
        .context("Failed to run sc stop")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check if already stopped (error 1062)
        if stderr.contains("1062") {
            println!("Service is already stopped");
            return Ok(());
        }
        return Err(anyhow!("sc stop failed: {}", stderr));
    }

    // Wait for service to fully stop
    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        let output = Command::new("sc")
            .args(["query", SERVICE_NAME])
            .output()?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("STOPPED") {
            println!("Service stopped successfully");
            return Ok(());
        }
    }

    eprintln!("Warning: Service may not have fully stopped after 10 seconds");
    Ok(())
}
