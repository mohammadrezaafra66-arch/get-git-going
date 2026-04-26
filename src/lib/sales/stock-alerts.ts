import { supabase } from "@/integrations/supabase/client";

export type StockAlertStatus = "open" | "contacted" | "closed" | "canceled";
export type StockAlertPriority = "low" | "normal" | "high";

export const STOCK_ALERT_STATUS_LABEL: Record<StockAlertStatus, string> = {
  open: "باز",
  contacted: "تماس گرفته شد",
  closed: "بسته شد",
  canceled: "لغو شد",
};

export const STOCK_ALERT_PRIORITY_LABEL: Record<StockAlertPriority, string> = {
  low: "کم",
  normal: "عادی",
  high: "بالا",
};

export const STOCK_ALERT_TRIGGER_STATUSES = new Set(["unavailable", "limited", "unknown"]);

/** نرمال‌سازی شماره تماس برای مقایسه و ذخیره. */
export function normalizeStockAlertPhone(raw: string): string {
  return raw.replace(/[\s\-]/g, "").trim();
}

const PHONE_REGEX = /^[+\d][\d+\-\s]{3,39}$/;

export interface StockAlertCreateInput {
  product_id: string;
  customer_name: string;
  customer_phone: string;
  priority: StockAlertPriority;
  note?: string | null;
}

export function validateStockAlertInput(input: StockAlertCreateInput): string | null {
  if (!input.product_id) return "محصول الزامی است.";
  const name = input.customer_name.trim();
  if (name.length < 2) return "نام مشتری باید حداقل ۲ کاراکتر باشد.";
  if (name.length > 200) return "نام مشتری حداکثر ۲۰۰ کاراکتر است.";
  const phone = input.customer_phone.trim();
  if (!PHONE_REGEX.test(phone)) return "شماره تماس معتبر نیست. فقط عدد، +، فاصله یا خط تیره مجاز است.";
  if (!["low", "normal", "high"].includes(input.priority)) return "اولویت نامعتبر است.";
  if (input.note && input.note.length > 500) return "توضیحات حداکثر ۵۰۰ کاراکتر است.";
  return null;
}

/** بررسی وجود درخواست باز برای همان محصول و شماره تماس. */
export async function findOpenStockAlert(productId: string, phone: string) {
  const normalized = normalizeStockAlertPhone(phone);
  const { data, error } = await supabase
    .from("stock_alert_requests")
    .select("id, customer_name, requested_at")
    .eq("product_id", productId)
    .eq("customer_phone", normalized)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createStockAlertRequest(input: StockAlertCreateInput, salespersonId: string) {
  const phone = normalizeStockAlertPhone(input.customer_phone);
  const payload = {
    product_id: input.product_id,
    customer_name: input.customer_name.trim(),
    customer_phone: phone,
    priority: input.priority,
    note: input.note?.trim() ? input.note.trim() : null,
    salesperson_id: salespersonId,
    status: "open" as const,
  };
  const { data, error } = await supabase
    .from("stock_alert_requests")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateStockAlertStatus(id: string, status: StockAlertStatus) {
  const { error } = await supabase
    .from("stock_alert_requests")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}