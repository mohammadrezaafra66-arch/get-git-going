import { z } from "zod";

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "نام محصول الزامی است")
    .max(200, "نام نباید بیش از ۲۰۰ کاراکتر باشد"),
  // SKU توسط دیتابیس به‌صورت خودکار تولید می‌شود؛ در فرم وارد نمی‌شود
  brand_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  product_type: z.enum(["iranian", "foreign"]),
  base_currency: z.string().trim().min(1, "ارز مبنا الزامی است").max(20),
  stock_status: z.enum(["available", "unavailable", "limited", "unknown"]),
  status: z.enum(["active", "inactive", "discontinued"]),
  unit: z.string().trim().max(40).optional().or(z.literal("")),
  color: z.string().trim().max(120).optional().or(z.literal("")),
  capacity: z.string().trim().max(120).optional().or(z.literal("")),
  model: z.string().trim().max(120).optional().or(z.literal("")),
  primary_spec: z.string().trim().max(100, "حداکثر ۱۰۰ کاراکتر").optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  technical_notes: z.string().trim().max(4000).optional().or(z.literal("")),
  barcode: z.string().trim().max(64, "حداکثر ۶۴ کاراکتر").optional().or(z.literal("")),
  // کد کالای آسان — اختیاری. یکتایی و نرمال‌سازی در دیتابیس اعمال می‌شود
  // (ایندکس یکتای جزئی مهاجرت ۲۸۳ و تریگر مهاجرت ۲۸۹)، نه فقط اینجا.
  accounting_code: z
    .string()
    .trim()
    .max(32, "حداکثر ۳۲ کاراکتر")
    .refine((v) => v === "" || !/\s/.test(v), "کد آسان نباید فاصله داشته باشد")
    .optional()
    .or(z.literal("")),
  // لینک صفحهٔ محصول در ترب — اختیاری (مهاجرت ۳۰۱).
  torob_url: z
    .string()
    .trim()
    .max(500, "حداکثر ۵۰۰ کاراکتر")
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "لینک باید با http:// یا https:// شروع شود")
    .optional()
    .or(z.literal("")),
  // Item 166 — standalone promotion weight. 1 = neutral; mirrors
  // products_promotion_weight_chk (migration 207).
  promotion_weight: z.coerce
    .number()
    .min(0, "وزن تبلیغ نمی‌تواند منفی باشد")
    .max(100, "حداکثر وزن تبلیغ ۱۰۰ است")
    .default(1),
  label_ids: z.array(z.string().uuid()).default([]),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export const brandSchema = z.object({
  name: z.string().trim().min(1, "نام برند الزامی است").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "اسلاگ الزامی است")
    .max(120)
    .regex(/^[a-z0-9-]+$/i, "فقط حروف انگلیسی، عدد و خط تیره"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});
export type BrandFormValues = z.infer<typeof brandSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "نام دسته الزامی است").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "اسلاگ الزامی است")
    .max(120)
    .regex(/^[a-z0-9-]+$/i, "فقط حروف انگلیسی، عدد و خط تیره"),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});
export type CategoryFormValues = z.infer<typeof categorySchema>;

export const labelSchema = z.object({
  title: z.string().trim().min(1, "عنوان برچسب الزامی است").max(80),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "کد رنگ باید مانند #RRGGBB باشد"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
  weight: z.number().int().min(0, "حداقل ۰").max(100, "حداکثر ۱۰۰").default(0),
  visibility: z.enum(["public", "internal"]).default("public"),
});
export type LabelFormValues = z.infer<typeof labelSchema>;
