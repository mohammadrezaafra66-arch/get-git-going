import { supabase } from "@/integrations/supabase/client";

export type PriceAlertOperator =
  | "below_price"
  | "above_price"
  | "increase_percent"
  | "decrease_percent"
  | "stock_status_changed"
  | "below_usd_price"
  | "above_usd_price";

export type PriceAlertCurrency = "toman" | "usd";

export interface PriceAlertRule {
  id: string;
  user_id: string;
  product_id: string;
  sale_price_type_id: string | null;
  operator: PriceAlertOperator;
  target_value: number | null;
  target_currency: PriceAlertCurrency;
  is_active: boolean;
  is_repeatable: boolean;
  last_triggered_at: string | null;
  triggered_count: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  product?: { id: string; name: string; sku: string | null } | null;
  sale_price_type?: { id: string; title: string } | null;
}

export interface PriceAlertNotification {
  id: string;
  user_id: string;
  alert_rule_id: string;
  product_id: string;
  sale_price_type_id: string | null;
  title: string;
  message: string;
  current_price: number | null;
  previous_price: number | null;
  change_percent: number | null;
  is_read: boolean;
  created_at: string;
}

export const OPERATOR_LABELS: Record<PriceAlertOperator, string> = {
  below_price: "کمتر از قیمت مشخص (تومان)",
  above_price: "بیشتر از قیمت مشخص (تومان)",
  increase_percent: "افزایش درصدی نسبت به قیمت قبلی",
  decrease_percent: "کاهش درصدی نسبت به قیمت قبلی",
  below_usd_price: "کمتر از قیمت دلاری مشخص",
  above_usd_price: "بیشتر از قیمت دلاری مشخص",
  stock_status_changed: "تغییر وضعیت موجودی",
};

export const OPERATOR_HINTS: Record<PriceAlertOperator, string> = {
  below_price: "مثلاً اگر قیمت کمتر از ۳۰,۰۰۰,۰۰۰ تومان شد.",
  above_price: "مثلاً اگر قیمت بیشتر از ۴۰,۰۰۰,۰۰۰ تومان شد.",
  increase_percent: "مثلاً اگر قیمت بیش از ۱۰٪ افزایش یافت.",
  decrease_percent: "مثلاً اگر قیمت بیش از ۵٪ کاهش یافت.",
  below_usd_price: "مثلاً اگر قیمت دلاری کمتر از ۵۰۰ دلار شد.",
  above_usd_price: "مثلاً اگر قیمت دلاری بیشتر از ۷۰۰ دلار شد.",
  stock_status_changed: "هنگام تغییر وضعیت موجودی فعال می‌شود (به‌زودی).",
};

const PERCENT_OPS = new Set<PriceAlertOperator>(["increase_percent", "decrease_percent"]);
const USD_OPS = new Set<PriceAlertOperator>(["below_usd_price", "above_usd_price"]);
const TOMAN_PRICE_OPS = new Set<PriceAlertOperator>(["below_price", "above_price"]);

export function isPriceOp(op: PriceAlertOperator) {
  return TOMAN_PRICE_OPS.has(op) || USD_OPS.has(op);
}
export function isPercentOp(op: PriceAlertOperator) { return PERCENT_OPS.has(op); }
export function isUsdOp(op: PriceAlertOperator) { return USD_OPS.has(op); }

export interface CreateAlertInput {
  product_id: string;
  sale_price_type_id: string | null;
  operator: PriceAlertOperator;
  target_value: number | null;
  is_repeatable: boolean;
  note: string | null;
}

function normalizeAlert(input: CreateAlertInput) {
  const target_currency: PriceAlertCurrency = isUsdOp(input.operator) ? "usd" : "toman";
  return { ...input, target_currency };
}

export function validateAlert(input: CreateAlertInput): string | null {
  if (!input.product_id) return "محصول الزامی است.";
  if (!input.operator) return "نوع شرط الزامی است.";
  if (input.operator !== "stock_status_changed") {
    if (input.target_value === null || Number.isNaN(input.target_value) || input.target_value <= 0) {
      return "مقدار شرط باید بزرگ‌تر از صفر باشد.";
    }
    if (isPercentOp(input.operator) && (input.target_value < 0.1 || input.target_value > 100)) {
      return "درصد باید بین ۰٫۱ تا ۱۰۰ باشد.";
    }
  }
  if (input.note && input.note.length > 500) return "یادداشت حداکثر ۵۰۰ کاراکتر است.";
  return null;
}

export async function createAlertRule(input: CreateAlertInput) {
  const err = validateAlert(input);
  if (err) throw new Error(err);
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("ابتدا وارد شوید.");
  const norm = normalizeAlert(input);
  const { data, error } = await supabase
    .from("price_alert_rules")
    .insert({
      user_id: uid,
      product_id: norm.product_id,
      sale_price_type_id: norm.sale_price_type_id,
      operator: norm.operator,
      target_value: norm.target_value,
      target_currency: norm.target_currency,
      is_repeatable: norm.is_repeatable,
      note: norm.note,
    })
    .select("id")
    .single();
  if (error) {
    if ((error as any).code === "23505") {
      throw new Error("هشدار مشابه فعال برای این محصول/نوع قیمت/شرط قبلاً ساخته شده است.");
    }
    throw error;
  }
  await supabase.from("audit_logs").insert([{
    actor_id: uid,
    entity_type: "price_alert_rule",
    entity_id: data.id,
    action: "price_alert_created",
    diff: norm as unknown as Record<string, unknown>,
  }]);
  return data.id as string;
}

export async function updateAlertRule(id: string, input: CreateAlertInput) {
  const err = validateAlert(input);
  if (err) throw new Error(err);
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("ابتدا وارد شوید.");
  const norm = normalizeAlert(input);
  const { error } = await supabase
    .from("price_alert_rules")
    .update({
      product_id: norm.product_id,
      sale_price_type_id: norm.sale_price_type_id,
      operator: norm.operator,
      target_value: norm.target_value,
      target_currency: norm.target_currency,
      is_repeatable: norm.is_repeatable,
      note: norm.note,
    })
    .eq("id", id);
  if (error) throw error;
  await supabase.from("audit_logs").insert([{
    actor_id: uid,
    entity_type: "price_alert_rule",
    entity_id: id,
    action: "price_alert_updated",
    diff: norm as unknown as Record<string, unknown>,
  }]);
}

export async function toggleAlertRule(id: string, isActive: boolean) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("ابتدا وارد شوید.");
  const { error } = await supabase
    .from("price_alert_rules")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
  await supabase.from("audit_logs").insert([{
    actor_id: uid,
    entity_type: "price_alert_rule",
    entity_id: id,
    action: "price_alert_toggled",
    diff: { is_active: isActive },
  }]);
}

export async function deleteAlertRule(id: string) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("ابتدا وارد شوید.");
  const { error } = await supabase.from("price_alert_rules").delete().eq("id", id);
  if (error) throw error;
  await supabase.from("audit_logs").insert([{
    actor_id: uid,
    entity_type: "price_alert_rule",
    entity_id: id,
    action: "price_alert_deleted",
    diff: {},
  }]);
}

export async function fetchMyAlerts(opts: { page: number; pageSize: number }) {
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;
  const { data, error, count } = await supabase
    .from("price_alert_rules")
    .select(
      "id, user_id, product_id, sale_price_type_id, operator, target_value, target_currency, is_active, is_repeatable, last_triggered_at, triggered_count, note, created_at, updated_at, product:products(id, name, sku), sale_price_type:sale_price_types(id, title)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as PriceAlertRule[], total: count ?? 0 };
}

export async function fetchMyNotifications(opts: { page: number; pageSize: number; unreadOnly?: boolean }) {
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;
  let q = supabase
    .from("price_alert_notifications")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (opts.unreadOnly) q = q.eq("is_read", false);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as PriceAlertNotification[], total: count ?? 0 };
}

export async function markNotificationRead(id: string, isRead = true) {
  const { error } = await supabase
    .from("price_alert_notifications")
    .update({ is_read: isRead })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return;
  const { error } = await supabase
    .from("price_alert_notifications")
    .update({ is_read: true })
    .eq("user_id", uid)
    .eq("is_read", false);
  if (error) throw error;
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("price_alert_notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  if (error) return 0;
  return count ?? 0;
}