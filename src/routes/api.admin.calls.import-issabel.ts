import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { importIssabelCalls } from "@/lib/calls/import-issabel-calls.server";

/**
 * C-4 · واردسازی تماس‌های مرکز تلفن ایزابل به `call_logs`.
 *
 * گارد این مسیر سمت سرور است، دقیقاً مثل بقیهٔ مسیرهای `api.*` این پروژه:
 * توکن Bearer کاربر + بررسی نقش از `user_roles`. هیچ‌کدام از ۱۱ مسیر `api.*`
 * موجود `staticData.gate` ندارند — آن قرارداد برای مسیرهای UI (`_app.*`) است
 * و روی یک route فقط-سرور اثری ندارد. مجوز اینجا واقعاً اعمال می‌شود، نه اعلام.
 */

const MAX_BODY_BYTES = 2 * 1024;
const ALLOWED_ROLES = new Set(["admin", "manager"]);

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function extractBearer(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

async function authenticateUser(
  token: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return { ok: false, status: 500, message: "تنظیمات اتصال Supabase روی سرور کامل نیست." };
  }

  const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    return { ok: false, status: 401, message: "نشست کاربری معتبر نیست. دوباره وارد شوید." };
  }

  const user = (await res.json()) as { id?: unknown };
  if (typeof user.id !== "string" || user.id.length === 0) {
    return { ok: false, status: 401, message: "شناسه کاربر در نشست یافت نشد." };
  }

  return { ok: true, userId: user.id };
}

async function requireAdminOrManager(
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);

  if (error) {
    return { ok: false, status: 500, message: "بررسی نقش کاربر ناموفق بود." };
  }

  const allowed = (data ?? []).some((row) => ALLOWED_ROLES.has(String(row.role)));
  if (!allowed) {
    return { ok: false, status: 403, message: "دسترسی لازم برای این عملیات را ندارید." };
  }

  return { ok: true };
}

export const Route = createFileRoute("/api/admin/calls/import-issabel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = extractBearer(request.headers.get("authorization"));
        if (!token) {
          return jsonResponse(401, {
            ok: false,
            error: "unauthorized",
            message: "Authorization Bearer token الزامی است.",
          });
        }

        const auth = await authenticateUser(token);
        if (!auth.ok) {
          return jsonResponse(auth.status, { ok: false, error: "unauthorized", message: auth.message });
        }

        const roleCheck = await requireAdminOrManager(auth.userId);
        if (!roleCheck.ok) {
          return jsonResponse(roleCheck.status, {
            ok: false,
            error: "forbidden",
            message: roleCheck.message,
          });
        }

        let raw = "";
        try {
          raw = await request.text();
        } catch {
          return jsonResponse(400, {
            ok: false,
            error: "body_read_failed",
            message: "خواندن بدنه درخواست ممکن نشد.",
          });
        }

        if (raw.length > MAX_BODY_BYTES) {
          return jsonResponse(413, {
            ok: false,
            error: "body_too_large",
            message: "بدنه درخواست بیش از حد مجاز است.",
          });
        }

        let body: { maxCalls?: unknown } = {};
        try {
          body = raw.length > 0 ? (JSON.parse(raw) as { maxCalls?: unknown }) : {};
        } catch {
          return jsonResponse(400, {
            ok: false,
            error: "invalid_json",
            message: "بدنه JSON معتبر نیست.",
          });
        }

        // `maxCalls` فقط سقف را پایین می‌آورد؛ بازهٔ زمانی از تنظیمات می‌آید و
        // فراخواننده نمی‌تواند آن را عوض کند. نبودِ تاریخ در تنظیمات یعنی توقف.
        const maxCalls =
          typeof body.maxCalls === "number" && Number.isFinite(body.maxCalls)
            ? Math.floor(body.maxCalls)
            : undefined;

        try {
          const result = await importIssabelCalls({
            maxCalls,
            userAccessToken: token,
          });

          if (!result.ok) {
            const status = result.error === "since_setting_missing" ? 409 : 500;
            return jsonResponse(status, result);
          }

          return jsonResponse(200, result);
        } catch (error) {
          return jsonResponse(500, {
            ok: false,
            error: "import_failed",
            message: error instanceof Error ? error.message : "خطای ناشناخته در واردسازی تماس‌ها.",
          });
        }
      },
    },
  },
});
