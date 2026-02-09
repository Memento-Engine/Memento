use tokio::sync::mpsc::Receiver;

use crate::{ocr::loader::load_engine, pipeline::capture::CaptureMetaData};

pub async fn run(mut rx: Receiver<CaptureMetaData>) {

    let ocr_engine = load_engine();

    while let Some(frame) = rx.recv().await {

        let text = ocr_engine.process(frame.image()).await;

        println!("OCR Result: {}", text);
    }
}
