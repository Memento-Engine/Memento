mod setup;
mod ui;
mod commands;

use app_core::config::{self, get_setup_state};

fn main() {
    let state = get_setup_state();
    match state {
        config::SetupState::NotInstalled => {
            println!("First time setup detected...");
            setup::run_setup();
            commands::ensure_daemon_running();
            commands::start_cli();
        }

        config::SetupState::Partial => {
            println!("Set up not completed. Repairing...");
        }

        config::SetupState::Ready => {
            println!("Everything Ready");
            commands::ensure_daemon_running();
            commands::start_cli();
        }
    }
}