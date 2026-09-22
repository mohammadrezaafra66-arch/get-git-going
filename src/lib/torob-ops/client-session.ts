import { TOROB_OPS_SESSION_STORAGE_KEY } from "./types";

export function getTorobOpsSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(TOROB_OPS_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setTorobOpsSessionToken(token: string): void {
  sessionStorage.setItem(TOROB_OPS_SESSION_STORAGE_KEY, token);
}

export function clearTorobOpsSessionToken(): void {
  try {
    sessionStorage.removeItem(TOROB_OPS_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function withOpsSession<T extends Record<string, unknown>>(
  extra?: T,
): T & { opsSession?: string } {
  const opsSession = getTorobOpsSessionToken() ?? undefined;
  return { ...(extra as T), opsSession };
}
