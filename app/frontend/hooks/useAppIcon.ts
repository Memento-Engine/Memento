import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

// 1x1 transparent PNG – returned when an icon cannot be found
export const PLACEHOLDER_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

interface AppIconResult {
  data: number[];
  path: string | null;
}

function extractPathLikeInput(value: string): string | null {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (!trimmed) return null;

  const withoutIconIndex = trimmed.split(",")[0]?.trim() ?? "";
  if (!withoutIconIndex) return null;

  const looksLikePath =
    withoutIconIndex.includes("\\") ||
    withoutIconIndex.includes("/") ||
    /^[a-zA-Z]:/.test(withoutIconIndex);

  return looksLikePath ? withoutIconIndex : null;
}

function extractExeNameFromPath(pathValue: string): string | null {
  const fileName = pathValue.split(/[\\/]/).pop()?.trim();
  if (!fileName) return null;

  const nameWithoutExt = fileName.replace(/\.(exe|lnk|dll)$/i, "").trim();
  return nameWithoutExt || null;
}

function getNormalizedAppInfo(appName: string): { displayName: string; appPath: string | null } {
  const pathLike = extractPathLikeInput(appName);
  if (!pathLike) {
    return { displayName: appName.trim(), appPath: null };
  }

  const displayName = extractExeNameFromPath(pathLike) ?? appName.trim();
  return { displayName, appPath: pathLike };
}

export function normalizeAppName(appName?: string): string {
  if (!appName) return "";
  return getNormalizedAppInfo(appName).displayName;
}

function getIconCacheKey(appName: string, browserUrl?: string): string {
  const normalized = normalizeAppName(appName);
  const appKey = normalized.toLowerCase().trim();
  if (!browserUrl) return appKey;

  try {
    const hostname = new URL(browserUrl).hostname.toLowerCase().trim();
    if (hostname) return `${appKey}::${hostname}`;
  } catch {
    // Ignore invalid URL and fall back to app-only key
  }

  return appKey;
}

// ─── module-level singletons ────────────────────────────────────────────────
// Resolved icons (appName.toLowerCase() → data URL)
const iconCache = new Map<string, string>();
// In-flight deduplication (appName.toLowerCase() → Promise<string>)
const inflight = new Map<string, Promise<string>>();
// ─────────────────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: number[]): string {
  // Process in chunks to avoid call-stack overflow on large icons
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.slice(i, i + CHUNK));
  }
  return btoa(binary);
}

async function checkImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
    });

    return res.ok || res.type === "opaque";
  } catch {
    return false;
  }
}

export async function fetchFavicon(domain: string): Promise<string> {
  console.log("Fetching favicon for domain:", domain);
  const candidates = [
    `https://${domain}/favicon.ico`,
    `https://${domain}/favicon.png`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    `https://logo.clearbit.com/${domain}`,
  ];

  for (const url of candidates) {
    try {
      const ok = await checkImage(url);
      if (ok) return url;
    } catch {
      continue;
    }
  }

  return "https://www.google.com/s2/favicons?domain=chrome&sz=64";
}

async function fetchIconOnce(
  appName: string,
  browserUrl?: string,
): Promise<string> {
  const normalizedInfo = getNormalizedAppInfo(appName);
  const key = getIconCacheKey(appName, browserUrl);

  const cached = iconCache.get(key);
  if (cached !== undefined) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<string> => {
    try {
      if (browserUrl) {
        // Extract domain and fetch favicon
        const url = new URL(browserUrl);
        return await fetchFavicon(url.hostname);
      }

      const result = await invoke<AppIconResult | null>("get_app_icon_ipc", {
        app: {
          name: normalizedInfo.displayName,
          path: normalizedInfo.appPath,
        },
      });

      if (result && result.data.length > 0) {
        const url = `data:image/png;base64,${uint8ToBase64(result.data)}`;
        iconCache.set(key, url);
        return url;
      }
    } catch {
      // IPC error or running outside Tauri – fall through to placeholder
    }

    iconCache.set(key, PLACEHOLDER_ICON);
    return PLACEHOLDER_ICON;
  })();

  inflight.set(key, promise);
  promise.finally(() => inflight.delete(key));

  return promise;
}

// ─── public hook ─────────────────────────────────────────────────────────────
export function useAppIcon(
  appName: string | undefined,
  browserUrl?: string,
): {
  src: string;
  loading: boolean;
} {
  const key = appName ? getIconCacheKey(appName, browserUrl) : "";

  // Initialise synchronously from cache to avoid single-frame flicker
  const [src, setSrc] = useState<string>(() => {
    if (!key) return PLACEHOLDER_ICON;
    return iconCache.get(key) ?? "";
  });

  useEffect(() => {
    if (!appName) {
      setSrc(PLACEHOLDER_ICON);
      return;
    }

    const cached = iconCache.get(getIconCacheKey(appName, browserUrl));
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }

    let cancelled = false;
    fetchIconOnce(appName, browserUrl).then((url) => {
      if (!cancelled) setSrc(url);
    });

    return () => {
      cancelled = true;
    };
  }, [appName, browserUrl]);

  return { src, loading: src === "" };
}
