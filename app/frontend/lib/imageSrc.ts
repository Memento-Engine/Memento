import { convertFileSrc } from "@tauri-apps/api/core";

function isLikelyAbsoluteWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function isAlreadyUrl(value: string): boolean {
  return /^(https?:|data:|blob:|asset:|file:)/i.test(value);
}

function normalizeWindowsPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function decodeIfEncodedPath(value: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

function toFileUrl(value: string): string {
  const normalized = normalizeWindowsPath(value);
  return `file:///${encodeURI(normalized)}`;
}

export function resolveImageSrc(imagePath?: string | null): string {
  if (typeof window === "undefined") {
    return "";
  }

  const rawPath = decodeIfEncodedPath((imagePath ?? "").trim());
  const path = normalizeWindowsPath(rawPath);
  if (!path) return "";

  if (isAlreadyUrl(path) || path.startsWith("/")) {
    return path;
  }

  if (isTauriRuntime()) {
    try {
      return convertFileSrc(path, "asset");
    } catch {
      return isLikelyAbsoluteWindowsPath(path) ? toFileUrl(path) : path;
    }
  }

  return isLikelyAbsoluteWindowsPath(path) ? toFileUrl(path) : path;
}
