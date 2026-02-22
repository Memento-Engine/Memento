use tokio::sync::mpsc::Sender;

use crate::server::types::{ CustomEvent, EventTypes };

#[derive(Clone)]
pub struct EventEmitter {
    tx: Sender<String>,
}

impl EventEmitter {
    pub fn new(tx: Sender<String>) -> Self {
        Self { tx }
    }

    pub async fn send<T>(&self, event_type: EventTypes, payload: T) where T: serde::Serialize {
        let r#type = match event_type {
            EventTypes::Token => "text",
            EventTypes::Thinking => "data-thinking",
            EventTypes::Citations => "data-citations",
            EventTypes::Done => "done",
        };

        let event = CustomEvent {
            event_type,
            r#type,
            payload,
        };

        let _ = self.tx.send(serde_json::to_string(&event).unwrap()).await;
    }
}
