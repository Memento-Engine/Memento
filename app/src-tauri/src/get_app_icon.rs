use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppIcon {
    pub data: Vec<u8>,
    pub path: Option<String>,
}

#[cfg(target_os = "windows")]
use lazy_static::lazy_static;
#[cfg(target_os = "windows")]
use std::sync::Arc;
#[cfg(target_os = "windows")]
use tokio::sync::Semaphore;

#[cfg(target_os = "windows")]
lazy_static! {
    static ref SEMAPHORE: Arc<Semaphore> = Arc::new(Semaphore::new(5));
}

#[cfg(target_os = "windows")]
pub async fn get_app_icon(
    app_name: &str,
    app_path: Option<String>,
) -> Result<Option<AppIcon>, String> {
    use image::codecs::png::PngEncoder;
    use image::{ExtendedColorType, ImageEncoder};
    use std::io::Cursor;
    use windows_icons::get_icon_by_path;

    async fn find_exe_path(app_name: &str) -> Option<String> {
        if let Some(path) = get_exe_by_reg_key(app_name) {
            return Some(path);
        }
        if let Some(path) = get_exe_by_appx(app_name).await {
            return Some(path);
        }
        if let Some(path) = get_exe_from_potential_path(app_name).await {
            return Some(path);
        }
        None
    }

    let path = match app_path {
        Some(p) => p,
        None => find_exe_path(app_name)
            .await
            .ok_or_else(|| "app_path is None and could not find executable path".to_string())?,
    };

    let image_buffer = async { get_icon_by_path(&path) }
        .await
        .map_err(|e| e.to_string())?;

    let mut data = Vec::new();
    {
        let mut cursor = Cursor::new(&mut data);
        let encoder = PngEncoder::new(&mut cursor);
        encoder
            .write_image(
                &image_buffer,
                image_buffer.width(),
                image_buffer.height(),
                ExtendedColorType::Rgba8,
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(Some(AppIcon {
        data,
        path: Some(path),
    }))
}

#[cfg(target_os = "windows")]
fn get_exe_by_reg_key(app_name: &str) -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let reg_paths = [
        "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
        "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths",
    ];

    for path in &reg_paths {
        let keys = [hklm.open_subkey(path), hkcu.open_subkey(path)];
        for key in keys.iter().filter_map(|k| k.as_ref().ok()) {
            for subkey in key.enum_keys().filter_map(Result::ok) {
                if let Ok(app_key) = key.open_subkey(&subkey) {
                    if let Ok(display_name) = app_key.get_value::<String, _>("DisplayName") {
                        if display_name
                            .to_lowercase()
                            .contains(&app_name.to_lowercase())
                        {
                            if let Ok(path) = app_key.get_value::<String, _>("DisplayIcon") {
                                let cleaned_path = path
                                    .split(',')
                                    .next()
                                    .unwrap_or(&path)
                                    .to_string()
                                    .trim_matches('"')
                                    .to_string();
                                return Some(cleaned_path);
                            } else if let Ok(path) = app_key.get_value::<String, _>("(default)") {
                                let cleaned_path = path
                                    .split(',')
                                    .next()
                                    .unwrap_or(&path)
                                    .to_string()
                                    .trim_matches('"')
                                    .to_string();
                                return Some(cleaned_path);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
async fn get_exe_from_potential_path(app_name: &str) -> Option<String> {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let app_name = app_name.strip_suffix(".exe").unwrap_or(&app_name);
    let potential_paths = [
        (
            r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs",
            true,
        ),
        (r"C:\Windows\", false),
    ];
    for (path, recursive) in &potential_paths {
        let command = if *recursive {
            format!(
                r#"
                    Get-ChildItem -Path "{}" -Filter "*{}*.exe" -Recurse | ForEach-Object {{ $_.FullName }}
                    "#,
                path, app_name
            )
        } else {
            format!(
                r#"
                    Get-ChildItem -Path "{}" -Filter "*{}*.exe" | ForEach-Object {{ $_.FullName }}
                    "#,
                path, app_name
            )
        };

        let _permit = SEMAPHORE.acquire().await.unwrap();

        let output = tokio::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-WindowStyle")
            .arg("hidden")
            .arg("-Command")
            .arg(command)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await
            .ok()?;

        if output.status.success() {
            let stdout = std::str::from_utf8(&output.stdout).ok()?;
            if !stdout.is_empty() {
                return stdout.lines().next().map(str::to_string);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
async fn get_exe_by_appx(app_name: &str) -> Option<String> {
    use std::str;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let app_name = app_name.strip_suffix(".exe").unwrap_or(&app_name);
    let app_name_withoutspace = app_name.replace(" ", "");

    let _permit = SEMAPHORE.acquire().await.unwrap();

    let output = tokio::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-WindowStyle")
        .arg("hidden")
        .arg("-Command")
        .arg(format!(
            r#"Get-AppxPackage | Where-Object {{ $_.Name -like "*{}*" }}"#,
            app_name_withoutspace
        ))
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .await
        .expect("failed to execute powershell command");

    if !output.status.success() {
        return None;
    }

    let stdout = str::from_utf8(&output.stdout).ok()?;
    let package_name = stdout
        .lines()
        .find(|line| line.contains("PackageFullName"))
        .and_then(|line| line.split(':').nth(1))
        .map(str::trim)?;

    let exe_output = tokio::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-WindowStyle")
        .arg("hidden")
        .arg("-Command")
        .arg(format!(
            r#"
                        Get-ChildItem -Path "C:\Program Files\WindowsApps\{}\*" -Filter "*{}*.exe" -Recurse | ForEach-Object {{ $_.FullName }}
                    "#,
            package_name,
            app_name_withoutspace
        ))
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .await
        .ok()?;

    if exe_output.status.success() {
        let exe_stdout = str::from_utf8(&exe_output.stdout).ok()?;
        if !exe_stdout.is_empty() {
            return exe_stdout.lines().next().map(str::to_string);
        }
    }
    // second attempt with space if the first attempt couldn't find exe
    let exe_output = tokio::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-WindowStyle")
        .arg("hidden")
        .arg("-Command")
        .arg(format!(
            r#"
                        Get-ChildItem -Path "C:\Program Files\WindowsApps\{}\*" -Filter "*{}*.exe" -Recurse | ForEach-Object {{ $_.FullName }}
                    "#,
            package_name,
            app_name
        ))
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .await
        .ok()?;

    if exe_output.status.success() {
        let exe_stdout = str::from_utf8(&exe_output.stdout).ok()?;
        if !exe_stdout.is_empty() {
            return exe_stdout.lines().next().map(str::to_string);
        }
    }
    None
}

#[derive(Debug, Deserialize)]
pub struct AppIconQuery {
    pub name: String,
    pub path: Option<String>,
}

#[tauri::command]
pub async fn get_app_icon_ipc(app: AppIconQuery) -> Result<Option<AppIcon>, String> {
    #[cfg(target_os = "windows")]
    {
        get_app_icon(&app.name, app.path).await
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("get_app_icon_ipc is supported only on Windows".to_string())
    }
}
