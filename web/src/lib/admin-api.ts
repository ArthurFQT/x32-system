import { parseError } from "@/lib/api/http";
import { SERVER_URL } from "@/lib/env";
import type { OverviewResponse } from "@/types/app";

export async function fetchPublicHealth(): Promise<OverviewResponse | null> {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OverviewResponse & { ok?: boolean };
    return {
      now: data.now,
      bridgeConnected: data.bridgeConnected,
      connectedMusicians: data.connectedMusicians,
      tokens: data.tokens,
    };
  } catch {
    return null;
  }
}

export async function fetchWithAdminKey<T>(
  path: string,
  adminKey: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type") && init?.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (adminKey.trim()) {
    headers.set("x-admin-key", adminKey.trim());
  }

  const response = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}
