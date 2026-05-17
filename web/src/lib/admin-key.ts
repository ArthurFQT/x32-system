import { ADMIN_KEY } from "@/lib/env";

const ADMIN_KEY_STORAGE = "x32_admin_key";

export function resolveInitialAdminKey(): string {
  if (ADMIN_KEY) {
    return ADMIN_KEY;
  }

  if (import.meta.env.PROD) {
    return "";
  }

  return window.localStorage.getItem(ADMIN_KEY_STORAGE)?.trim() ?? "";
}

export function persistAdminKey(value: string): void {
  if (ADMIN_KEY) {
    return;
  }

  window.localStorage.setItem(ADMIN_KEY_STORAGE, value);
}
