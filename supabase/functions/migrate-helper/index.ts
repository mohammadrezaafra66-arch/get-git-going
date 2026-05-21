const BUILD_ID = "2026-03-04";
const ACCESS_KEY = "ELPlSz3PLGPJ1mST";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-access-key, x-client-info, apikey, content-type",
};

const responseHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Build-Id": BUILD_ID,
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: responseHeaders,
  });

const errorResponse = (status: number, error: string) =>
  jsonResponse({ build_id: BUILD_ID, error }, status);

const requiredEnv = (name: string): string | null => {
  const value = Deno.env.get(name)?.trim();
  return value || null;
};

const readJsonBody = async (req: Request): Promise<Record<string, unknown> | null> => {
  const raw = await req.text();
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders });
  }

  const requestAccessKey = req.headers.get("x-access-key")?.trim();
  if (!requestAccessKey || requestAccessKey !== ACCESS_KEY) {
    return errorResponse(401, "Unauthorized");
  }

  const supabaseDbUrl = requiredEnv("SUPABASE_DB_URL");
  if (!supabaseDbUrl) {
    return errorResponse(500, "Set SUPABASE_DB_URL and redeploy.");
  }

  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return errorResponse(500, "Set SUPABASE_SERVICE_ROLE_KEY and redeploy.");
  }

  const body = await readJsonBody(req);

  if (body?.action === "ping") {
    return jsonResponse({
      ok: true,
      build_id: BUILD_ID,
      generated_at: new Date().toISOString(),
      checks: {
        supabase_db_url: true,
        service_role_key: true,
      },
    });
  }

  if (body?.action === "diag_db_url") {
    try {
      // node-postgres style URLs use postgres:// or postgresql://
      const u = new URL(supabaseDbUrl);
      const host = u.hostname;
      const port = u.port || (u.protocol.startsWith("postgres") ? "5432" : "");
      const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || null;
      const username = decodeURIComponent(u.username) || null;
      const password = u.password ? decodeURIComponent(u.password) : "";
      const sslmode = u.searchParams.get("sslmode");

      const isPrivateIp = (h: string) =>
        /^10\./.test(h) ||
        /^192\.168\./.test(h) ||
        /^127\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(h);
      const looks_internal =
        host === "localhost" ||
        host.endsWith(".internal") ||
        host.endsWith(".svc") ||
        host.endsWith(".local") ||
        isPrivateIp(host);
      const is_pooler =
        host.includes("pooler.supabase.com") || port === "6543";

      const masked_url =
        `${u.protocol}//${u.username}:***@${host}${port ? ":" + port : ""}` +
        (u.pathname || "") +
        (u.search || "");

      return jsonResponse({
        build_id: BUILD_ID,
        generated_at: new Date().toISOString(),
        protocol: u.protocol,
        host,
        port,
        database,
        username,
        sslmode,
        password_present: password.length > 0,
        password_length: password.length,
        is_pooler,
        looks_internal,
        masked_url,
      });
    } catch (e) {
      return errorResponse(500, `Failed to parse SUPABASE_DB_URL: ${(e as Error).message}`);
    }
  }

  return jsonResponse({
    build_id: BUILD_ID,
    generated_at: new Date().toISOString(),
    supabase_db_url: supabaseDbUrl,
    service_role_key: serviceRoleKey,
  });
});
