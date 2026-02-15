#[derive(Debug)]
pub enum DaemonCommand {
    Status,
    Stop,
    Unknown,
}

impl DaemonCommand {

    pub fn parse(input: &str) -> Self {

        match input.trim() {
            "status" => Self::Status,
            "stop" => Self::Stop,
            _ => Self::Unknown,
        }
    }
}
