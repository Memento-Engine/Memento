use std::{env, fs, path::PathBuf};

fn ensure_sidecar_path_exists() {
    let target = env::var("TARGET").unwrap_or_else(|_| "x86_64-pc-windows-msvc".to_string());
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());

    let sidecar_name = if target.contains("windows") {
        format!("memento-agents-{}.exe", target)
    } else {
        format!("memento-agents-{}", target)
    };

    let sidecar_path = PathBuf::from(manifest_dir)
        .join("..")
        .join("agents")
        .join("dist")
        .join(sidecar_name);

    if sidecar_path.exists() {
        return;
    }

    if let Some(parent) = sidecar_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // Create a placeholder so local debug builds pass even before CI injects the real sidecar.
    let _ = fs::write(&sidecar_path, []);
}

fn main() {
    ensure_sidecar_path_exists();
    tauri_build::build()
}
