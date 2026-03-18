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
  return protocol !== "http:" && protocol !== "https:";
}
