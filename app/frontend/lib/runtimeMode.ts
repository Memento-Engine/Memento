export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

export function isDesktopProductionMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (!isTauriRuntime()) {
    return false;
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  
  // Tauri 2.x production uses https://tauri.localhost/
  // Tauri 1.x production uses tauri:// protocol
  // Development uses http://localhost:1420 or similar
  if (hostname === "tauri.localhost") {
    return true;
  }
  
  return protocol !== "http:" && protocol !== "https:";
}
