//! OAuth 2.0 with PKCE implementation for desktop apps
//! 
//! This module handles:
//! - PKCE code verifier/challenge generation
//! - Local HTTP callback server
//! - Browser-based OAuth flow

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::Duration;
use tracing::{info, error, debug};
use tauri_plugin_opener::OpenerExt;

const OAUTH_TIMEOUT_SECS: u64 = 300; // 5 minutes

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthConfig {
    pub client_id: String,
    pub redirect_port: u16,
    pub auth_url: String,
    pub code_verifier: String,
    pub code_challenge: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthResult {
    pub code: String,
    pub code_verifier: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthError {
    pub error: String,
    pub error_description: Option<String>,
}

/// Generate a cryptographically random PKCE code verifier (43-128 characters)
fn generate_code_verifier() -> String {
    let random_bytes: [u8; 32] = rand::random();
    URL_SAFE_NO_PAD.encode(random_bytes)
}

/// Generate SHA256 code challenge from verifier
fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(hash)
}

/// Generate a random state parameter for CSRF protection
fn generate_state() -> String {
    let random_bytes: [u8; 16] = rand::random();
    URL_SAFE_NO_PAD.encode(random_bytes)
}

/// Find an available port for the callback server
fn find_available_port() -> Result<u16, String> {
    // Try binding to port 0 to get a random available port
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to find available port: {}", e))?;
    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();
    drop(listener);
    Ok(port)
}

/// Parse query string into HashMap
fn parse_query_string(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            match (parts.next(), parts.next()) {
                (Some(key), Some(value)) => {
                    let key = urlencoding::decode(key).ok()?.into_owned();
                    let value = urlencoding::decode(value).ok()?.into_owned();
                    Some((key, value))
                }
                _ => None,
            }
        })
        .collect()
}

/// Handle incoming HTTP request on callback server
fn handle_callback_request(mut stream: TcpStream) -> Option<Result<String, OAuthError>> {
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    
    if reader.read_line(&mut request_line).is_err() {
        return None;
    }

    debug!("OAuth callback received: {}", request_line.trim());

    // Parse the request line: GET /callback?code=xxx&state=yyy HTTP/1.1
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 || parts[0] != "GET" {
        return None;
    }

    let path = parts[1];
    
    // Parse query parameters
    let query_start = path.find('?')?;
    let query = &path[query_start + 1..];
    let params = parse_query_string(query);

    // Read remaining headers (we don't need them, but need to consume them)
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }
    }

    // Check for error response
    if let Some(error) = params.get("error") {
        let error_description = params.get("error_description").cloned();
        
        // Send error response with auto-close
        let response = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: text/html\r\n\
             Connection: close\r\n\
             \r\n\
             <!DOCTYPE html><html><head><title>Authentication Failed</title></head>\
             <body style=\"font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;\">\
             <div style=\"text-align: center;\">\
             <h1 style=\"color: #ef4444;\">Authentication Failed</h1>\
             <p>{}</p>\
             <p style=\"color: #888;\">You can close this window.</p>\
             <script>setTimeout(() => window.close(), 2000);</script>\
             </div></body></html>",
            error_description.as_deref().unwrap_or("Unknown error")
        );
        let _ = stream.write_all(response.as_bytes());
        
        return Some(Err(OAuthError {
            error: error.clone(),
            error_description,
        }));
    }

    // Get authorization code
    let code = params.get("code")?;

    // Send success response with auto-close
    let response = "HTTP/1.1 200 OK\r\n\
                   Content-Type: text/html\r\n\
                   Connection: close\r\n\
                   \r\n\
                   <!DOCTYPE html><html><head><title>Authentication Successful</title></head>\
                   <body style=\"font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;\">\
                   <div style=\"text-align: center;\">\
                   <h1 style=\"color: #22c55e;\">&#10003; Authentication Successful</h1>\
                   <p>You can close this window and return to Memento.</p>\
                   <script>setTimeout(() => window.close(), 1500);</script>\
                   </div></body></html>";
    let _ = stream.write_all(response.as_bytes());

    Some(Ok(code.clone()))
}

/// Start the OAuth flow
/// 
/// This function:
/// 1. Generates PKCE credentials
/// 2. Starts a local callback server
/// 3. Opens the browser to Google OAuth
/// 4. Waits for the callback with the authorization code
/// 5. Returns the code and verifier for token exchange
#[tauri::command]
pub async fn start_oauth_flow(
    app_handle: tauri::AppHandle,
    client_id: String,
) -> Result<OAuthResult, String> {
    info!("Starting OAuth flow");

    // Generate PKCE credentials
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state = generate_state();

    debug!("PKCE credentials generated");

    // Find available port and start callback server
    let port = find_available_port()?;
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    info!("Starting OAuth callback server on port {}", port);

    // Start listening before opening browser
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("Failed to start callback server: {}", e))?;
    
    // Set timeout for accepting connections
    listener.set_nonblocking(true)
        .map_err(|e| format!("Failed to set non-blocking: {}", e))?;

    // Build Google OAuth URL
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
         client_id={}&\
         redirect_uri={}&\
         response_type=code&\
         scope=openid%20email%20profile&\
         code_challenge={}&\
         code_challenge_method=S256&\
         state={}&\
         access_type=offline&\
         prompt=consent",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&code_challenge),
        urlencoding::encode(&state),
    );

    info!("Opening browser for authentication");

    // Open browser
    app_handle.opener().open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for callback
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(OAUTH_TIMEOUT_SECS);

    loop {
        if start.elapsed() > timeout {
            error!("OAuth flow timed out");
            return Err("Authentication timed out. Please try again.".to_string());
        }

        match listener.accept() {
            Ok((stream, _addr)) => {
                match handle_callback_request(stream) {
                    Some(Ok(code)) => {
                        info!("OAuth code received successfully");
                        return Ok(OAuthResult {
                            code,
                            code_verifier,
                            redirect_uri,
                        });
                    }
                    Some(Err(oauth_err)) => {
                        error!("OAuth error: {:?}", oauth_err);
                        return Err(oauth_err.error_description.unwrap_or(oauth_err.error));
                    }
                    None => {
                        // Invalid request, continue waiting
                        debug!("Received invalid request, continuing to wait");
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // No connection yet, sleep briefly and retry
                thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                error!("Failed to accept connection: {}", e);
                return Err(format!("Callback server error: {}", e));
            }
        }
    }
}

/// Cancel any ongoing OAuth flow (cleanup)
#[tauri::command]
pub fn cancel_oauth_flow() {
    info!("OAuth flow cancelled by user");
    // The flow will naturally timeout or complete
    // In a more advanced implementation, we could use a shared cancellation token
}
