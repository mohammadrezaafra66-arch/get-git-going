import type { AiCapability } from "./types";

export const AI_USAGE_DEFINITIONS = [
  {
    key: "purchase_advisor.chat",
    label: "دستیار هوشمند خرید",
    capability: "chat",
    description:
      "تولید پیشنهاد خرید بر اساس محصول، قیمت‌های خرید اخیر، نرخ ارز، فوریت و یادداشت مدیر.",
  },
  {
    key: "knowledge_ask.chat",
    label: "دانش سازمانی - پاسخ‌دهی",
    capability: "chat",
    description: "ساخت پاسخ نهایی به سؤال کارکنان فقط بر اساس متن اسناد بازیابی‌شده.",
  },
  {
    key: "knowledge_ask.embeddings",
    label: "دانش سازمانی - جستجوی معنایی سؤال",
    capability: "embeddings",
    description: "تبدیل سؤال کاربر به بردار معنایی برای پیدا کردن سندهای مرتبط.",
  },
  {
    key: "knowledge_index.embeddings",
    label: "دانش سازمانی - نمایه‌سازی اسناد",
    capability: "embeddings",
    description: "تبدیل متن اسناد منتشرشده به بردار معنایی هنگام reindex.",
  },
  {
    key: "messenger_chat.chat",
    label: "پیام‌رسان - چت با دستیار",
    capability: "chat",
    description: "پاسخ دستیار هوشمند داخل پنجره گفت‌وگوی پیام‌رسان.",
  },
  {
    key: "messenger_semantic_search.embeddings",
    label: "پیام‌رسان - جستجوی معنایی",
    capability: "embeddings",
    description: "جستجوی معنایی داخل پیام‌های یک گروه و ساخت embedding برای پیام‌ها.",
  },
  {
    key: "product_ad_copy.chat",
    label: "محصول - متن تبلیغاتی",
    capability: "chat",
    description: "تولید تیتر، متن و دعوت به اقدام تبلیغاتی برای صفحه محصول.",
  },
  {
    key: "receipt_ocr.vision",
    label: "حسابداری - OCR تصویر فیش",
    capability: "vision",
    description: "خواندن تصویر فیش واریزی و پیشنهاد مقدارهای قابل پر شدن در فرم حسابداری.",
  },
] as const;

export type AiUsageKey = (typeof AI_USAGE_DEFINITIONS)[number]["key"];

export interface AiUsageDefinition {
  key: AiUsageKey;
  label: string;
  capability: AiCapability;
  description: string;
}

export const AI_USAGE_KEYS = AI_USAGE_DEFINITIONS.map((u) => u.key) as [
  AiUsageKey,
  ...AiUsageKey[],
];

export const AI_USAGE_BY_KEY = new Map<AiUsageKey, AiUsageDefinition>(
  AI_USAGE_DEFINITIONS.map((u) => [u.key, u]),
);
