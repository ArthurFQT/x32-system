function isLocalBackendUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function resolveServerUrl(): string {
  const configured = String(import.meta.env.VITE_SERVER_URL ?? "")
    .trim()
    .replace(/\/$/, "");

  if (configured && !isLocalBackendUrl(configured)) {
    return configured;
  }

  const browserHost = window.location.hostname;
  const isBrowserOnLocalhost = ["localhost", "127.0.0.1", "::1"].includes(browserHost);

  if (
    import.meta.env.DEV &&
    browserHost &&
    !isBrowserOnLocalhost &&
    (!configured || isLocalBackendUrl(configured))
  ) {
    return `${window.location.protocol}//${browserHost}:3000`;
  }

  return configured || "http://localhost:3000";
}

export const env = {
  VITE_SERVER_URL: resolveServerUrl(),
  VITE_ADMIN_KEY: String(import.meta.env.VITE_ADMIN_KEY ?? "").trim(),
} as const;

export const SERVER_URL = env.VITE_SERVER_URL;
export const ADMIN_KEY = env.VITE_ADMIN_KEY;
