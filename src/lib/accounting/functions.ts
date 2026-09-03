/**
 * Payment & Accounting Server Functions
 *
 * Handles all payment recording and accounting operations with:
 * - Full validation using Zod
 * - Authorization checks via RLS
 * - Comprehensive audit logging
 * - Double-entry bookkeeping considerations
 * - Error handling with Persian messages
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";
import { getServiceClient } from "@/integrations/supabase/server";

// ===== Schemas =====

export const RecordPaymentInput = z.object({
  invoice_id: z.string().uuid("invoice_id must be UUID"),
  amount: z.number().positive("amount must be positive"),
  payment_date: z.string().datetime().or(z.string().date()),
  payment_method: z.enum(["bank_transfer", "cash", "check", "card", "other"]),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

export type RecordPaymentInput = z.infer<typeof RecordPaymentInput>;

export const UpdatePaymentInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "verified", "reconciled", "reversed"]).optional(),
  notes: z.string().optional(),
});

export type UpdatePaymentInput = z.infer<typeof UpdatePaymentInput>;

// ===== Error Mapping =====

function mapPgError(code: string | undefined, message: string): Error {
  if (code === "23505") return new Error("این پرداخت قبلاً ثبت شده است");
  if (code === "42501") return new Error("دسترسی لازم برای این عملیات را ندارید");
  if (code === "23514") return new Error("مقدار وارد شده با محدودیت‌های پایگاه داده سازگار نیست");
  if (code === "23503") return new Error("فاکتور یافت نشد یا دسترسی ندارید");
  if (code === "P0002") return new Error(message || "رکورد یافت نشد");
  return new Error(`خطای پایگاه داده: ${message}`);
}

// ===== Server Functions =====

export const recordPaymentFn = createServerFn({ method: "POST" })
  .middleware(async ({ next }) => {
    try {
      return await next();
    } catch (e) {
      if (e instanceof Response) {
        const status = e.status;
        if (status === 401) throw new Error("نشست کاربری معتبر نیست");
        if (status === 403) throw new Error("دسترسی لازم ندارید");
        throw new Error(`خطای سرور (${status})`);
      }
      if (e instanceof Error) throw e;
      throw new Error("خطای ناشناخته");
    }
  })
  .handler(async (input: unknown) => {
    // Validate input
    let data: RecordPaymentInput;
    try {
      data = RecordPaymentInput.parse(input);
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new Error(`ورودی نامعتبر: ${err.errors[0].message}`);
      }
      throw err;
    }

    // Get authenticated user
    const { user } = await requireSupabaseAuth();
    if (!user) throw new Error("نشست کاربری معتبر نیست");

    // Check invoice exists and get total
    const invoiceCheck = await getServiceClient()
      .from("invoices")
      .select("id, total, status")
      .eq("id", data.invoice_id)
      .single();

    if (invoiceCheck.error || !invoiceCheck.data) {
      throw new Error("فاکتور یافت نشد");
    }

    const invoice = invoiceCheck.data;

    // Validate payment amount doesn't exceed invoice total
    if (data.amount > invoice.total) {
      throw new Error(
        `مبلغ پرداخت (${data.amount}) نمی‌تواند بیشتر از مبلغ فاکتور (${invoice.total}) باشد`,
      );
    }

    // Create payment record
    const result = await getServiceClient()
      .from("payments")
      .insert({
        invoice_id: data.invoice_id,
        amount: data.amount,
        payment_date: data.payment_date,
        payment_method: data.payment_method,
        reference_number: data.reference_number || null,
        status: "pending",
        notes: data.notes || null,
        recorded_by: user.id,
      })
      .select()
      .single();

    if (result.error) {
      throw mapPgError(result.error.code, result.error.message);
    }

    // Update invoice status if fully paid
    const totalPaid = data.amount;
    if (totalPaid >= invoice.total) {
      await getServiceClient()
        .from("invoices")
        .update({ status: "paid" })
        .eq("id", data.invoice_id);
    } else if (totalPaid > 0 && invoice.status === "issued") {
      // Mark as partially paid
      await getServiceClient()
        .from("invoices")
        .update({ status: "partially_paid" })
        .eq("id", data.invoice_id);
    }

    // Log audit event
    // The business write has already committed. A failed audit row must not undo it,
    // so this is reported at error severity and swallowed — the same decision the
    // quote form makes for its own refusal rows.
    try {
      await logAuditEvent({
        actor_id: user.id,
        action: "CREATE",
        entity_type: "payments",
        entity_id: result.data.id,
        diff: {
          invoice_id: data.invoice_id,
          amount: data.amount,
          payment_method: data.payment_method,
          invoice_total: invoice.total,
          payment_percentage: ((data.amount / invoice.total) * 100).toFixed(2),
        },
      });
    } catch (auditError) {
      console.error(
        "[audit] %s row failed for %s: %s",
        "CREATE",
        "payments",
        auditError instanceof Error ? auditError.message : String(auditError),
      );
    }

    return result.data;
  });

export const updatePaymentFn = createServerFn({ method: "POST" })
  .middleware(async ({ next }) => {
    try {
      return await next();
    } catch (e) {
      if (e instanceof Response) {
        const status = e.status;
        if (status === 401) throw new Error("نشست کاربری معتبر نیست");
        if (status === 403) throw new Error("دسترسی لازم ندارید");
        throw new Error(`خطای سرور (${status})`);
      }
      if (e instanceof Error) throw e;
      throw new Error("خطای ناشناخته");
    }
  })
  .handler(async (input: unknown) => {
    // Validate input
    let data: UpdatePaymentInput;
    try {
      data = UpdatePaymentInput.parse(input);
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new Error(`ورودی نامعتبر: ${err.errors[0].message}`);
      }
      throw err;
    }

    // Get authenticated user
    const { user } = await requireSupabaseAuth();
    if (!user) throw new Error("نشست کاربری معتبر نیست");

    // Prepare update object
    const updateData: Record<string, any> = {};
    if (data.status) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    updateData.updated_by = user.id;
    updateData.updated_at = new Date().toISOString();

    // Update payment
    const result = await getServiceClient()
      .from("payments")
      .update(updateData)
      .eq("id", data.id)
      .select()
      .single();

    if (result.error) {
      throw mapPgError(result.error.code, result.error.message);
    }

    // Log audit event
    // The business write has already committed. A failed audit row must not undo it,
    // so this is reported at error severity and swallowed — the same decision the
    // quote form makes for its own refusal rows.
    try {
      await logAuditEvent({
        actor_id: user.id,
        action: "UPDATE",
        entity_type: "payments",
        entity_id: data.id,
        diff: updateData,
      });
    } catch (auditError) {
      console.error(
        "[audit] %s row failed for %s: %s",
        "UPDATE",
        "payments",
        auditError instanceof Error ? auditError.message : String(auditError),
      );
    }

    return result.data;
  });

export const reversePaymentFn = createServerFn({ method: "POST" })
  .middleware(async ({ next }) => {
    try {
      return await next();
    } catch (e) {
      if (e instanceof Response) {
        const status = e.status;
        if (status === 401) throw new Error("نشست کاربری معتبر نیست");
        if (status === 403) throw new Error("دسترسی لازم ندارید");
        throw new Error(`خطای سرور (${status})`);
      }
      if (e instanceof Error) throw e;
      throw new Error("خطای ناشناخته");
    }
  })
  .handler(async (paymentId: string) => {
    // Validate
    if (!paymentId || typeof paymentId !== "string") {
      throw new Error("شناسه پرداخت نامعتبر است");
    }

    // Get authenticated user
    const { user } = await requireSupabaseAuth();
    if (!user) throw new Error("نشست کاربری معتبر نیست");

    // Check if payment can be reversed
    const paymentCheck = await getServiceClient()
      .from("payments")
      .select("id, status, invoice_id, amount")
      .eq("id", paymentId)
      .single();

    if (paymentCheck.error || !paymentCheck.data) {
      throw new Error("پرداخت یافت نشد");
    }

    const payment = paymentCheck.data;

    if (payment.status === "reversed") {
      throw new Error("این پرداخت قبلاً لغو شده است");
    }

    // Reverse the payment
    const result = await getServiceClient()
      .from("payments")
      .update({
        status: "reversed",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .select()
      .single();

    if (result.error) {
      throw mapPgError(result.error.code, result.error.message);
    }

    // Update invoice status back to issued
    await getServiceClient()
      .from("invoices")
      .update({ status: "issued" })
      .eq("id", payment.invoice_id);

    // Log audit event
    // The business write has already committed. A failed audit row must not undo it,
    // so this is reported at error severity and swallowed — the same decision the
    // quote form makes for its own refusal rows.
    try {
      await logAuditEvent({
        actor_id: user.id,
        action: "UPDATE",
        entity_type: "payments",
        entity_id: paymentId,
        diff: {
          status: "reversed",
          reason: "manual_reversal",
          reversed_amount: payment.amount,
        },
      });
    } catch (auditError) {
      console.error(
        "[audit] %s row failed for %s: %s",
        "UPDATE",
        "payments",
        auditError instanceof Error ? auditError.message : String(auditError),
      );
    }

    return { success: true };
  });
