# Windows Service & Auto-Update Architecture

This document describes the Windows Service and Velopack auto-update system for Memento AI.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Setup.exe (Velopack)                     │
│  - Downloads: 5-10 MB (first install) or delta patch         │
│  - Installs to: %LOCALAPPDATA%\memento                       │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │ memento.exe │    │  memento-   │    │  service-   │
    │ (Tauri App) │    │ daemon.exe  │    │  helper.exe │
    │             │    │  (Service)  │    │ (Admin)     │
    └─────────────┘    └─────────────┘    └─────────────┘
         │                   │                   │
         │ Normal User       │ SYSTEM            │ Admin (UAC)
         │ Privileges        │ Service           │ on demand
         └───────────────────┴───────────────────┘
```

## Components

### 1. Daemon (`crates/daemon`)
A Windows Service that runs 24/7 for screen capture and OCR:
- Registered as `SearchEngineDaemon`
- Runs as LOCAL SYSTEM
- Handles SCM stop signals for graceful shutdown
- Supports both service mode (`--service`) and standalone mode

**ONNX Runtime**: The daemon uses `fastembed` for embeddings, which requires ONNX Runtime:
- `onnxruntime.lib` is statically linked (~300MB → ~77MB final binary)
- `DirectML.dll` (18MB) must be shipped alongside `memento-daemon.exe` for GPU acceleration
- Build scripts automatically copy `DirectML.dll` from `%LOCALAPPDATA%\ort.pyke.io\dfbin\`

### 2. Service Helper (`crates/service-helper`)
Admin-elevated helper for service management:
- Requests elevation via Windows manifest (`requireAdministrator`)
- Commands: `install`, `uninstall`, `start`, `stop`
- Sets service permissions for silent updates
- Only runs during first install and uninstall

### 3. Tauri App (`app/src-tauri`)
Main application (no elevation required):
- Velopack bootstrap runs FIRST in `main()`
- Can control service without UAC (after install)
- Checks for updates on startup

## UAC Behavior

| Event | UAC Prompt? | Why |
|-------|-------------|-----|
| First install | Yes (once) | service-helper registers service |
| Regular app launch | No | App runs as normal user |
| Update | No | Permissions set at install time |
| Uninstall | Yes (once) | service-helper removes service |

## Critical Implementation Notes

### Service Stop Signal Handling
The daemon MUST handle the Windows SCM stop signal properly. If it ignores the signal or takes too long, updates will hang because Windows won't let you replace a running binary.

```rust
// In service.rs - already implemented
ServiceControl::Stop => {
    shutdown_controller.request_shutdown();
    ServiceControlHandlerResult::NoError
}
```

### Velopack Bootstrap Order
Velopack MUST be initialized before anything else in `main()`:

```rust
fn main() {
    // CRITICAL: Must be FIRST
    match velopack::init() {
        Ok(true) => tauri_app_lib::run(),
        Ok(false) => { /* hook ran, exit */ }
        Err(e) => { /* handle error */ }
    }
}
```

### Service Permissions (`sc sdset`)
This is set once during install to allow non-admin control:

```
D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)   # Local System - full control
  (A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)  # Admins - full control  
  (A;;CCLCSWLOCRRC;;;BU)         # Users - read/start/stop
  (A;;RPWPCR;;;BU)               # Users - can control
```

### Update Flow
1. App checks GitHub releases for new version
2. Downloads delta patch (or full package)
3. **Stops the service** (important!)
4. Waits for service to fully stop (polling)
5. Velopack applies update
6. App restarts
7. Post-update hook starts service with new binary

## File Locations

| Item | Location |
|------|----------|
| App installation | `%LOCALAPPDATA%\memento\current\` |
| User data | `%APPDATA%\Memento\` |
| Model files | `%APPDATA%\Memento\models\` |
| Logs | `%APPDATA%\Memento\logs\` |
| Database | `%APPDATA%\Memento\data\` |

⚠️ **IMPORTANT**: Never store user data in the Velopack `current` folder. It gets replaced on every update.

## Building

### Local Build
```powershell
.\scripts\build-release.ps1 -Version "1.0.0"
```

### CI Build
Push a tag to trigger the GitHub Actions workflow:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## Rollback
Rollbacks download the full package (not delta):

```rust
// Must enable version_downgrade
options.allow_version_downgrade = true;

// Must explicitly call apply - not automatic
um.apply_updates_and_restart(&rollback_info)?;
```

## Troubleshooting

### Service won't stop
```powershell
# Check service status
sc query SearchEngineDaemon

# Force kill if needed
taskkill /F /IM memento-daemon.exe

# Then delete service
sc delete SearchEngineDaemon
```

### Update hangs
Usually means the daemon isn't stopping properly. Check:
1. Is `ShutdownController.request_shutdown()` being called?
2. Are all spawned tasks checking the shutdown signal?
3. Is there a timeout on task cleanup?

### Permissions denied during update
Run the service helper manually to reset permissions:
```powershell
.\service-helper.exe install --daemon-path "C:\path\to\memento-daemon.exe"
```
