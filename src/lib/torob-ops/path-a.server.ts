import {
  decryptTorobAccountSession,
  encryptTorobAccountSession,
} from "./crypto.server";
import { torobOpsAdmin, writeTorobOpsAudit } from "./db.server";
import type { AccountStatus, FindingStatus } from "./types";

export type TorobOpsSettings = {
  id: number;
  auto_report_enabled: boolean;
  kill_switch: boolean;
  require_human_confirm_first_n: number;
  max_reports_per_hour: number;
  dedupe_window_hours: number;
};

export async function getTorobOpsSettings(): Promise<TorobOpsSettings> {
  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_settings")
    .select(
      "id, auto_report_enabled, kill_switch, require_human_confirm_first_n, max_reports_per_hour, dedupe_window_hours",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      id: 1,
      auto_report_enabled: false,
      kill_switch: false,
      require_human_confirm_first_n: 5,
      max_reports_per_hour: 10,
      dedupe_window_hours: 72,
    };
  }
  return data as TorobOpsSettings;
}

export async function updateTorobOpsSettings(input: {
  adminId: string;
  patch: Partial<{
    auto_report_enabled: boolean;
    kill_switch: boolean;
    require_human_confirm_first_n: number;
    max_reports_per_hour: number;
    dedupe_window_hours: number;
  }>;
}): Promise<TorobOpsSettings> {
  const { error } = await torobOpsAdmin()
    .from("torob_ops_settings")
    .upsert({
      id: 1,
      ...input.patch,
      updated_by: input.adminId,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
  await writeTorobOpsAudit({
    actorId: input.adminId,
    action: "torob_ops_settings_update",
    entityId: "00000000-0000-0000-0000-000000000001",
    diff: input.patch,
  });
  return getTorobOpsSettings();
}

export async function listOwnShops() {
  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_own_shops")
    .select("id, shop_name, domain, notes, is_active, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertOwnShop(input: {
  userId: string;
  id?: string;
  shopName?: string | null;
  domain?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  const shop_name = input.shopName?.trim() || null;
  const domain = input.domain?.trim().toLowerCase() || null;
  if (!shop_name && !domain) throw new Error("نام فروشگاه یا دامنه لازم است.");

  if (input.id) {
    const { error } = await torobOpsAdmin()
      .from("torob_ops_own_shops")
      .update({
        shop_name,
        domain,
        notes: input.notes ?? null,
        is_active: input.isActive ?? true,
      })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    return { id: input.id };
  }

  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_own_shops")
    .insert({
      shop_name,
      domain,
      notes: input.notes ?? null,
      is_active: input.isActive ?? true,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function deleteOwnShop(id: string) {
  const { error } = await torobOpsAdmin().from("torob_ops_own_shops").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listReportTemplates() {
  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_report_templates")
    .select("id, name, body, is_default, is_active, updated_at")
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertReportTemplate(input: {
  adminId: string;
  id?: string;
  name: string;
  body: string;
  isDefault?: boolean;
  isActive?: boolean;
}) {
  if (input.isDefault) {
    await torobOpsAdmin()
      .from("torob_ops_report_templates")
      .update({ is_default: false })
      .eq("is_default", true);
  }
  if (input.id) {
    const { error } = await torobOpsAdmin()
      .from("torob_ops_report_templates")
      .update({
        name: input.name.trim(),
        body: input.body,
        is_default: input.isDefault ?? false,
        is_active: input.isActive ?? true,
        updated_by: input.adminId,
      })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    return { id: input.id };
  }
  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_report_templates")
    .insert({
      name: input.name.trim(),
      body: input.body,
      is_default: input.isDefault ?? false,
      is_active: input.isActive ?? true,
      created_by: input.adminId,
      updated_by: input.adminId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export function renderReportTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null || v === "" ? "—" : String(v);
  });
}

export async function buildReportPreview(findingId: string): Promise<{
  findingId: string;
  status: string;
  reportText: string;
  torobUrl: string | null;
  blockedReason: string | null;
}> {
  const { data: finding, error } = await torobOpsAdmin()
    .from("torob_ops_findings")
    .select(
      "id, status, product_name_snapshot, torob_url, our_price_toman, their_price_toman, evidence, seller_domain",
    )
    .eq("id", findingId)
    .maybeSingle();
  if (error || !finding) throw new Error("یافته یافت نشد.");

  const allowed = ["confirmed_bait", "queued_for_report", "report_failed", "reported"];
  if (!allowed.includes(String(finding.status))) {
    return {
      findingId,
      status: String(finding.status),
      reportText: "",
      torobUrl: finding.torob_url,
      blockedReason: "فقط یافتهٔ تأییدشده/صف گزارش قابل پیش‌نمایش است.",
    };
  }

  const { data: tmpl } = await torobOpsAdmin()
    .from("torob_ops_report_templates")
    .select("body")
    .eq("is_active", true)
    .eq("is_default", true)
    .maybeSingle();

  const evidence = (finding.evidence ?? {}) as Record<string, unknown>;
  const signals = Array.isArray(evidence.bait_signals)
    ? (evidence.bait_signals as string[]).join(", ")
    : "";

  const body =
    tmpl?.body ??
    "گزارش طعمه\n{{product_name}}\n{{torob_url}}\n{{our_price}} / {{their_price}}\n{{bait_signals}}";

  const reportText = renderReportTemplate(body, {
    product_name: finding.product_name_snapshot,
    torob_url: finding.torob_url,
    our_price: finding.our_price_toman,
    their_price: finding.their_price_toman,
    bait_signals: signals,
    seller_domain: finding.seller_domain,
  });

  return {
    findingId,
    status: String(finding.status),
    reportText,
    torobUrl: finding.torob_url,
    blockedReason: null,
  };
}

export async function countFindings(status?: string): Promise<number> {
  let q = torobOpsAdmin()
    .from("torob_ops_findings")
    .select("id", { count: "exact", head: true });
  if (status) q = q.eq("status", status);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listAccountsMeta() {
  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_accounts")
    .select(
      "id, label, status, last_used_at, last_error, reports_today, reports_day, daily_cap, created_at, updated_at, session_ciphertext",
    )
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    label: row.label,
    status: row.status,
    last_used_at: row.last_used_at,
    last_error: row.last_error,
    reports_today: row.reports_today,
    reports_day: row.reports_day,
    daily_cap: row.daily_cap,
    created_at: row.created_at,
    updated_at: row.updated_at,
    has_session: Boolean(row.session_ciphertext),
  }));
}

export async function upsertAccount(input: {
  adminId: string;
  id?: string;
  label: string;
  status?: AccountStatus;
  dailyCap?: number;
  sessionJson?: string | null;
}) {
  const payload: Record<string, unknown> = {
    label: input.label.trim(),
    status: input.status ?? "active",
    daily_cap: input.dailyCap ?? 20,
    updated_by: input.adminId,
  };
  if (input.sessionJson && input.sessionJson.trim()) {
    const enc = encryptTorobAccountSession(input.sessionJson.trim());
    payload.session_ciphertext = enc.ciphertext;
    payload.session_iv = enc.iv;
  }
  if (input.id) {
    const { error } = await torobOpsAdmin()
      .from("torob_ops_accounts")
      .update(payload)
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    return { id: input.id };
  }
  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_accounts")
    .insert({ ...payload, created_by: input.adminId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function setAccountStatus(input: {
  adminId: string;
  id: string;
  status: AccountStatus;
  lastError?: string | null;
}) {
  const { error } = await torobOpsAdmin()
    .from("torob_ops_accounts")
    .update({
      status: input.status,
      last_error: input.lastError ?? null,
      updated_by: input.adminId,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  await writeTorobOpsAudit({
    actorId: input.adminId,
    action: "torob_ops_account_status",
    entityId: input.id,
    diff: { status: input.status },
  });
}

/** Pick least-recently-used active account under daily cap. */
export async function pickReporterAccount(): Promise<{
  id: string;
  label: string;
  sessionPlain: string | null;
} | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await torobOpsAdmin()
    .from("torob_ops_accounts")
    .select(
      "id, label, status, reports_today, reports_day, daily_cap, last_used_at, session_ciphertext, session_iv",
    )
    .eq("status", "active")
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const reportsToday =
      row.reports_day === today ? Number(row.reports_today ?? 0) : 0;
    if (reportsToday >= Number(row.daily_cap ?? 20)) continue;
    let sessionPlain: string | null = null;
    if (row.session_ciphertext && row.session_iv) {
      try {
        sessionPlain = decryptTorobAccountSession(
          String(row.session_ciphertext),
          String(row.session_iv),
        );
      } catch {
        sessionPlain = null;
      }
    }
    return { id: String(row.id), label: String(row.label), sessionPlain };
  }
  return null;
}

export async function queueFindingForReport(input: {
  userId: string;
  findingId: string;
}): Promise<void> {
  const { data: finding, error } = await torobOpsAdmin()
    .from("torob_ops_findings")
    .select("id, status, product_id, seller_domain")
    .eq("id", input.findingId)
    .maybeSingle();
  if (error || !finding) throw new Error("یافته یافت نشد.");
  if (finding.status !== "confirmed_bait" && finding.status !== "report_failed") {
    throw new Error("فقط طعمه تأییدشده قابل صف گزارش است.");
  }

  const settings = await getTorobOpsSettings();
  if (settings.kill_switch) throw new Error("کلید اضطراری فعال است؛ صف گزارش متوقف است.");

  // Dedupe: recent reported/queued same product+domain
  if (finding.product_id && finding.seller_domain) {
    const since = new Date(
      Date.now() - settings.dedupe_window_hours * 3600_000,
    ).toISOString();
    const { data: dupes } = await torobOpsAdmin()
      .from("torob_ops_findings")
      .select("id")
      .eq("product_id", finding.product_id)
      .eq("seller_domain", finding.seller_domain)
      .in("status", ["queued_for_report", "reporting", "reported"])
      .gte("created_at", since)
      .neq("id", finding.id)
      .limit(1);
    if ((dupes ?? []).length > 0) {
      throw new Error("گزارش مشابه در بازهٔ تکراری‌نبودن وجود دارد.");
    }
  }

  const { error: upErr } = await torobOpsAdmin()
    .from("torob_ops_findings")
    .update({ status: "queued_for_report" satisfies FindingStatus })
    .eq("id", input.findingId);
  if (upErr) throw new Error(upErr.message);

  await writeTorobOpsAudit({
    actorId: input.userId,
    action: "torob_ops_queue_report",
    entityId: input.findingId,
  });
}

/**
 * Dry-run or auto submit adapter.
 * Real Torob HTTP form wiring is feature-flagged; without session → dry_run only.
 */
export async function submitTorobReportAdapter(input: {
  mode: "dry_run" | "auto";
  reportText: string;
  torobUrl: string | null;
  sessionPlain: string | null;
}): Promise<{ ok: boolean; detail: string }> {
  if (input.mode === "dry_run") {
    return {
      ok: true,
      detail: `dry_run ok; chars=${input.reportText.length}; url=${input.torobUrl ?? "none"}`,
    };
  }
  if (!input.sessionPlain) {
    return { ok: false, detail: "session حساب ترب موجود نیست؛ فقط dry_run مجاز است." };
  }
  // Staging-only simulated success after spike approval (never hits Torob).
  if (process.env.TOROB_OPS_SIMULATE_SUBMIT === "1") {
    return {
      ok: true,
      detail: `simulate_submit ok; chars=${input.reportText.length}; url=${input.torobUrl ?? "none"}`,
    };
  }
  // Live Torob form adapter: gated until spike + owner approval.
  return {
    ok: false,
    detail:
      "auto adapter هنوز به فرم زندهٔ ترب وصل نشده؛ worker در dry_run یا TOROB_OPS_SIMULATE_SUBMIT=1.",
  };
}

export async function processAutoReportQueue(input: {
  actorId: string;
  dryRunForce?: boolean;
  limit?: number;
}): Promise<{ processed: number; results: Array<Record<string, unknown>> }> {
  const settings = await getTorobOpsSettings();
  if (settings.kill_switch) {
    return { processed: 0, results: [{ skipped: true, reason: "kill_switch" }] };
  }
  if (!settings.auto_report_enabled && !input.dryRunForce) {
    return { processed: 0, results: [{ skipped: true, reason: "auto_report_disabled" }] };
  }

  const mode: "dry_run" | "auto" = input.dryRunForce || !settings.auto_report_enabled ? "dry_run" : "auto";

  const { data: rows, error } = await torobOpsAdmin()
    .from("torob_ops_findings")
    .select("id")
    .eq("status", "queued_for_report")
    .order("created_at", { ascending: true })
    .limit(input.limit ?? Math.min(10, settings.max_reports_per_hour));
  if (error) throw new Error(error.message);

  const results: Array<Record<string, unknown>> = [];
  let processed = 0;

  for (const row of rows ?? []) {
    const findingId = String(row.id);
    const account = await pickReporterAccount();
    if (!account && mode === "auto") {
      results.push({ findingId, ok: false, detail: "no_active_account" });
      break;
    }

    await torobOpsAdmin()
      .from("torob_ops_findings")
      .update({ status: "reporting" })
      .eq("id", findingId);

    const preview = await buildReportPreview(findingId);
    const submit = await submitTorobReportAdapter({
      mode,
      reportText: preview.reportText,
      torobUrl: preview.torobUrl,
      sessionPlain: account?.sessionPlain ?? null,
    });

    await torobOpsAdmin().from("torob_ops_report_logs").insert({
      finding_id: findingId,
      reported_by: input.actorId,
      report_text: preview.reportText,
      result: submit.ok ? "submitted" : "failed",
      notes: submit.detail,
      account_id: account?.id ?? null,
      mode,
    });

    await torobOpsAdmin()
      .from("torob_ops_findings")
      .update({
        status: submit.ok ? (mode === "dry_run" ? "queued_for_report" : "reported") : "report_failed",
      })
      .eq("id", findingId);

    if (account && submit.ok && mode === "auto") {
      const today = new Date().toISOString().slice(0, 10);
      const { data: acc } = await torobOpsAdmin()
        .from("torob_ops_accounts")
        .select("reports_today, reports_day")
        .eq("id", account.id)
        .maybeSingle();
      const prev =
        acc?.reports_day === today ? Number(acc.reports_today ?? 0) : 0;
      await torobOpsAdmin()
        .from("torob_ops_accounts")
        .update({
          last_used_at: new Date().toISOString(),
          reports_day: today,
          reports_today: prev + 1,
          last_error: null,
        })
        .eq("id", account.id);
    }

    if (!submit.ok && account && /captcha|ban|blocked/i.test(submit.detail)) {
      await setAccountStatus({
        adminId: input.actorId,
        id: account.id,
        status: "quarantine",
        lastError: submit.detail,
      });
    }

    results.push({ findingId, ok: submit.ok, mode, detail: submit.detail, accountId: account?.id });
    processed += 1;
  }

  return { processed, results };
}
