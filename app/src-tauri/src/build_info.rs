//! Build-time constants for the application.
//!
//! This module provides compile-time configuration following production desktop app patterns:
//! - cfg!(debug_assertions): Set by Cargo based on build profile (debug vs release)
//! - env!("CARGO_PKG_VERSION"): Compile-time macro, baked into binary
//! - Hardcoded URLs: No runtime env vars needed for desktop apps
//!
//! This approach is used by major desktop apps (VS Code, Discord, Slack, Figma).

/// Application version from Cargo.toml, embedded at compile time
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Sentry release identifier (format: app@version)
pub const SENTRY_RELEASE: &str = concat!("memento@", env!("CARGO_PKG_VERSION"));

/// Sentry DSN for error reporting
pub const SENTRY_DSN: &str = "https://a291be24371ccc5399d82f2b67fe8ab3@o4511037138206720.ingest.us.sentry.io/4511064036081664";

/// Update server URL for Velopack
pub const UPDATE_URL: &str = "https://github.com/Memento-Engine/Memento/releases/latest/download";

/// Check if this is a production (release) build.
///
/// Uses Rust's standard `debug_assertions` cfg which is:
/// - `true` for `cargo build` (debug profile)
/// - `false` for `cargo build --release` (release profile)
///
/// This is the standard pattern for production desktop applications.
#[inline]
pub const fn is_production() -> bool {
    !cfg!(debug_assertions)
}

/// Check if this is a development (debug) build.
#[inline]
pub const fn is_development() -> bool {
    cfg!(debug_assertions)
}

/// Get the environment name as a string
pub const fn environment_name() -> &'static str {
    if is_production() {
        "production"
    } else {
        "development"
    }
}
