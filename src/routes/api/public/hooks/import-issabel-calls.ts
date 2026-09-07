import { createFileRoute } from "@tanstack/react-router";
import { importIssabelCalls } from "@/lib/calls/import-issabel-calls.server";

/**
 * C-6 · واردسازی زمان‌بندی‌شدهٔ CDR ایزابل (عمومی، محافظت‌شده با توکن).
 *
 * POST /api/public/hooks/import-issabel-calls
 * Auth: Authorization: Bearer ${ISSABEL_IMPORT_WORKER_TOKEN}
 *
 * **چرا cron هاست و نه pg_cron:** اندازه‌گیری‌شده روی همین پایگاه (۲۰۲۶-۰۹-۰۷)،
 * دیتابیس `afrakala` نه `pg_cron` دارد، نه `http`، نه `pg_net`:
 *
 *     afrakala: btree_gist, pg_graphql, pg_stat_statements, pg_trgm, pgcrypto,
 *               pgjwt, pgsodium, plpgsql, supabase_vault, uuid-ossp, vector
 *     postgres: pg_cron (+ بقیه)
 *
 * `pg_cron` فقط SQL اجرا می‌کند، نه shell. پس برای اینکه پایگاه بتواند این
 * route را صدا بزند **دو** افزونهٔ جدید لازم بود: `pg_cron` در `afrakala` (یا
 * `cron.schedule_in_database`) به‌علاوهٔ `http` یا `pg_net`. آن یعنی دادن
 * توانایی شبکهٔ خروجی به پایگاه‌داده، فقط برای رسیدن به مسیری که cron هاست
 * همین حالا بدون هیچ افزونه‌ای به آن می‌رسد.
 *
 * و این الگو در همین repo از قبل هست، پس ساختنش «مکانیزم موازی» می‌شد
 * (قاعدهٔ ۱۴ پروژه): `api/public/hooks/generate-marketing-tasks.ts` با
 * `deploy/app/scripts/marketing-tasks-cron.example.sh`، و همچنین
 * `pricing-worker-cron.example.sh`. این فایل دقیقاً همان شکل را دارد.
 *
 * پنجره‌های D-39 در `deploy/app/scripts/issabel-import-cron.example.sh` اند.
 *
 * چند بار صدا زدن بی‌خطر است: کلید یکتای `call_logs.external_id` روی
 * `linkedid` تکراری را رد می‌کند و importer پیش از درج هم فیلتر می‌کند، پس
 * اجرای هم‌پوشان نمی‌تواند ردیف تکراری بسازد.
 *
 * `ISSABEL_IMPORT_WORKER_TOKEN` فقط سمت سرور است، هرگز پیشوند VITE_ نمی‌گیرد
 * و هرگز commit نمی‌شود (قواعد ۴ و ۵).
 */
export const Route = createFileRoute("/api/public/hooks/import-issabel-calls")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.ISSABEL_IMPORT_WORKER_TOKEN;
        if (!expected) {
          return new Response(
            JSON.stringify({ ok: false, error: "ISSABEL_IMPORT_WORKER_TOKEN is not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        if (!token || token !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let maxCalls: number | undefined;
        try {
          const text = await request.text();
          if (text && text.trim().length > 0) {
            const body = JSON.parse(text) as { maxCalls?: unknown };
            if (typeof body.maxCalls === "number" && Number.isFinite(body.maxCalls)) {
              maxCalls = Math.floor(body.maxCalls);
            }
          }
        } catch {
          // بدنهٔ نامعتبر نادیده گرفته می‌شود؛ اجرای روزمره اصلاً بدنه نمی‌فرستد.
        }

        try {
          // workerMode: بازمحاسبه از تابع service_role-only مهاجرت ۵۱۳ می‌رود،
          // چون در اجرای بدون‌ناظر هیچ auth.uid() ای وجود ندارد.
          const result = await importIssabelCalls({ maxCalls, workerMode: true });
          const status = result.ok ? 200 : result.error === "since_setting_missing" ? 409 : 500;
          return new Response(JSON.stringify(result), {
            status,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "import_failed",
              message: error instanceof Error ? error.message : "unknown error",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
