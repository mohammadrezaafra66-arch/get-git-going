/**
 * Browser-safe intake-summary POST for CreateWorkWizard.
 * Must never block the UI waiting on AI — abort + caller uses local summarizeIntake.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildIntakeTranscript, type IntakeAnswer } from "./intake";

/** Soft ceiling: wizard must proceed even if OpenAI is slow/unavailable. */
export const INTAKE_SUMMARY_CLIENT_TIMEOUT_MS = 4_000;

export type PostIntakeSummaryArgs = {
  answers: IntakeAnswer[];
  description?: string;
  title?: string;
};

export type PostIntakeSummaryResult = {
  summary: string;
  transcript: string;
};

export type PostIntakeSummaryDeps = {
  fetchImpl?: typeof fetch;
  getToken?: () => Promise<string | null>;
  /** Override abort window; defaults to INTAKE_SUMMARY_CLIENT_TIMEOUT_MS. */
  timeoutMs?: number;
};

async function defaultFetchAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * POST /api/work/intake-summary with a short AbortController timeout.
 * Returns null on missing auth, HTTP error, abort, or network failure —
 * caller must apply local summarizeIntake / buildIntakeTranscript.
 */
export async function postIntakeSummary(
  args: PostIntakeSummaryArgs,
  deps?: PostIntakeSummaryDeps,
): Promise<PostIntakeSummaryResult | null> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const getToken = deps?.getToken ?? defaultFetchAuthToken;
  const timeoutMs = deps?.timeoutMs ?? INTAKE_SUMMARY_CLIENT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = await getToken();
    if (!token) return null;

    const res = await fetchImpl("/api/work/intake-summary", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answers: args.answers,
        description: args.description,
        title: args.title,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      summary?: string;
      transcript?: string;
    };
    if (!json.summary?.trim()) return null;
    return {
      summary: json.summary.trim(),
      transcript: json.transcript?.trim() || buildIntakeTranscript(args.answers),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
