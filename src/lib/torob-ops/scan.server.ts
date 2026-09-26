import { BASE_SALE_PRICE_TYPE_CODE } from "@/lib/pricing/constants";
import { checkSellerPageForBait, LARGE_UNDERCUT_PERCENT } from "./bait.server";
import { torobOpsAdmin, writeTorobOpsAudit } from "./db.server";
import type { FindingStatus } from "./types";

type ProductRow = {
  id: string;
  name: string;
  torob_url: string | null;
};

type OwnShop = { shop_name: string | null; domain: string | null };

function normalizeDomain(d: string | null | undefined): string | null {
  if (!d) return null;
  return (
    d
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0] || null
  );
}

function isOwnShop(
  own: OwnShop[],
  sellerName: string | null,
  sellerDomain: string | null,
): boolean {
  const name = (sellerName ?? "").trim().toLowerCase();
  const domain = normalizeDomain(sellerDomain);
  for (const row of own) {
    const ownName = (row.shop_name ?? "").trim().toLowerCase();
    const ownDomain = normalizeDomain(row.domain);
    if (ownName && name && (name.includes(ownName) || ownName.includes(name))) return true;
    if (ownDomain && domain && (domain === ownDomain || domain.endsWith("." + ownDomain)))
      return true;
  }
  return false;
}

async function loadOwnShops(): Promise<OwnShop[]> {
  const { data } = await torobOpsAdmin()
    .from("torob_ops_own_shops")
    .select("shop_name, domain")
    .eq("is_active", true);
  return (data ?? []) as OwnShop[];
}

async function loadCandidateProducts(labelIds: string[]): Promise<ProductRow[]> {
  const query = torobOpsAdmin()
    .from("products")
    .select("id, name, torob_url, product_label_links(label_id)")
    .not("torob_url", "is", null)
    .eq("is_active", true)
    .limit(5000);

  const { data, error } = await query;
  if (error) throw new Error(`بارگذاری محصولات ناموفق: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    torob_url: string | null;
    product_label_links?: Array<{ label_id: string }> | null;
  }>;

  return rows
    .filter((r) => {
      const links = r.product_label_links ?? [];
      if (links.length === 0) return false;
      if (labelIds.length === 0) return true;
      const set = new Set(links.map((l) => l.label_id));
      return labelIds.every((id) => set.has(id));
    })
    .map((r) => ({ id: r.id, name: r.name, torob_url: r.torob_url }));
}

async function loadOurPrices(productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;

  const chunk = 200;
  for (let i = 0; i < productIds.length; i += chunk) {
    const ids = productIds.slice(i, i + chunk);
    const { data, error } = await torobOpsAdmin()
      .from("product_computed_prices_public")
      .select("product_id, rounded_sale_price, computed_at, sale_price_types!inner(code)")
      .in("product_id", ids)
      .eq("sale_price_types.code", BASE_SALE_PRICE_TYPE_CODE)
      .order("computed_at", { ascending: false });

    if (error) {
      // Fallback without join if view shape differs
      const { data: plain } = await torobOpsAdmin()
        .from("product_computed_prices_public")
        .select("product_id, rounded_sale_price, computed_at")
        .in("product_id", ids)
        .order("computed_at", { ascending: false });
      for (const row of plain ?? []) {
        if (!map.has(row.product_id)) {
          map.set(row.product_id, Number(row.rounded_sale_price));
        }
      }
      continue;
    }

    for (const row of data ?? []) {
      if (!map.has(row.product_id)) {
        map.set(row.product_id, Number(row.rounded_sale_price));
      }
    }
  }
  return map;
}

type ObservatoryRow = {
  afrakala_product_id?: string;
  torob_min_price_toman?: number | string | null;
  torob_avg_price_toman?: number | string | null;
  torob_seller_count?: number | string | null;
  product_name?: string;
};

type SnapshotRow = {
  product_id: string;
  seller_name: string | null;
  seller_shop_url: string | null;
  seller_shop_id: string | null;
  price_toman: number | null;
  is_own_shop: boolean;
  excluded?: boolean | null;
  exclude_reason?: string | null;
  torob_url: string | null;
  fetched_at: string;
};

async function loadLatestSnapshots(productIds: string[]): Promise<Map<string, SnapshotRow[]>> {
  const map = new Map<string, SnapshotRow[]>();
  if (productIds.length === 0) return map;
  const seen = new Set<string>();
  const chunk = 200;
  for (let i = 0; i < productIds.length; i += chunk) {
    const ids = productIds.slice(i, i + chunk);
    const { data } = await torobOpsAdmin()
      .from("torob_offer_snapshots")
      .select(
        "product_id, seller_name, seller_shop_url, seller_shop_id, price_toman, is_own_shop, excluded, exclude_reason, torob_url, fetched_at",
      )
      .in("product_id", ids)
      .order("fetched_at", { ascending: false })
      .limit(2000);
    for (const row of (data ?? []) as SnapshotRow[]) {
      const key = `${row.product_id}:${row.seller_shop_id ?? row.seller_name ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = map.get(row.product_id) ?? [];
      list.push(row);
      map.set(row.product_id, list);
    }
  }
  return map;
}

function cheapestNonOwnSnapshot(rows: SnapshotRow[] | undefined): SnapshotRow | null {
  if (!rows?.length) return null;
  const priced = rows.filter(
    (r) =>
      !r.is_own_shop &&
      !r.excluded &&
      r.price_toman != null &&
      Number(r.price_toman) > 0,
  );
  if (priced.length === 0) return null;
  return priced.reduce((a, b) => (Number(a.price_toman) <= Number(b.price_toman) ? a : b));
}

async function loadObservatoryByProductIds(
  productIds: string[],
): Promise<Map<string, ObservatoryRow>> {
  const map = new Map<string, ObservatoryRow>();
  if (productIds.length === 0) return map;

  const { data: table, error: tableErr } = await torobOpsAdmin()
    .from("dynamic_tables")
    .select("id")
    .eq("slug", "afrakala-product-price-observatory")
    .maybeSingle();

  if (tableErr || !table?.id) return map;

  // Page through observatory; filter client-side by product id (RPC filter shapes vary).
  let offset = 0;
  const limit = 500;
  const wanted = new Set(productIds);

  for (let page = 0; page < 40; page++) {
    const { data, error } = await torobOpsAdmin().rpc("query_dynamic_table_rows_v2", {
      p_table_id: table.id,
      p_limit: limit,
      p_offset: offset,
      p_show_inactive: false,
    });
    if (error || !data || data.length === 0) break;

    for (const row of data) {
      const values = (row.out_values ?? {}) as Record<string, unknown>;
      const pid = String(values.afrakala_product_id ?? "");
      if (!pid || !wanted.has(pid)) continue;
      map.set(pid, {
        afrakala_product_id: pid,
        torob_min_price_toman: values.torob_min_price_toman as number | string | null,
        torob_avg_price_toman: values.torob_avg_price_toman as number | string | null,
        torob_seller_count: values.torob_seller_count as number | string | null,
        product_name: values.product_name as string | undefined,
      });
    }

    if (data.length < limit) break;
    offset += limit;
    if (map.size >= wanted.size) break;
  }

  return map;
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function classifyPathB(input: {
  ourPrice: number;
  theirPrice: number;
  baitStrong: boolean;
  baitFetchFailed: boolean;
}): FindingStatus {
  const undercutPct = ((input.ourPrice - input.theirPrice) / input.ourPrice) * 100;
  if (input.baitStrong) return "suspected_bait";
  if (input.baitFetchFailed || undercutPct >= LARGE_UNDERCUT_PERCENT) return "manual_review";
  return "cheaper_competitor";
}

/** Max seller-page bait checks per scan (rate ceiling). */
const MAX_BAIT_CHECKS_PER_SCAN = 2;

export async function createAndRunTorobOpsScan(input: {
  userId: string;
  labelIds: string[];
  notes?: string;
  runBaitChecks?: boolean;
}): Promise<{
  runId: string;
  productsTotal: number;
  findingsTotal: number;
  status: string;
}> {
  const { data: run, error: runErr } = await torobOpsAdmin()
    .from("torob_ops_scan_runs")
    .insert({
      status: "queued",
      label_ids: input.labelIds,
      created_by: input.userId,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (runErr || !run) throw new Error(runErr?.message ?? "ایجاد دستور اسکن ناموفق بود.");

  const runId = String(run.id);

  await torobOpsAdmin()
    .from("torob_ops_scan_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);

  await writeTorobOpsAudit({
    actorId: input.userId,
    action: "torob_ops_scan_create",
    entityId: runId,
    diff: { label_ids: input.labelIds },
  });

  try {
    const products = await loadCandidateProducts(input.labelIds);
    const productIds = products.map((p) => p.id);
    const [ourPrices, observatory, ownShops, snapshots] = await Promise.all([
      loadOurPrices(productIds),
      loadObservatoryByProductIds(productIds),
      loadOwnShops(),
      loadLatestSnapshots(productIds),
    ]);

    let baitChecksUsed = 0;
    const findings: Array<Record<string, unknown>> = [];
    const skipReasons: Array<Record<string, unknown>> = [];

    for (const product of products) {
      const ourPrice = ourPrices.get(product.id);
      const snap = cheapestNonOwnSnapshot(snapshots.get(product.id));
      const obs = observatory.get(product.id);
      const theirMin = snap ? toNumber(snap.price_toman) : toNumber(obs?.torob_min_price_toman);
      const priceSource = snap ? "extracted" : "observatory";

      if (ourPrice == null || !Number.isFinite(ourPrice) || ourPrice <= 0) {
        skipReasons.push({ product_id: product.id, reason: "no_our_price" });
        continue;
      }
      if (theirMin == null || theirMin <= 0) {
        skipReasons.push({ product_id: product.id, reason: "no_market_price" });
        continue;
      }
      if (theirMin >= ourPrice) {
        skipReasons.push({ product_id: product.id, reason: "not_cheaper", their: theirMin, our: ourPrice });
        continue;
      }

      // Observatory gives aggregate min — no per-seller identity yet.
      let bait = {
        signals: [] as string[],
        strong: false,
        sellerDomain: null as string | null,
        httpStatus: null as number | null,
        phones: [] as string[],
        enriched: false,
        snippet: undefined as string | undefined,
      };

      const offerUrl = product.torob_url;
      if (input.runBaitChecks !== false && baitChecksUsed < MAX_BAIT_CHECKS_PER_SCAN && offerUrl) {
        // Read-only product page + optional seller deep-link enrichment (Path A).
        const result = await checkSellerPageForBait(offerUrl);
        baitChecksUsed += 1;
        bait = result;
        // Small jitter between checks (1.5–3.5s)
        await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 2000)));
      }

      if (isOwnShop(ownShops, snap?.seller_name ?? null, bait.sellerDomain ?? snap?.seller_shop_url ?? null)) {
        skipReasons.push({ product_id: product.id, reason: "own_shop", seller: snap?.seller_name });
        continue;
      }

      const status = classifyPathB({
        ourPrice,
        theirPrice: theirMin,
        baitStrong: bait.strong,
        baitFetchFailed: bait.signals.includes("fetch_failed") || bait.signals.length === 0,
      });

      // Ambiguous undercut without strong bait → manual_review (aggregate observatory min).
      const finalStatus: FindingStatus =
        status === "cheaper_competitor" && !bait.strong ? "manual_review" : status;

      findings.push({
        scan_run_id: runId,
        product_id: product.id,
        product_name_snapshot: product.name,
        torob_url: product.torob_url,
        seller_name: snap?.seller_name ?? null,
        seller_domain: bait.sellerDomain,
        seller_offer_url: snap?.seller_shop_url ?? product.torob_url,
        our_price_toman: ourPrice,
        their_price_toman: theirMin,
        price_source: priceSource,
        status: finalStatus,
        evidence: {
          torob_avg_price_toman: toNumber(obs?.torob_avg_price_toman),
          torob_seller_count: toNumber(obs?.torob_seller_count),
          bait_signals: bait.signals,
          bait_http_status: bait.httpStatus,
          phones: bait.phones,
          seller_enriched: bait.enriched,
          seller_snippet: bait.snippet ?? null,
          note: bait.enriched
            ? "فاز ۲: غنی‌سازی فقط‌خواندنی صفحهٔ فروشنده/کالا؛ قیمت min از رصدخانه."
            : "فاز ۲: غنی‌سازی انجام نشد یا شکست خورد؛ قیمت min از رصدخانه.",
        },
      });
    }

    if (findings.length > 0) {
      const { error: insErr } = await torobOpsAdmin().from("torob_ops_findings").insert(findings);
      if (insErr) throw new Error(insErr.message);
    }

    await torobOpsAdmin()
      .from("torob_ops_scan_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        products_total: products.length,
        findings_total: findings.length,
        skip_reasons: skipReasons,
      })
      .eq("id", runId);

    return {
      runId,
      productsTotal: products.length,
      findingsTotal: findings.length,
      status: "completed",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await torobOpsAdmin()
      .from("torob_ops_scan_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", runId);
    throw err;
  }
}

export async function cancelTorobOpsScan(input: { userId: string; runId: string }): Promise<void> {
  const { error } = await torobOpsAdmin()
    .from("torob_ops_scan_runs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);

  await writeTorobOpsAudit({
    actorId: input.userId,
    action: "torob_ops_scan_cancel",
    entityId: input.runId,
  });
}

export async function updateFindingStatus(input: {
  userId: string;
  findingId: string;
  status: FindingStatus;
  reviewNote?: string;
}): Promise<void> {
  const allowed: FindingStatus[] = [
    "confirmed_bait",
    "legitimate_competitor",
    "manual_review",
    "suspected_bait",
    "cheaper_competitor",
    "cancelled",
  ];
  if (!allowed.includes(input.status)) {
    throw new Error("وضعیت نامعتبر است.");
  }

  const { error } = await torobOpsAdmin()
    .from("torob_ops_findings")
    .update({
      status: input.status,
      reviewed_by: input.userId,
      reviewed_at: new Date().toISOString(),
      review_note: input.reviewNote ?? null,
    })
    .eq("id", input.findingId);

  if (error) throw new Error(error.message);

  await writeTorobOpsAudit({
    actorId: input.userId,
    action: "torob_ops_finding_review",
    entityId: input.findingId,
    diff: { status: input.status },
  });
}

export async function logManualTorobReport(input: {
  userId: string;
  findingId: string;
  reportText?: string;
  result: "submitted" | "failed" | "skipped";
  notes?: string;
}): Promise<void> {
  const { data: finding, error: findErr } = await torobOpsAdmin()
    .from("torob_ops_findings")
    .select("id, status")
    .eq("id", input.findingId)
    .maybeSingle();

  if (findErr || !finding) throw new Error("یافته یافت نشد.");
  if (finding.status !== "confirmed_bait" && finding.status !== "reported") {
    throw new Error("فقط برای طعمه تأییدشده می‌توان گزارش ثبت کرد.");
  }

  const { error } = await torobOpsAdmin()
    .from("torob_ops_report_logs")
    .insert({
      finding_id: input.findingId,
      reported_by: input.userId,
      report_text: input.reportText ?? null,
      result: input.result,
      notes: input.notes ?? null,
    });
  if (error) throw new Error(error.message);

  if (input.result === "submitted") {
    await torobOpsAdmin()
      .from("torob_ops_findings")
      .update({ status: "reported" })
      .eq("id", input.findingId);
  }

  await writeTorobOpsAudit({
    actorId: input.userId,
    action: "torob_ops_report_log",
    entityId: input.findingId,
    diff: { result: input.result },
  });
}
