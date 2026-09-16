import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FINDING_STATUSES } from "./types";
import {
  listTorobOpsCredentials,
  requireTorobOpsSession,
  revokeAllTorobOpsSessionsForUser,
  revokeTorobOpsSession,
  setTorobOpsCredentialActive,
  unlockTorobOpsSession,
  upsertTorobOpsCredential,
} from "./session.server";
import {
  cancelTorobOpsScan,
  createAndRunTorobOpsScan,
  logManualTorobReport,
  updateFindingStatus,
} from "./scan.server";
import { torobOpsAdmin } from "./db.server";

const ALLOWED_OPS_ROLES = ["admin", "manager", "sales", "accountant", "viewer"] as const;
const WRITE_OPS_ROLES = ["admin", "manager", "sales"] as const;

async function assertRoles(userId: string, allowed: readonly string[]) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("بررسی نقش ناموفق بود.");
  const roles = (data ?? []).map((r) => String(r.role));
  if (!roles.some((r) => allowed.includes(r))) {
    throw new Error("دسترسی لازم را ندارید.");
  }
  return roles;
}

async function assertAdmin(userId: string) {
  await assertRoles(userId, ["admin"]);
}

const OpsSessionField = z.object({
  opsSession: z.string().min(16).optional(),
});

export const torobOpsUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ password: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await assertRoles(userId, ALLOWED_OPS_ROLES);
    const result = await unlockTorobOpsSession({ userId, password: data.password });
    if (!result.ok) throw new Error(result.message);
    return { sessionToken: result.sessionToken };
  });

export const torobOpsLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ opsSession: z.string().min(16) }))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await revokeTorobOpsSession({ userId, sessionToken: data.opsSession });
    return { ok: true as const };
  });

export const torobOpsAdminListCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}).optional())
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    await assertAdmin(userId);
    return await listTorobOpsCredentials();
  });

export const torobOpsAdminUpsertCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(8),
      isActive: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const adminId = (context as { userId: string }).userId;
    await assertAdmin(adminId);
    const result = await upsertTorobOpsCredential({
      adminId,
      userId: data.userId,
      password: data.password,
      isActive: data.isActive,
    });
    if (!result.ok) throw new Error(result.message);
    return { ok: true as const };
  });

export const torobOpsAdminSetCredentialActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), isActive: z.boolean() }))
  .handler(async ({ data, context }) => {
    const adminId = (context as { userId: string }).userId;
    await assertAdmin(adminId);
    const result = await setTorobOpsCredentialActive({
      adminId,
      userId: data.userId,
      isActive: data.isActive,
    });
    if (!result.ok) throw new Error(result.message);
    return { ok: true as const };
  });

export const torobOpsAdminRevokeSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const adminId = (context as { userId: string }).userId;
    await assertAdmin(adminId);
    const count = await revokeAllTorobOpsSessionsForUser({
      userId: data.userId,
      adminId,
      reason: "admin_revoke",
    });
    return { revoked: count };
  });

export const torobOpsAdminListActiveUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}).optional())
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    await assertAdmin(userId);
    const { data, error } = await torobOpsAdmin()
      .from("profiles")
      .select("id, full_name, status, phone")
      .eq("status", "active")
      .order("full_name")
      .limit(500);
    if (error) throw new Error(error.message);

    // LAN/test DBs often rename everyone to «کاربر آزمایشی N»; expose email so
    // admins can identify real accounts (auth.users is not in PostgREST).
    const emailById = new Map<string, string | null>();
    let page = 1;
    for (;;) {
      const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listErr) throw new Error(listErr.message);
      const users = pageData?.users ?? [];
      for (const u of users) emailById.set(u.id, u.email ?? null);
      if (users.length < 200) break;
      page += 1;
      if (page > 20) break;
    }

    const rows = (data ?? []).map((p: { id: string; full_name: string | null; status: string; phone: string | null }) => ({
      id: p.id,
      full_name: p.full_name,
      status: p.status,
      phone: p.phone,
      email: emailById.get(p.id) ?? null,
      isSelf: p.id === userId,
    }));

    rows.sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      const ae = (a.email || a.full_name || "").toLowerCase();
      const be = (b.email || b.full_name || "").toLowerCase();
      return ae.localeCompare(be, "fa");
    });

    return rows;
  });

async function gateOps(userId: string, opsSession: string | undefined, write: boolean) {
  await assertRoles(userId, write ? WRITE_OPS_ROLES : ALLOWED_OPS_ROLES);
  const sess = await requireTorobOpsSession({ userId, sessionToken: opsSession });
  if (!sess.ok) throw new Error(sess.message);
}

export const torobOpsCreateScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    OpsSessionField.extend({
      labelIds: z.array(z.string().uuid()).default([]),
      notes: z.string().max(2000).optional(),
      runBaitChecks: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await gateOps(userId, data.opsSession, true);
    return await createAndRunTorobOpsScan({
      userId,
      labelIds: data.labelIds,
      notes: data.notes,
      runBaitChecks: data.runBaitChecks,
    });
  });

export const torobOpsCancelScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(OpsSessionField.extend({ runId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await gateOps(userId, data.opsSession, true);
    await cancelTorobOpsScan({ userId, runId: data.runId });
    return { ok: true as const };
  });

export const torobOpsListRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(OpsSessionField.extend({ limit: z.number().int().min(1).max(100).optional() }))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await gateOps(userId, data.opsSession, false);
    const { data: rows, error } = await torobOpsAdmin()
      .from("torob_ops_scan_runs")
      .select(
        "id, status, label_ids, created_by, started_at, finished_at, products_total, findings_total, error_message, notes, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const torobOpsListFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    OpsSessionField.extend({
      status: z.enum(FINDING_STATUSES).optional(),
      runId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await gateOps(userId, data.opsSession, false);
    let q = torobOpsAdmin()
      .from("torob_ops_findings")
      .select(
        "id, scan_run_id, product_id, product_name_snapshot, torob_url, seller_name, seller_domain, seller_offer_url, our_price_toman, their_price_toman, price_source, status, evidence, reviewed_by, reviewed_at, review_note, created_at",
      )
      .order("created_at", { ascending: false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 50) - 1);
    if (data.status) q = q.eq("status", data.status);
    if (data.runId) q = q.eq("scan_run_id", data.runId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const torobOpsReviewFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    OpsSessionField.extend({
      findingId: z.string().uuid(),
      status: z.enum([
        "confirmed_bait",
        "legitimate_competitor",
        "manual_review",
        "suspected_bait",
        "cheaper_competitor",
        "cancelled",
      ]),
      reviewNote: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await gateOps(userId, data.opsSession, true);
    await updateFindingStatus({
      userId,
      findingId: data.findingId,
      status: data.status,
      reviewNote: data.reviewNote,
    });
    return { ok: true as const };
  });

export const torobOpsLogReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    OpsSessionField.extend({
      findingId: z.string().uuid(),
      reportText: z.string().max(4000).optional(),
      result: z.enum(["submitted", "failed", "skipped"]),
      notes: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await gateOps(userId, data.opsSession, true);
    await logManualTorobReport({
      userId,
      findingId: data.findingId,
      reportText: data.reportText,
      result: data.result,
      notes: data.notes,
    });
    return { ok: true as const };
  });

export const torobOpsDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(OpsSessionField)
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await gateOps(userId, data.opsSession, false);

    const statuses = [
      "manual_review",
      "suspected_bait",
      "confirmed_bait",
      "cheaper_competitor",
      "reported",
    ] as const;

    const counts: Record<string, number> = {};
    for (const status of statuses) {
      const { count, error } = await torobOpsAdmin()
        .from("torob_ops_findings")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw new Error(error.message);
      counts[status] = count ?? 0;
    }

    const { count: runsCount } = await torobOpsAdmin()
      .from("torob_ops_scan_runs")
      .select("id", { count: "exact", head: true });

    return { counts, runsTotal: runsCount ?? 0 };
  });

export const torobOpsListLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(OpsSessionField)
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await gateOps(userId, data.opsSession, false);
    const { data: rows, error } = await torobOpsAdmin()
      .from("product_labels")
      .select("id, title, color, is_active")
      .eq("is_active", true)
      .order("title");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
