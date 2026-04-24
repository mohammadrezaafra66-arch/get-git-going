import { z } from "zod";

export const productSchema = z.object({
  name: z.string().trim().min(1, "نام محصول الزامی است").max(200, "نام نباید بیش از ۲۰۰ کاراکتر باشد"),
  sku: z.string().trim().max(80, "SKU طولانی است").optional().or(z.literal("")),
  brand_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  product_type: z.enum(["iranian", "foreign"]),
  base_currency: z.enum(["toman", "usd", "aed"]),
  stock_status: z.enum(["available", "unavailable", "limited", "unknown"]),
  status: z.enum(["active", "inactive", "discontinued"]),
  unit: z.string().trim().max(40).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  technical_notes: z.string().trim().max(4000).optional().or(z.literal("")),
  label_ids: z.array(z.string().uuid()).default([]),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export const brandSchema = z.object({
  name: z.string().trim().min(1, "نام برند الزامی است").max(120),
  slug: z.string().trim().min(1, "اسلاگ الزامی است").max(120).regex(/^[a-z0-9-]+$/i, "فقط حروف انگلیسی، عدد و خط تیره"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});
export type BrandFormValues = z.infer<typeof brandSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "نام دسته الزامی است").max(120),
  slug: z.string().trim().min(1, "اسلاگ الزامی است").max(120).regex(/^[a-z0-9-]+$/i, "فقط حروف انگلیسی، عدد و خط تیره"),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});
export type CategoryFormValues = z.infer<typeof categorySchema>;

export const labelSchema = z.object({
  title: z.string().trim().min(1, "عنوان برچسب الزامی است").max(80),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "کد رنگ باید مانند #RRGGBB باشد"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});
export type LabelFormValues = z.infer<typeof labelSchema>;