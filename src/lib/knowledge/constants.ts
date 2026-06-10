export type KnowledgeCategory =
  | "sales_rules"
  | "purchase_rules"
  | "accounting"
  | "warehouse"
  | "product_training"
  | "circulars"
  | "general";

export type KnowledgeAccessLevel = "all" | "manager_only" | "finance_only" | "admin_only";

export const KNOWLEDGE_CATEGORIES: { value: KnowledgeCategory; label: string }[] = [
  { value: "sales_rules",       label: "قوانین فروش" },
  { value: "purchase_rules",    label: "قوانین خرید" },
  { value: "accounting",        label: "حسابداری" },
  { value: "warehouse",         label: "انبار" },
  { value: "product_training",  label: "آموزش محصول" },
  { value: "circulars",         label: "بخشنامه‌ها" },
  { value: "general",           label: "عمومی" },
];

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> =
  Object.fromEntries(KNOWLEDGE_CATEGORIES.map((c) => [c.value, c.label])) as Record<KnowledgeCategory, string>;

export const KNOWLEDGE_ACCESS_LEVELS: { value: KnowledgeAccessLevel; label: string }[] = [
  { value: "all",          label: "همه کاربران" },
  { value: "manager_only", label: "فقط مدیران" },
  { value: "finance_only", label: "مالی (مدیر/حسابدار)" },
  { value: "admin_only",   label: "فقط مدیر کل" },
];

export const KNOWLEDGE_ACCESS_LABELS: Record<KnowledgeAccessLevel, string> =
  Object.fromEntries(KNOWLEDGE_ACCESS_LEVELS.map((l) => [l.value, l.label])) as Record<KnowledgeAccessLevel, string>;