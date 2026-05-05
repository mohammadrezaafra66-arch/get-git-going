const STORAGE_KEY = "afrakala:auth-diagnostics";
const MAX_ENTRIES = 50;

export interface AuthDiagnosticEntry {
  ts: string;
  scope: string;
  message: string;
  detail?: unknown;
  stack?: string;
}

function safeDetail(detail: unknown): unknown {
  if (detail instanceof Error) {
    return { name: detail.name, message: detail.message };
  }
  if (detail && typeof detail === "object") {
    try {
      return JSON.parse(JSON.stringify(detail));
    } catch {
      return String(detail);
    }
  }
  return detail;
}

export function logAuthDiagnostic(scope: string, message: string, detail?: unknown) {
  const entry: AuthDiagnosticEntry = {
    ts: new Date().toISOString(),
    scope,
    message,
    detail: safeDetail(detail),
    stack: detail instanceof Error ? detail.stack : undefined,
  };
  // Always log to console for live debugging
  console.error(`[auth-diagnostic][${scope}] ${message}`, detail ?? "");
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const list: AuthDiagnosticEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    while (list.length > MAX_ENTRIES) list.shift();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("[auth-diagnostic] failed to persist entry", err);
  }
}

export function getAuthDiagnostics(): AuthDiagnosticEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthDiagnosticEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearAuthDiagnostics() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}