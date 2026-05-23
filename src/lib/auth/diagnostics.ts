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

const SENSITIVE_KEY_PATTERN =
  /access[_-]?token|refresh[_-]?token|password|secret|api[_-]?key|jwt|bearer|authorization|session/i;
const MAX_STRING_LEN = 400;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated:depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}…[truncated]` : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = sanitizeValue(v, depth + 1);
  }
  return out;
}

/**
 * Returns a JSON string of diagnostics with sensitive keys redacted, stacks
 * stripped, and long strings truncated. Safe to put on the user's clipboard.
 */
export function sanitizeDiagnosticsForClipboard(entries: AuthDiagnosticEntry[]): string {
  const safe = entries.map((entry) => ({
    ts: entry.ts,
    scope: entry.scope,
    message:
      typeof entry.message === "string" && entry.message.length > MAX_STRING_LEN
        ? `${entry.message.slice(0, MAX_STRING_LEN)}…[truncated]`
        : entry.message,
    detail: sanitizeValue(entry.detail),
  }));
  return JSON.stringify(safe, null, 2);
}