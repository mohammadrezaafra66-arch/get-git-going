/**
 * Browser-safe POST for task-specific intake questions.
 * Short abort; caller falls back to localIntakeQuestionsForKind.
 */

import { supabase } from "@/integrations/supabase/client";
import type { IntakeQuestion } from "./intake";
import type { WorkItemKind } from "./types";

export const INTAKE_QUESTIONS_CLIENT_TIMEOUT_MS = 7_000;

export type PostIntakeQuestionsArgs = {
  description: string;
  title?: string;
  kind?: WorkItemKind;
  memoryHints?: string[];
};

export type PostIntakeQuestionsResult = {
  questions: IntakeQuestion[];
  source: "ai" | "local";
};

async function defaultFetchAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function postIntakeQuestions(
  args: PostIntakeQuestionsArgs,
  deps?: {
    fetchImpl?: typeof fetch;
    getToken?: () => Promise<string | null>;
    timeoutMs?: number;
  },
): Promise<PostIntakeQuestionsResult | null> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const getToken = deps?.getToken ?? defaultFetchAuthToken;
  const timeoutMs = deps?.timeoutMs ?? INTAKE_QUESTIONS_CLIENT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = await getToken();
    if (!token) return null;

    const res = await fetchImpl("/api/work/intake-questions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: args.description,
        title: args.title,
        kind: args.kind,
        memoryHints: args.memoryHints,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      questions?: IntakeQuestion[];
      source?: "ai" | "local";
    };
    if (!Array.isArray(json.questions) || json.questions.length < 2) return null;
    return {
      questions: json.questions,
      source: json.source === "ai" ? "ai" : "local",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
