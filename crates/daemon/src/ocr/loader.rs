use super::engine::OcrEngine;

#[cfg(target_os = "windows")]
pub fn load_engine() -> Box<dyn OcrEngine> {
    Box::new(crate::ocr::windows::WindowsOcr::new())
}

#[cfg(target_os = "macos")]
pub fn load_engine() -> Box<dyn OcrEngine> {
    Box::new(crate::ocr::macos::MacOcr)
}

#[cfg(target_os = "linux")]
pub fn load_engine() -> Box<dyn OcrEngine> {
    Box::new(crate::ocr::linux::LinuxOcr)
}
