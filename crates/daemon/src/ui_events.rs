use rdev::{ listen, Event, EventType };
use tracing::{ info, error };

pub fn start_listener(tx: std::sync::mpsc::Sender<()>) {
    let callback = move |event: Event| {
        match event.event_type {
            EventType::MouseMove { .. } | EventType::Wheel { .. } | EventType::KeyPress(_) => {
                // send capture signal
                tx.send(()).ok();
            }

            _ => {}
        }
    };

    if let Err(error) = listen(callback) {
        error!("Listener error: {:?}", error);
    }
}
