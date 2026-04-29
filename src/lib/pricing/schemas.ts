import { z } from "zod";

export const currencyRateSchema = z.object({
  currency: z.enum(["usd", "aed"]),
  rate_to_toman: z.coerce.number().positive("نرخ باید عددی مثبت باشد"),
  source_name: z.string().trim().max(120).optional().or(z.literal("")),
  effective_at: z.string().optional(),
  is_active: z.boolean().default(true),
});
export type CurrencyRateFormValues = z.infer<typeof currencyRateSchema>;

export const changeReasonSchema = z.object({
  title: z.string().trim().min(1, "عنوان الزامی است").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});
export type ChangeReasonFormValues = z.infer<typeof changeReasonSchema>;

export const purchasePriceSchema = z.object({
  product_id: z.string().uuid("محصول الزامی است"),
  supplier_id: z.string().uuid().nullable().optional(),
  purchase_price: z.coerce.number().nonnegative("قیمت نمی‌تواند منفی باشد"),
  currency: z.enum(["toman", "usd", "aed"]),
  reason_id: z.string().uuid().nullable().optional(),
  private_note: z.string().trim().max(1000).optional().or(z.literal("")),
  effective_at: z.string().optional(),
});
export type PurchasePriceFormValues = z.infer<typeof purchasePriceSchema>;

export const pricingRuleSchema = z
  .object({
    rule_name: z.string().trim().min(1, "نام قانون الزامی است").max(160),
    product_type: z.enum(["iranian", "foreign"]).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    brand_id: z.string().uuid().nullable().optional(),
    min_purchase_price_toman: z.coerce.number().nonnegative().nullable().optional(),
    max_purchase_price_toman: z.coerce.number().nonnegative().nullable().optional(),
    settlement_type_id: z.string().uuid().nullable().optional(),
    sale_price_type_id: z.string().uuid().nullable().optional(),
    margin_type: z.enum(["fixed", "percent", "mixed"]),
    margin_value: z.coerce.number().nonnegative("مقدار حاشیه نمی‌تواند منفی باشد"),
    fixed_margin_value: z.coerce.number().nonnegative().nullable().optional(),
    shipping_cost_rule_id: z.string().uuid().nullable().optional(),
    priority: z.coerce.number().int().min(1).default(100),
    is_active: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.min_purchase_price_toman == null ||
      v.max_purchase_price_toman == null ||
      Number(v.max_purchase_price_toman) >= Number(v.min_purchase_price_toman),
    { message: "بازه قیمت نامعتبر است", path: ["max_purchase_price_toman"] }
  );
export type PricingRuleFormValues = z.infer<typeof pricingRuleSchema>;

export const salePriceTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .max(50)
    .regex(/^[A-Za-z0-9_-]*$/, "کد فقط شامل حروف انگلیسی، عدد، _ و - باشد")
    .optional()
    .or(z.literal("")),
  title: z.string().trim().min(1, "عنوان الزامی است").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).default(100),
  is_active: z.boolean().default(true),
});
export type SalePriceTypeFormValues = z.infer<typeof salePriceTypeSchema>;

export const shippingRuleSchema = z
  .object({
    title: z.string().trim().min(1, "عنوان الزامی است").max(160),
    cost_type: z.enum(["fixed", "percent"]),
    cost_value: z.coerce.number().nonnegative("مقدار نمی‌تواند منفی باشد"),
    product_type: z.enum(["iranian", "foreign"]).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    min_purchase_price: z.coerce.number().nonnegative().nullable().optional(),
    max_purchase_price: z.coerce.number().nonnegative().nullable().optional(),
    priority: z.coerce.number().int().min(1).default(100),
    is_active: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.min_purchase_price == null ||
      v.max_purchase_price == null ||
      Number(v.max_purchase_price) >= Number(v.min_purchase_price),
    { message: "بازه قیمت نامعتبر است", path: ["max_purchase_price"] }
  );
export type ShippingRuleFormValues = z.infer<typeof shippingRuleSchema>;