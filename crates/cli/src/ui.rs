use indicatif::{ProgressBar, ProgressStyle};


pub fn create_spinner (msg : &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();

    pb.set_style(
        ProgressStyle::default_spinner()
        .template("{spinner} {msg}")
        .unwrap()
    );

    pb.set_message(msg.to_string());

    let interval = std::time::Duration::from_millis(120);
    pb.enable_steady_tick(interval);

    pb

}