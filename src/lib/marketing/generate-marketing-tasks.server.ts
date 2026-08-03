import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Phase 10 / requirement 224 — daily generation of recurring marketing tasks.
 *
 * Extracted from the webhook route so the identical call can be made from:
 *  1. The public token-protected cron webhook (host crontab).
 *  2. The authenticated admin "run now" button.
 * This mirrors PRICE-RT.4 (process-recompute-queue.server.ts) rather than
 * inventing a second worker shape.
 *
 * All the real work — the Tehran date, the idempotency, the advisory lock and
 * the expiry of yesterday's unfinished tasks — lives in the SQL function
 * public.generate_marketing_tasks(). This file is deliberately a thin caller:
 * putting any of that logic here would mean a second, divergent copy of rules
 * the database already enforces for every other write path.
 *
 * Timezone note: p_for_date is left NULL on purpose. The database resolves
 * "today" through public.tehran_today(). Computing a date in Node would use
 * the container's clock (UTC) and would generate the wrong day's tasks every
 * evening between 20:30 and midnight Tehran time.
 */

export type GenerateMarketingTasksResult = {
  ok: true;
  for_date: string;
  locked: boolean;
  generated: number;
  skipped_existing: number;
  eligible: number;
  expired: number;
  message?: string;
};

export async function generateMarketingTasks(options?: {
  /** Only for backfills/tests. Omit for the daily run. */
  forDate?: string | null;
}): Promise<GenerateMarketingTasksResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "generate_marketing_tasks" as never,
    {
      p_for_date: options?.forDate ?? null,
    } as never,
  );

  if (error) {
    throw new Error(error.message || "generate_marketing_tasks failed");
  }

  const row = (data ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    for_date: String(row.for_date ?? ""),
    locked: Boolean(row.locked),
    generated: Number(row.generated ?? 0),
    skipped_existing: Number(row.skipped_existing ?? 0),
    eligible: Number(row.eligible ?? 0),
    expired: Number(row.expired ?? 0),
    ...(typeof row.message === "string" ? { message: row.message } : {}),
  };
}
