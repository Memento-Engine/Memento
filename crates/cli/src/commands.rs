use std::{ io::{ self, Write }, process::Command };

enum Mode {
    Interactive,
    Command,
}

fn interactive_mode(query: &str) {
    println!("🧠 Processing query: {}", query);
}

fn command_mode(cmd: &str) {
    match cmd {
        "status" => println!("System running."),
        "exit" => {
            println!("Goodbye!");
            std::process::exit(0);
        }
        _ => println!("Unknown command."),
    }
}

pub fn start_cli() {
    println!("🧠 Personal AI Ready");
    println!("Ask anything (type '/' to enter command mode)");

    let mut mode = Mode::Interactive;

    loop {
        // Show prompt based on mode
        match mode {
            Mode::Interactive => print!("> "),
            Mode::Command => print!("/ "),
        }

        io::stdout().flush().unwrap();

        let mut input = String::new();

        io::stdin().read_line(&mut input).expect("Failed to read input");

        let input = input.trim();

        if input.is_empty() {
            continue;
        }

        match mode {
            Mode::Interactive => {
                // Switch to command mode
                if input == "/" {
                    println!("Entered command mode.");
                    mode = Mode::Command;
                    continue;
                }

                // Otherwise treat as AI query
                interactive_mode(input);
            }

            Mode::Command => {
                // Switch back to interactive
                if input == "back" {
                    println!("Returning to interactive mode.");
                    mode = Mode::Interactive;
                    continue;
                }

                command_mode(input);
            }
        }
    }
}

pub fn is_daemon_running() -> bool {
    return false;
}

pub fn ensure_daemon_running() {
    if is_daemon_running() {
        println!("Daemon already running");
        return;
    }

    Command::new("ai_daemon").spawn().expect("Failed to start the daemon");
}
