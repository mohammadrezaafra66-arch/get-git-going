import { supabase } from "@/integrations/supabase/client";

export const SHOP_SETTING_KEYS = [
  "shop_name",
  "shop_address",
  "shop_phone",
  "shop_website",
  "shop_rubika",
  "shop_whatsapp",
  "shop_eitaa",
  "shop_baleh",
  "default_seller_info",
  "alert_threshold_percent",
  "birthday_message_template",
  "holding_tier1_days",
  "holding_tier2_days",
  "holding_tier3_days",
  "holding_tier1_margin_add",
  "holding_tier2_margin_add",
  "holding_tier3_margin_add",
  "holding_tier4_margin_add",
] as const;

export type ShopSettingKey = (typeof SHOP_SETTING_KEYS)[number];
export type ShopSettingsMap = Record<ShopSettingKey, string>;

export const SHOP_SETTING_LABELS: Record<ShopSettingKey, string> = {
  shop_name: "نام فروشگاه",
  shop_address: "آدرس فروشگاه",
  shop_phone: "شماره تماس ثابت",
  shop_website: "وب‌سایت",
  shop_rubika: "لینک روبیکا",
  shop_whatsapp: "لینک واتساپ",
  shop_eitaa: "لینک ایتا",
  shop_baleh: "لینک بله",
  default_seller_info: "اطلاعات پیش‌فرض فروشنده",
  alert_threshold_percent: "آستانه هشدار تغییر نرخ ارز (٪)",
  birthday_message_template: "متن پیام تولد",
  holding_tier1_days: "مدت نگهداری — سطح ۱ (روز، بدون افزایش)",
  holding_tier2_days: "مدت نگهداری — سطح ۲ (روز)",
  holding_tier3_days: "مدت نگهداری — سطح ۳ (روز)",
  holding_tier1_margin_add: "افزایش سود سطح ۱ (واحد درصد)",
  holding_tier2_margin_add: "افزایش سود سطح ۲ (واحد درصد)",
  holding_tier3_margin_add: "افزایش سود سطح ۳ (واحد درصد)",
  holding_tier4_margin_add: "افزایش سود سطح ۴ — بیش از سطح ۳ (واحد درصد)",
};

export function emptyShopSettings(): ShopSettingsMap {
  return SHOP_SETTING_KEYS.reduce((acc, k) => {
    acc[k] = "";
    return acc;
  }, {} as ShopSettingsMap);
}

export async function fetchShopSettings(): Promise<ShopSettingsMap> {
  const { data, error } = await supabase.from("shop_settings").select("key, value");
  if (error) throw error;
  const map = emptyShopSettings();
  for (const row of data ?? []) {
    const k = (row as any).key as string;
    if ((SHOP_SETTING_KEYS as readonly string[]).includes(k)) {
      map[k as ShopSettingKey] = (row as any).value ?? "";
    }
  }
  return map;
}
