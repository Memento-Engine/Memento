use hmac::{ Hmac, Mac };
use serde::Deserialize;
use sha2::{ Digest, Sha256 };
use std::time::{ SystemTime, UNIX_EPOCH };
use wmi::{ COMLibrary, WMIConnection };

// Create an alias for the HMAC-SHA256 type
type HmacSha256 = Hmac<Sha256>;

// 1. Define structs to map the WMI data
#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
struct BaseBoard {
    serial_number: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
struct Processor {
    processor_id: Option<String>,
}

fn get_device_id() -> Result<String, String> {
    // Spawn a dedicated background thread to prevent COM Apartment collisions with Tauri's UI
    std::thread
        ::spawn(|| {
            // Now COMLibrary::new() will succeed because this thread is fresh
            let com_con = COMLibrary::new().map_err(|e| e.to_string())?;
            let wmi_con = WMIConnection::new(com_con.into()).map_err(|e| e.to_string())?;

            // Query Motherboard
            let board_results: Vec<BaseBoard> = wmi_con
                .raw_query("SELECT SerialNumber FROM Win32_BaseBoard")
                .map_err(|e| e.to_string())?;

            let board_serial = board_results
                .into_iter()
                .next()
                .and_then(|b| b.serial_number)
                .unwrap_or_else(|| "UNKNOWN_BOARD".to_string());

            // Query CPU ID
            let cpu_results: Vec<Processor> = wmi_con
                .raw_query("SELECT ProcessorId FROM Win32_Processor")
                .map_err(|e| e.to_string())?;

            let cpu_id = cpu_results
                .into_iter()
                .next()
                .and_then(|c| c.processor_id)
                .unwrap_or_else(|| "UNKNOWN_CPU".to_string());

            // Combine and Hash
            let raw_hardware = format!("{}-{}", board_serial, cpu_id);
            let mut hasher = Sha256::new();
            hasher.update(raw_hardware.as_bytes());

            Ok(hex::encode(hasher.finalize()))
        })
        .join()
        // Catch if the thread itself panics
        .unwrap_or_else(|_| Err("WMI thread panicked".to_string()))
}


#[tauri::command]
// 3. Generate the Payload to send to your Next.js Server
pub fn generate_auth_headers() -> (String, String, String) {
    println!("Generating auth headers...");
    // This should be deeply embedded in your Tauri app
    let secret_key = b"MY_SUPER_SECRET_TAURI_KEY";

    // Get the Device ID (Fallback to a random string if WMI fails, though it shouldn't on Windows)
    let device_id = match get_device_id() {
        Ok(id) => id,
        Err(e) => {
            eprintln!("Failed to get device ID: {}", e);
            "FALLBACK_DEVICE_ID".to_string()
        }
    };

    // Get current Unix timestamp
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs().to_string();

    // The exact message we are signing
    let message_to_sign = format!("{}:{}", device_id, timestamp);

    // Calculate the HMAC-SHA256
    let mut mac = HmacSha256::new_from_slice(secret_key).expect("HMAC can take key of any size");
    mac.update(message_to_sign.as_bytes());

    // Convert the signature bytes to a hex string
    let signature = hex::encode(mac.finalize().into_bytes());

    // Return the three pieces of data your server needs
    (device_id, timestamp, signature)
}
