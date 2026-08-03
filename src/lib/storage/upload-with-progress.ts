import { supabase } from "@/integrations/supabase/client";

/**
 * Storage upload with real progress and bounded retry — Phase 8.4 (D8-7),
 * gaps 3 and 4 of P0 item 4.
 *
 * ─── WHY NOT JUST USE supabase.storage.upload() ────────────────────────────
 * supabase-js uploads with `fetch`, and `fetch` exposes no upload-progress
 * events. A purchasing officer on a weak connection therefore watches a spinner
 * with no idea whether a 3 MB photo is moving or stalled. `XMLHttpRequest` is
 * the only browser API that reports upload progress, so this helper talks to
 * the same Storage REST endpoint directly.
 *
 * Everything else is kept identical to what supabase-js does, so RLS, bucket
 * limits (migration 267's size/MIME rules) and audit behaviour are unchanged:
 *   POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path}
 *   Authorization: Bearer <session access token, or the anon key when signed out>
 *   apikey: <publishable key>
 *   x-upsert: "true" | "false"
 *
 * ─── RETRY ─────────────────────────────────────────────────────────────────
 * Only network-level failures and 5xx are retried, with exponential backoff.
 * A 4xx is NOT retried: 413 (too large), 415 (wrong MIME) and 409 (already
 * exists) are deterministic, and retrying them just makes the user wait three
 * times as long for the same error.
 */

export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0–100, integer. `total` is 0 on browsers that cannot compute it. */
  percent: number;
}

export interface UploadOptions {
  bucket: string;
  path: string;
  file: File | Blob;
  contentType?: string;
  upsert?: boolean;
  onProgress?: (progress: UploadProgress) => void;
  /** Total attempts, including the first. Default 3. */
  maxAttempts?: number;
  signal?: AbortSignal;
}

export interface UploadError extends Error {
  status?: number;
  retryable: boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 800;

function makeError(message: string, status: number | undefined, retryable: boolean): UploadError {
  const error = new Error(message) as UploadError;
  error.status = status;
  error.retryable = retryable;
  return error;
}

/** 5xx and transport failures are worth another try; 4xx will fail identically. */
function isRetryableStatus(status: number): boolean {
  return status === 0 || status >= 500;
}

function resolveConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) {
    throw makeError("Supabase configuration is missing in the client bundle.", undefined, false);
  }
  return { url: url.replace(/\/+$/, ""), key };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(makeError("آپلود لغو شد.", undefined, false));
      },
      { once: true },
    );
  });
}

function putOnce(
  endpoint: string,
  headers: Record<string, string>,
  file: File | Blob,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);

    xhr.upload.addEventListener("progress", (event) => {
      if (!onProgress) return;
      const total = event.lengthComputable ? event.total : 0;
      const percent = total > 0 ? Math.round((event.loaded / total) * 100) : 0;
      onProgress({ loaded: event.loaded, total, percent });
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Report a clean 100% — the progress event can stop a few bytes short.
        onProgress?.({ loaded: 1, total: 1, percent: 100 });
        resolve();
        return;
      }
      let message = `آپلود ناموفق بود (کد ${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        if (body.message || body.error) message = body.message ?? body.error!;
      } catch {
        /* keep the generic Persian message */
      }
      reject(makeError(message, xhr.status, isRetryableStatus(xhr.status)));
    });

    xhr.addEventListener("error", () => reject(makeError("ارتباط با سرور برقرار نشد.", 0, true)));
    xhr.addEventListener("timeout", () => reject(makeError("زمان آپلود تمام شد.", 0, true)));
    xhr.addEventListener("abort", () => reject(makeError("آپلود لغو شد.", undefined, false)));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}

/**
 * Upload a file, reporting progress and retrying transient failures.
 * Resolves with the storage object path on success.
 */
export async function uploadWithProgress(options: UploadOptions): Promise<{ path: string }> {
  const {
    bucket,
    path,
    file,
    contentType,
    upsert = false,
    onProgress,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    signal,
  } = options;

  const { url, key } = resolveConfig();
  const endpoint = `${url}/storage/v1/object/${bucket}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token ?? key;

  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    apikey: key,
    "x-upsert": upsert ? "true" : "false",
    "cache-control": "3600",
  };
  // Send the real type so bucket MIME restrictions (migration 267) see the
  // same value supabase-js would have sent.
  const resolvedType = contentType ?? (file instanceof File ? file.type : "");
  if (resolvedType) headers["content-type"] = resolvedType;

  let lastError: UploadError | undefined;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    try {
      await putOnce(endpoint, headers, file, onProgress, signal);
      return { path };
    } catch (error) {
      lastError = error as UploadError;
      if (!lastError.retryable || attempt === maxAttempts) break;
      // Reset the bar so a retry does not look like it resumed mid-way.
      onProgress?.({ loaded: 0, total: 0, percent: 0 });
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1), signal);
    }
  }

  throw lastError ?? makeError("آپلود ناموفق بود.", undefined, false);
}
