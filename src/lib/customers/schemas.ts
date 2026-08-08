/**
 * Phase 2 — Customers ↔ Persons (S18B)
 *
 * Zod schemas + DTOs for the customer serverFn layer. Validation mirrors the
 * existing rules in `src/shared/components/CustomerForm.tsx` so that S19 can
 * swap the UI's direct Supabase writes to these serverFns without changing
 * UX or accepting any input the form would have rejected.
 */

import { z } from "zod";

const phoneRegex = /^09\d{9}$/;
const accountingCodeRegex = /^[A-Za-z0-9_-]{1,30}$/;

/* ---------- shared field schemas (kept in sync with CustomerForm) ---------- */

const nameSchema = z
  .string()
  .trim()
  .min(2, "نام باید حداقل ۲ کاراکتر باشد")
  .max(100, "نام حداکثر ۱۰۰ کاراکتر");

const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .optional()
  .nullable()
  .refine((v) => !v || phoneRegex.test(v), "شماره موبایل نامعتبر است (۰۹xxxxxxxxx)");

const emailSchema = z
  .string()
  .trim()
  .max(255)
  .optional()
  .nullable()
  .refine((v) => !v || z.string().email().safeParse(v).success, "ایمیل نامعتبر است");

const citySchema = z.string().trim().max(80).optional().nullable();
const addressSchema = z.string().trim().max(500).optional().nullable();
const taxIdSchema = z
  .string()
  .trim()
  .max(20)
  .optional()
  .nullable()
  .refine((v) => !v || /^[0-9]{1,20}$/.test(v), "شناسه مالیاتی فقط شامل ارقام است");

const notesSchema = z.string().trim().max(500, "حداکثر ۵۰۰ کاراکتر").optional().nullable();

const accountingCodeSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine(
    (v) => !v || accountingCodeRegex.test(v),
    "کد حسابداری فقط شامل حروف انگلیسی، اعداد، _ و - و حداکثر ۳۰ کاراکتر",
  );

const linkGroupSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "لینک نامعتبر است (باید با http یا https شروع شود)");

const birthDateSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((v) => {
    if (!v) return true;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return false;
    return d <= new Date();
  }, "تاریخ تولد نمی‌تواند در آینده باشد");

const responsibleIdSchema = z
  .string()
  .uuid({ message: "شناسه مسئول نامعتبر است" })
  .nullable()
  .optional();

const customerIdSchema = z.string().uuid({ message: "شناسه مشتری نامعتبر است" });
const personIdSchema = z.string().uuid({ message: "شناسه شخص نامعتبر است" });
const noteSchema = z.string().trim().max(500).optional().nullable();

/* ---------- create ---------- */

/**
 * S18B intentionally does NOT accept `person_id` on create.
 *
 * Reason: `customers` INSERT and `customer_set_person` RPC are two separate
 * PostgREST round-trips. A failure between them would leave the customer row
 * with `person_id = NULL`, and we cannot DELETE the partial row (forbidden by
 * scope rules). Linking must therefore go through a follow-up
 * `linkCustomerToPerson` call. A future RPC `customer_create_and_link` could
 * unify both writes atomically; deferred until explicitly requested.
 */
export const CreateCustomerInputSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  city: citySchema,
  address: addressSchema,
  tax_id: taxIdSchema,
  notes: notesSchema,
  responsible_id: responsibleIdSchema,
  accounting_code: accountingCodeSchema,
  link_group: linkGroupSchema,
  birth_date: birthDateSchema,
  is_active: z.boolean().optional(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;

/* ---------- update ---------- */

export const UpdateCustomerInputSchema = z.object({
  id: customerIdSchema,
  patch: z
    .object({
      name: nameSchema.optional(),
      phone: phoneSchema,
      email: emailSchema,
      city: citySchema,
      address: addressSchema,
      tax_id: taxIdSchema,
      notes: notesSchema,
      responsible_id: responsibleIdSchema,
      accounting_code: accountingCodeSchema,
      link_group: linkGroupSchema,
      birth_date: birthDateSchema,
      is_active: z.boolean().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, "هیچ تغییری ارسال نشده است"),
});
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerInputSchema>;

/* ---------- link ---------- */

export const LinkCustomerToPersonInputSchema = z.object({
  customer_id: customerIdSchema,
  person_id: personIdSchema,
  note: noteSchema,
});
export type LinkCustomerToPersonInput = z.infer<typeof LinkCustomerToPersonInputSchema>;

/* ---------- DTO ---------- */

export interface CustomerDTO {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  responsible_id: string | null;
  accounting_code: string | null;
  link_group: string | null;
  birth_date: string | null;
  is_active: boolean;
  person_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkCustomerToPersonResult {
  link_id: string;
}
