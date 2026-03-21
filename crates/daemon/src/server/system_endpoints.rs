//! System requirements check endpoints for onboarding
//!
//! Checks:
//! - Windows version (10/11 required)
//! - Windows OCR language packs
//! - ONNX runtime compatibility

use axum::Json;
use serde::Serialize;
use tracing::{info, warn};

#[cfg(windows)]
use windows::Media::Ocr::OcrEngine as WinRTOcrEngine;

/// Individual requirement check result
#[derive(Serialize, Clone)]
pub struct RequirementCheck {
    pub name: String,
    pub passed: bool,
    pub message: String,
    /// Human-readable fix suggestion if failed
    pub fix_suggestion: Option<String>,
}

/// Overall system requirements check response
#[derive(Serialize)]
pub struct SystemRequirementsResponse {
    /// Whether all requirements are met
    pub all_passed: bool,
    /// Individual check results
    pub checks: Vec<RequirementCheck>,
    /// Summary message
    pub summary: String,
}

/// Check Windows version (10 or 11 required)
fn check_windows_version() -> RequirementCheck {
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::HKEY_LOCAL_MACHINE;

        let name = "Windows Version".to_string();

        // Read from registry for accurate version
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let current_version = hklm.open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion");

        match current_version {
            Ok(key) => {
                let product_name: Result<String, _> = key.get_value("ProductName");
                let build_number: Result<String, _> = key.get_value("CurrentBuildNumber");

                let product = product_name.unwrap_or_else(|_| "Unknown".to_string());
                let build = build_number.unwrap_or_else(|_| "0".to_string());
                let build_num: u32 = build.parse().unwrap_or(0);

                // Windows 10 starts at build 10240, Windows 11 at 22000
                if build_num >= 10240 {
                    let version = if build_num >= 22000 { "11" } else { "10" };
                    RequirementCheck {
                        name,
                        passed: true,
                        message: format!("Windows {} detected (Build {})", version, build_num),
                        fix_suggestion: None,
                    }
                } else {
                    RequirementCheck {
                        name,
                        passed: false,
                        message: format!("Windows build {} is not supported. Found: {}", build_num, product),
                        fix_suggestion: Some("Memento requires Windows 10 (Build 10240+) or Windows 11. Please upgrade your operating system.".to_string()),
                    }
                }
            }
            Err(e) => RequirementCheck {
                name,
                passed: false,
                message: format!("Could not determine Windows version: {}", e),
                fix_suggestion: Some("Unable to check Windows version. Memento requires Windows 10 or 11.".to_string()),
            },
        }
    }

    #[cfg(not(windows))]
    {
        RequirementCheck {
            name: "Operating System".to_string(),
            passed: false,
            message: "Memento currently only supports Windows.".to_string(),
            fix_suggestion: Some("Please run Memento on Windows 10 or Windows 11.".to_string()),
        }
    }
}

/// Check if Windows OCR language packs are available
fn check_windows_ocr() -> RequirementCheck {
    let name = "Windows OCR".to_string();

    #[cfg(windows)]
    {
        // Try user profile languages first
        if WinRTOcrEngine::TryCreateFromUserProfileLanguages().is_ok() {
            return RequirementCheck {
                name,
                passed: true,
                message: "Windows OCR is available with user language settings.".to_string(),
                fix_suggestion: None,
            };
        }

        // Try to get any available OCR language
        match WinRTOcrEngine::AvailableRecognizerLanguages() {
            Ok(languages) => {
                match languages.Size() {
                    Ok(count) if count > 0 => {
                        // Get language names for the message
                        let mut lang_names = Vec::new();
                        for i in 0..count.min(3) {
                            if let Ok(lang) = languages.GetAt(i) {
                                if let Ok(tag) = lang.LanguageTag() {
                                    lang_names.push(tag.to_string());
                                }
                            }
                        }
                        let extra = if count > 3 {
                            format!(" (+{} more)", count - 3)
                        } else {
                            String::new()
                        };

                        RequirementCheck {
                            name,
                            passed: true,
                            message: format!(
                                "Windows OCR available with {} language(s): {}{}",
                                count,
                                lang_names.join(", "),
                                extra
                            ),
                            fix_suggestion: None,
                        }
                    }
                    _ => RequirementCheck {
                        name,
                        passed: false,
                        message: "No OCR language packs found on this system.".to_string(),
                        fix_suggestion: Some(
                            "Install a language pack with OCR support:\n\
                             1. Open Settings → Time & Language → Language\n\
                             2. Add English (or your preferred language)\n\
                             3. Click the language → Options → Download 'Basic typing' or 'Handwriting'"
                                .to_string(),
                        ),
                    },
                }
            }
            Err(e) => RequirementCheck {
                name,
                passed: false,
                message: format!("Could not query OCR languages: {:?}", e),
                fix_suggestion: Some(
                    "Windows OCR service is not available. Try:\n\
                     1. Restart your computer\n\
                     2. Check Windows Update for pending updates"
                        .to_string(),
                ),
            },
        }
    }

    #[cfg(not(windows))]
    {
        RequirementCheck {
            name,
            passed: false,
            message: "Windows OCR is only available on Windows.".to_string(),
            fix_suggestion: Some("Please run Memento on Windows 10 or Windows 11.".to_string()),
        }
    }
}

/// Check ONNX Runtime compatibility
/// ONNX runtime is statically linked via fastembed, so we just check basic requirements
fn check_onnx_runtime() -> RequirementCheck {
    let name = "AI Runtime (ONNX)".to_string();

    // ONNX runtime requires:
    // - x86_64 architecture (checked at compile time, but verify we're on 64-bit)
    // - SSE2 support (all x64 CPUs have this)
    // - Windows 10+ (already checked)

    #[cfg(target_arch = "x86_64")]
    {
        // On x86_64, ONNX runtime should work. 
        // The actual test happens when loading models, but we can do a basic sanity check.
        
        // Check if we're running on 64-bit Windows
        #[cfg(windows)]
        {
            use std::env;
            let processor = env::var("PROCESSOR_ARCHITECTURE").unwrap_or_default();
            
            if processor == "AMD64" || processor == "IA64" {
                RequirementCheck {
                    name,
                    passed: true,
                    message: "64-bit processor detected. ONNX Runtime is compatible.".to_string(),
                    fix_suggestion: None,
                }
            } else {
                RequirementCheck {
                    name,
                    passed: false,
                    message: format!("Unsupported processor architecture: {}", processor),
                    fix_suggestion: Some("Memento requires a 64-bit (x64) processor.".to_string()),
                }
            }
        }
        
        #[cfg(not(windows))]
        {
            RequirementCheck {
                name,
                passed: true,
                message: "64-bit architecture detected.".to_string(),
                fix_suggestion: None,
            }
        }
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        RequirementCheck {
            name,
            passed: false,
            message: "Memento requires a 64-bit (x64) processor.".to_string(),
            fix_suggestion: Some("This application only runs on 64-bit systems.".to_string()),
        }
    }
}

/// Check all system requirements
pub async fn check_system_requirements() -> Json<SystemRequirementsResponse> {
    info!("Checking system requirements...");

    let checks = vec![
        check_windows_version(),
        check_windows_ocr(),
        check_onnx_runtime(),
    ];

    let all_passed = checks.iter().all(|c| c.passed);
    let failed_count = checks.iter().filter(|c| !c.passed).count();

    let summary = if all_passed {
        "All system requirements are met. Memento is ready to run!".to_string()
    } else {
        format!(
            "{} requirement(s) not met. Please review the details below.",
            failed_count
        )
    };

    if all_passed {
        info!("All system requirements passed");
    } else {
        warn!("System requirements check failed: {}", summary);
        for check in &checks {
            if !check.passed {
                warn!("  - {}: {}", check.name, check.message);
            }
        }
    }

    Json(SystemRequirementsResponse {
        all_passed,
        checks,
        summary,
    })
}
