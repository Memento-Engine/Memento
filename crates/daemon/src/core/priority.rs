use tracing::{debug, error, info};

/// Set process priority to below normal for background operation
/// This ensures the daemon doesn't compete with user applications for CPU
pub fn set_process_priority() -> bool {
    #[cfg(target_os = "windows")]
    {
        set_windows_priority()
    }
    
    #[cfg(target_os = "linux")]
    {
        set_linux_priority()
    }
    
    #[cfg(target_os = "macos")]
    {
        set_macos_priority()
    }
}

#[cfg(target_os = "windows")]
fn set_windows_priority() -> bool {
    use windows::Win32::System::Threading::{
        GetCurrentProcess, SetPriorityClass, SetProcessPriorityBoost,
        BELOW_NORMAL_PRIORITY_CLASS,
    };
    
    unsafe {
        let process = GetCurrentProcess();
        
        // Set to BELOW_NORMAL priority (lower than normal apps)
        if let Err(e) = SetPriorityClass(process, BELOW_NORMAL_PRIORITY_CLASS) {
            error!("Failed to set process priority: {:?}", e);
            return false;
        }
        
        // Disable priority boost when process gains focus
        // This prevents the daemon from momentarily getting higher priority
        if let Err(e) = SetProcessPriorityBoost(process, true.into()) {
            debug!("Failed to disable priority boost: {:?}", e);
            // Non-fatal, continue anyway
        }
        
        info!("Process priority set to BELOW_NORMAL for background operation");
        true
    }
}

#[cfg(target_os = "linux")]
fn set_linux_priority() -> bool {
    use libc::{setpriority, PRIO_PROCESS};
    
    // Nice value 10 (range -20 to 19, higher = lower priority)
    let result = unsafe { setpriority(PRIO_PROCESS, 0, 10) };
    
    if result == 0 {
        info!("Process nice level set to 10 for background operation");
        true
    } else {
        error!("Failed to set process nice level: {}", std::io::Error::last_os_error());
        false
    }
}

#[cfg(target_os = "macos")]
fn set_macos_priority() -> bool {
    use libc::{setpriority, PRIO_PROCESS};
    
    // Same as Linux - use nice value
    let result = unsafe { setpriority(PRIO_PROCESS, 0, 10) };
    
    if result == 0 {
        info!("Process nice level set to 10 for background operation");
        true
    } else {
        error!("Failed to set process nice level: {}", std::io::Error::last_os_error());
        false
    }
}

/// Set thread priority for specific worker threads
pub fn set_thread_priority_low() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Threading::{
            GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL,
        };
        
        unsafe {
            let thread = GetCurrentThread();
            if let Err(e) = SetThreadPriority(thread, THREAD_PRIORITY_BELOW_NORMAL) {
                debug!("Failed to set thread priority: {:?}", e);
                return false;
            }
            true
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, thread priority is typically inherited from process
        true
    }
}

/// Check if running on battery (for throttling decisions)
pub fn is_on_battery() -> bool {
    #[cfg(target_os = "windows")]
    {
        check_battery_windows()
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        false // Conservative default
    }
}

#[cfg(target_os = "windows")]
fn check_battery_windows() -> bool {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    
    let mut status = SYSTEM_POWER_STATUS::default();
    
    unsafe {
        if GetSystemPowerStatus(&mut status).is_ok() {
            // ACLineStatus: 0 = Offline (battery), 1 = Online (AC), 255 = Unknown
            return status.ACLineStatus == 0;
        }
    }
    
    false
}
