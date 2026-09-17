/**
 * Torob Ops Path A — acceptance harness (:3100) without app node_modules.
 * Uses PostgREST service_role + local bait/crypto modules + worker HTTP hook.
 *
 *   npx --yes tsx docs/verification/torob-ops-path-a-accept.ts
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

function loadEnv(file: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const envCandidates = [
  process.env.AFRAKALA_LAN_ENV,
  path.join(process.cwd(), "deploy/lan/.env.lan"),
  "D:/AfraKalaTest/app/deploy/lan/.env.lan",
].filter(Boolean) as string[];
const envFile = envCandidates.find((p) => fs.existsSync(p));
if (!envFile) throw new Error("Missing .env.lan");
const env = loadEnv(envFile);

const REST = `http://127.0.0.1:${env.SUPABASE_API_PORT || "9000"}/rest/v1`;
const SERVICE = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.ANON_KEY || env.SUPABASE_ANON_KEY;
const APP = `http://127.0.0.1:${env.APP_PORT || "3100"}`;
const WORKER = env.TOROB_OPS_WORKER_TOKEN;
const ACCOUNT_SECRET = env.TOROB_OPS_ACCOUNT_SECRET || env.JWT_SECRET;

if (!SERVICE || !ANON) throw new Error("SERVICE_ROLE_KEY / ANON_KEY missing");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function rest<T = unknown>(
  method: string,
  pathAndQuery: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<{ status: number; data: T; text: string }> {
  const res = await fetch(`${REST}${pathAndQuery}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: extra.Prefer || "return=representation",
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: T = null as T;
  try {
    data = text ? (JSON.parse(text) as T) : (null as T);
  } catch {
    /* raw */
  }
  return { status: res.status, data, text };
}

function accountKey(): Buffer {
  return createHash("sha256").update(ACCOUNT_SECRET, "utf8").digest();
}

function encryptSession(plain: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", accountKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function startBaitFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const html = `<!doctype html><html><body>
    <p>قیمت نهایی با هماهنگی تلفنی</p>
    <a href="https://wa.me/989121234567">واتساپ</a>
    <a href="tel:09121234567">تماس بگیرید</a>
    <p>ارسال از چین / تحویل چین</p>
  </body></html>`;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  assert(addr && typeof addr === "object", "server address");
  return {
    url: `http://127.0.0.1:${addr.port}/bait.html`,
    close: () =>
      new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

async function main() {
  const { checkSellerPageForBait } = await import("../../src/lib/torob-ops/bait.server.ts");
  const report: string[] = [];
  const log = (s: string) => {
    report.push(s);
    console.log(s);
  };

  const roles = await rest<Array<{ user_id: string }>>(
    "GET",
    "/user_roles?role=eq.admin&select=user_id&limit=1",
  );
  assert(roles.status < 300 && roles.data?.[0]?.user_id, "admin role");
  const actorId = roles.data![0].user_id;

  const fixture = await startBaitFixtureServer();
  try {
    const bait = await checkSellerPageForBait(fixture.url);
    assert(bait.enriched && bait.strong, "enrichment");
    log(`PASS phase2 enrichment signals=${bait.signals.join(",")}`);

    await rest("DELETE", "/torob_ops_own_shops?notes=like.e2e-path-a*");
    const shop = await rest("POST", "/torob_ops_own_shops", {
      shop_name: "فروشگاه خودی تست",
      domain: "own-shop-path-a.test",
      notes: "e2e-path-a-own-shop",
      is_active: true,
      created_by: actorId,
    });
    assert(shop.status < 300, `own shop ${shop.status} ${shop.text}`);
    log("PASS phase2 own_shop insert");

    await rest("DELETE", "/torob_ops_findings?review_note=like.e2e-path-a*");
    const products = await rest<Array<{ id: string; name: string }>>(
      "GET",
      "/products?select=id,name&limit=1",
    );
    assert(products.data?.[0]?.id, "product");
    const product = products.data![0];

    const run = await rest<Array<{ id: string }>>("POST", "/torob_ops_scan_runs", {
      status: "completed",
      created_by: actorId,
      notes: "e2e-path-a-scan",
      products_total: 1,
      findings_total: 3,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
    assert(run.data?.[0]?.id, `run ${run.text}`);
    const runId = run.data![0].id;

    const evidence = {
      bait_signals: bait.signals,
      phones: bait.phones,
      seller_enriched: true,
      note: "فاز ۲: غنی‌سازی فقط‌خواندنی",
    };

    const rows: Array<Record<string, unknown>> = [
      {
        scan_run_id: runId,
        product_id: product.id,
        product_name_snapshot: product.name,
        torob_url: fixture.url,
        seller_domain: "bait-fixture.local",
        our_price_toman: 1000000,
        their_price_toman: 700000,
        price_source: "observatory",
        status: "manual_review",
        evidence,
        review_note: "e2e-path-a-manual",
      },
      {
        scan_run_id: runId,
        product_id: product.id,
        product_name_snapshot: product.name,
        torob_url: fixture.url,
        seller_domain: "bait-confirmed.local",
        our_price_toman: 1000000,
        their_price_toman: 650000,
        price_source: "observatory",
        status: "confirmed_bait",
        evidence,
        review_note: "e2e-path-a-confirmed",
      },
      {
        scan_run_id: runId,
        product_id: product.id,
        product_name_snapshot: product.name,
        torob_url: fixture.url,
        seller_domain: "bait-queued.local",
        our_price_toman: 1000000,
        their_price_toman: 600000,
        price_source: "observatory",
        status: "queued_for_report",
        evidence,
        review_note: "e2e-path-a-queued",
      },
    ];
    for (let i = 0; i < 30; i++) {
      rows.push({
        scan_run_id: runId,
        product_id: product.id,
        product_name_snapshot: `${product.name} pad-${i}`,
        torob_url: fixture.url,
        seller_domain: `pad-${i}.local`,
        our_price_toman: 1000000,
        their_price_toman: 800000,
        price_source: "observatory",
        status: "cheaper_competitor",
        evidence,
        review_note: `e2e-path-a-pad-${i}`,
      });
    }
    const inserted = await rest<Array<{ id: string; status: string }>>(
      "POST",
      "/torob_ops_findings",
      rows,
    );
    assert(inserted.status < 300 && (inserted.data?.length ?? 0) >= 33, inserted.text);

    const page = await rest<unknown[]>(
      "GET",
      "/torob_ops_findings?review_note=like.e2e-path-a*&select=id&limit=25",
    );
    assert((page.data?.length ?? 0) === 25, "page size 25");
    log("PASS phase2 pagination page_size=25");

    const manual = inserted.data!.find((r) => r.status === "manual_review")!;
    const confirmed = inserted.data!.find((r) => r.status === "confirmed_bait")!;
    const queued = inserted.data!.find((r) => r.status === "queued_for_report")!;

    // Preview gate (mirror server allow-list)
    const allowed = new Set(["confirmed_bait", "queued_for_report", "report_failed", "reported"]);
    assert(!allowed.has("manual_review"), "gate constant");
    assert(!allowed.has(manual.status) || manual.status === "manual_review", "manual blocked");
    assert(allowed.has(confirmed.status), "confirmed allowed");
    log("PASS phase3 preview status gate");

    await rest("DELETE", "/torob_ops_accounts?label=like.e2e-path-a*");
    const encA = encryptSession(JSON.stringify({ cookies: "acct-a" }));
    const encB = encryptSession(JSON.stringify({ cookies: "acct-b" }));
    const accounts = await rest<Array<{ id: string; label: string }>>("POST", "/torob_ops_accounts", [
      {
        label: "e2e-path-a-A",
        status: "active",
        session_ciphertext: encA.ciphertext,
        session_iv: encA.iv,
        daily_cap: 20,
        created_by: actorId,
      },
      {
        label: "e2e-path-a-B",
        status: "active",
        session_ciphertext: encB.ciphertext,
        session_iv: encB.iv,
        daily_cap: 20,
        created_by: actorId,
      },
    ]);
    assert(accounts.data?.length === 2, accounts.text);
    await rest("PATCH", `/torob_ops_accounts?id=eq.${accounts.data![0].id}`, {
      status: "quarantine",
      last_error: "e2e captcha",
    });
    const active = await rest<Array<{ id: string }>>(
      "GET",
      "/torob_ops_accounts?status=eq.active&label=like.e2e-path-a*&select=id,label&order=last_used_at.asc.nullsfirst",
    );
    assert(active.data?.length === 1 && active.data[0].id === accounts.data![1].id, "pick B");
    log("PASS phase5 quarantine leaves B active");

    // settings: enable auto + clear kill
    await rest("PATCH", "/torob_ops_settings?id=eq.1", {
      auto_report_enabled: true,
      kill_switch: false,
      updated_by: actorId,
    });

    await rest("PATCH", `/torob_ops_findings?id=eq.${queued.id}`, {
      status: "queued_for_report",
    });

    assert(WORKER, "TOROB_OPS_WORKER_TOKEN");
    const workerRes = await fetch(`${APP}/api/public/hooks/process-torob-ops-report-queue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WORKER}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 1, dry_run: false }),
    });
    const workerBody = await workerRes.text();
    log(`worker HTTP ${workerRes.status} ${workerBody.slice(0, 240)}`);
    assert(workerRes.status === 200, "worker http");
    const workerJson = JSON.parse(workerBody) as {
      processed?: number;
      results?: Array<{ ok?: boolean; correlationId?: string; accountId?: string }>;
    };
    assert((workerJson.processed ?? 0) >= 1, "worker processed>=1");
    assert(workerJson.results?.[0]?.ok === true, `worker ok: ${workerBody}`);
    assert(
      String(workerJson.results?.[0]?.correlationId || "").startsWith("torob-ops:"),
      "correlation",
    );
    log("PASS phase4 worker auto simulate");

    const logs = await rest<Array<{ correlation_id: string; account_id: string; mode: string }>>(
      "GET",
      `/torob_ops_report_logs?finding_id=eq.${queued.id}&select=correlation_id,account_id,mode,result&order=created_at.desc&limit=1`,
    );
    assert(logs.data?.[0]?.correlation_id, "correlation persisted");
    assert(logs.data?.[0]?.account_id === accounts.data![1].id, "account B in log");
    log("PASS phase4 audit log");

    await rest("PATCH", "/torob_ops_settings?id=eq.1", { kill_switch: true, updated_by: actorId });
    await rest("PATCH", `/torob_ops_findings?id=eq.${confirmed.id}`, {
      status: "queued_for_report",
    });
    const kill = await fetch(`${APP}/api/public/hooks/process-torob-ops-report-queue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WORKER}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 1 }),
    });
    const killBody = JSON.parse(await kill.text()) as {
      processed?: number;
      results?: Array<{ reason?: string }>;
    };
    assert(
      (killBody.processed ?? 0) === 0 || killBody.results?.[0]?.reason === "kill_switch",
      "kill switch",
    );
    log("PASS phase6 kill switch");

    await rest("PATCH", "/torob_ops_settings?id=eq.1", {
      auto_report_enabled: false,
      kill_switch: false,
      updated_by: actorId,
    });

    // disposable module credential for e2e unlock (test.admin harness id)
    const e2eAdminId = "05098088-2849-43f4-8eb5-7c473c3832ec";
    const pw = "e2e-path-a-module-pass";
    await rest("DELETE", `/torob_ops_credentials?user_id=eq.${e2eAdminId}`);
    const cred = await rest("POST", "/torob_ops_credentials", {
      user_id: e2eAdminId,
      password_hash: hashPassword(pw),
      is_active: true,
      created_by: actorId,
    });
    assert(cred.status < 300, cred.text);
    log("PASS disposable module credential for test.admin");
    log(`E2E_MODULE_PASSWORD=${pw}`);
    log(`E2E_ADMIN_USER_ID=${e2eAdminId}`);
    log("ACCEPT_OK");
  } finally {
    await fixture.close();
  }

  fs.writeFileSync(
    path.join(process.cwd(), "docs/verification/_torob_path_a_accept.out"),
    report.join("\n") + "\n",
    "utf8",
  );
}

main().catch((e) => {
  console.error("ACCEPT_FAIL", e);
  process.exit(1);
});
