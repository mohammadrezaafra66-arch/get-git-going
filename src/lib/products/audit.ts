import { supabase } from "@/integrations/supabase/client";
import {
  PRODUCT_TYPE_LABELS,
  BASE_CURRENCY_LABELS,
  STOCK_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
} from "@/lib/products/constants";

export interface ProductFieldChange {
  label: string;
  from: string | null;
  to: string | null;
}

export interface ProductAuditDiff {
  changes?: Record<string, ProductFieldChange>;
  labels?: { added: { id: string; title: string }[]; removed: { id: string; title: string }[] };
  attributes?: Record<string, { label: string; from: string | null; to: string | null }>;
}

export const FIELD_LABELS: Record<string, string> = {
  name: "نام محصول",
  brand_id: "برند",
  category_id: "دسته",
  product_type: "نوع محصول",
  base_currency: "ارز مبنا",
  stock_status: "وضعیت موجودی",
  status: "وضعیت محصول",
  unit: "واحد",
  color: "رنگ",
  capacity: "ظرفیت",
  model: "مدل",
  primary_spec: "مشخصه اصلی",
  description: "توضیحات",
  technical_notes: "یادداشت فنی",
};

function fmt(field: string, val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val);
  if (field === "product_type") return (PRODUCT_TYPE_LABELS as any)[s] ?? s;
  if (field === "base_currency") return (BASE_CURRENCY_LABELS as any)[s] ?? s.toUpperCase();
  if (field === "stock_status") return (STOCK_STATUS_LABELS as any)[s] ?? s;
  if (field === "status") return (PRODUCT_STATUS_LABELS as any)[s] ?? s;
  return s;
}

export function diffProductFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  brandMap?: Record<string, string>,
  categoryMap?: Record<string, string>,
): Record<string, ProductFieldChange> {
  const changes: Record<string, ProductFieldChange> = {};
  for (const key of Object.keys(FIELD_LABELS)) {
    const a = prev[key] ?? null;
    const b = next[key] ?? null;
    const aN = a === "" ? null : a;
    const bN = b === "" ? null : b;
    if (aN === bN) continue;
    let fromStr = fmt(key, aN);
    let toStr = fmt(key, bN);
    if (key === "brand_id" && brandMap) {
      fromStr = aN ? (brandMap[String(aN)] ?? fromStr) : null;
      toStr = bN ? (brandMap[String(bN)] ?? toStr) : null;
    }
    if (key === "category_id" && categoryMap) {
      fromStr = aN ? (categoryMap[String(aN)] ?? fromStr) : null;
      toStr = bN ? (categoryMap[String(bN)] ?? toStr) : null;
    }
    changes[key] = { label: FIELD_LABELS[key], from: fromStr, to: toStr };
  }
  return changes;
}

export function diffLabels(prevIds: string[], nextIds: string[], titleMap: Record<string, string>) {
  const prev = new Set(prevIds);
  const next = new Set(nextIds);
  const added = [...next]
    .filter((x) => !prev.has(x))
    .map((id) => ({ id, title: titleMap[id] ?? id }));
  const removed = [...prev]
    .filter((x) => !next.has(x))
    .map((id) => ({ id, title: titleMap[id] ?? id }));
  return { added, removed };
}

export function diffDynamicValues(
  prev: Record<string, string>,
  next: Record<string, string>,
  defs: { id: string; label_fa: string }[],
): Record<string, { label: string; from: string | null; to: string | null }> {
  const out: Record<string, { label: string; from: string | null; to: string | null }> = {};
  const labelById = new Map(defs.map((d) => [d.id, d.label_fa]));
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const a = (prev[k] ?? "").trim();
    const b = (next[k] ?? "").trim();
    if (a === b) continue;
    out[k] = { label: labelById.get(k) ?? k, from: a || null, to: b || null };
  }
  return out;
}

export function isDiffEmpty(d: ProductAuditDiff): boolean {
  const c = Object.keys(d.changes ?? {}).length;
  const la = (d.labels?.added.length ?? 0) + (d.labels?.removed.length ?? 0);
  const a = Object.keys(d.attributes ?? {}).length;
  return c + la + a === 0;
}

export async function logProductUpdate(productId: string, actorId: string, diff: ProductAuditDiff) {
  if (isDiffEmpty(diff)) return;
  const { error } = await supabase.from("audit_logs").insert({
    action: "product_update",
    entity_type: "product",
    entity_id: productId,
    actor_id: actorId,
    diff: diff as never,
  });
  if (error) console.warn("[audit] failed to log product update", error);
}
