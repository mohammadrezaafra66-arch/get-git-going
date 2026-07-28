/**
 * SF-1.b — Quote status hardening
 *
 * Zod schema for `updateQuoteStatus` serverFn. Mirrors the existing browser
 * mutation payload shape exactly (`id`, `next`, optional `reason`). Cancel
 * transitions require a reason; non-cancel transitions ignore it and the
 * handler always clears `cancel_reason` for non-cancel — matching the prior
 * browser behavior where canceled wrote both fields and other transitions
 * wrote only `status`.
 */

import { z } from "zod";

export const SALES_QUOTE_STATUS_VALUES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "canceled",
] as const;

export const UpdateQuoteStatusInputSchema = z
  .object({
    id: z.string().uuid({ message: "شناسه پیش‌فاکتور نامعتبر است" }),
    next: z
      .string()
      .refine(
        (v): v is (typeof SALES_QUOTE_STATUS_VALUES)[number] =>
          (SALES_QUOTE_STATUS_VALUES as readonly string[]).includes(v),
        { message: "وضعیت نامعتبر است" },
      ),
    reason: z.string().trim().max(500, "دلیل حداکثر ۵۰۰ کاراکتر").optional(),
  })
  .refine((v) => v.next !== "canceled" || (v.reason && v.reason.length > 0), {
    message: "برای لغو پیش‌فاکتور، دلیل لغو الزامی است",
    path: ["reason"],
  })
  // Item 195 — a rejection must say why, the same way a cancellation does.
  .refine((v) => v.next !== "rejected" || (v.reason && v.reason.length > 0), {
    message: "برای رد پیش‌فاکتور، نوشتن دلیل رد الزامی است",
    path: ["reason"],
  });

export type UpdateQuoteStatusInput = z.infer<typeof UpdateQuoteStatusInputSchema>;

export interface UpdateQuoteStatusResult {
  id: string;
  status: (typeof SALES_QUOTE_STATUS_VALUES)[number];
  cancel_reason: string | null;
}
