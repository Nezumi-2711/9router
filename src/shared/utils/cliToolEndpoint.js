import { APP_CONFIG } from "@/shared/constants/config";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function trimTrailingSlashes(value) {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

export function ensureCliToolV1Endpoint(value) {
  const normalized = trimTrailingSlashes(value);
  if (!normalized) return "";
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

export function isLocalCliToolUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function resolveCliToolBaseUrl({
  appUrl = "",
  requiresExternalUrl = false,
  tunnelEnabled = false,
  tunnelPublicUrl = "",
  tailscaleEnabled = false,
  tailscaleUrl = "",
  cloudEnabled = false,
  cloudUrl = "",
  configuredBaseUrl = "",
} = {}) {
  const runtimeUrl = trimTrailingSlashes(appUrl);

  // When the dashboard itself is deployed, its browser origin is the most
  // accurate public gateway URL (including custom domains and reverse proxies).
  if (runtimeUrl && !isLocalCliToolUrl(runtimeUrl)) return runtimeUrl;

  // Tools such as Cursor cannot call a loopback URL from their remote service.
  if (requiresExternalUrl) {
    if (tunnelEnabled && tunnelPublicUrl) return trimTrailingSlashes(tunnelPublicUrl);
    if (tailscaleEnabled && tailscaleUrl) return trimTrailingSlashes(tailscaleUrl);
    if (cloudEnabled && cloudUrl) return trimTrailingSlashes(cloudUrl);
  }

  // A locally opened dashboard should generate a local endpoint, preserving a
  // custom development port from window.location.origin when present.
  if (runtimeUrl) return runtimeUrl;

  const configuredUrl = trimTrailingSlashes(configuredBaseUrl);
  if (configuredUrl) return configuredUrl;
  return `http://127.0.0.1:${APP_CONFIG.defaultPort}`;
}

export function resolveInitialCliToolBaseUrl(savedBaseUrl, runtimeBaseUrl) {
  const savedUrl = trimTrailingSlashes(savedBaseUrl);
  const defaultUrl = trimTrailingSlashes(runtimeBaseUrl);

  // Previous CLI Tools behavior could save the hardcoded loopback endpoint on
  // a deployed dashboard. Treat that specific mismatch as a stale default.
  if (savedUrl && defaultUrl && isLocalCliToolUrl(savedUrl) && !isLocalCliToolUrl(defaultUrl)) {
    return ensureCliToolV1Endpoint(defaultUrl);
  }

  return ensureCliToolV1Endpoint(savedUrl || defaultUrl);
}
