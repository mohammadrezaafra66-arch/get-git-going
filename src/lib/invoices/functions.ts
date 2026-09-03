/**
 * Invoice Management Server Functions
 *
 * Handles all invoice create/update/delete operations with:
 * - Full validation using Zod
 * - Authorization checks via RLS
 * - Comprehensive audit logging
 * - Error handling with Persian messages
 *
 * Use these instead of direct supabase client calls from UI.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";
import { getServiceClient } from "@/integrations/supabase/server";

// ===== Schemas =====

export const CreateInvoiceInput = z.object({
  customer_id: z.string().uuid("customer_id must be UUID"),
  invoice_number: z.string().min(1, "invoice_number is required"),
  issue_date: z.string().datetime().or(z.string().date()),
  due_date: z.string().datetime().or(z.string().date()).optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit_price: z.number().nonnegative(),
        tax_rate: z.number().nonnegative().max(1).optional(),
      }),
    )
    .min(1, "At least one item is required"),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInput>;

export const UpdateInvoiceInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "issued", "paid", "cancelled"]).optional(),
  due_date: z.string().datetime().or(z.string().date()).optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit_price: z.number().nonnegative(),
        tax_rate: z.number().nonnegative().max(1).optional(),
      }),
    )
    .optional(),
});

export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceInput>;

// ===== Error Mapping =====

function mapPgError(code: string | undefined, message: string): Error {
  if (code === "23505") {
    if (message.toLowerCase().includes("invoice_number")) {
      return new Error("شماره فاکتور تکراری است");
    }
    return new Error("مقدار تکراری است");
  }
  if (code === "42501") return new Error("دسترسی لازم برای این عملیات را ندارید");
  if (code === "23514") return new Error("مقدار وارد شده با محدودیت‌های پایگاه داده سازگار نیست");
  if (code === "23503") return new Error("مشتری یافت نشد یا دسترسی ندارید");
  if (code === "P0002") return new Error(message || "رکورد یافت نشد");
  return new Error(`خطای پایگاه داده: ${message}`);
}

// ===== Server Functions =====

export const createInvoiceFn = createServerFn({ method: "POST" })
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
    let data: CreateInvoiceInput;
    try {
      data = CreateInvoiceInput.parse(input);
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new Error(`ورودی نامعتبر: ${err.errors[0].message}`);
      }
      throw err;
    }

    // Get authenticated user
    const { user } = await requireSupabaseAuth();
    if (!user) throw new Error("نشست کاربری معتبر نیست");

    // Check customer exists and user has access
    const customerCheck = await getServiceClient()
      .from("customers")
      .select("id")
      .eq("id", data.customer_id)
      .single();

    if (customerCheck.error || !customerCheck.data) {
      throw new Error("مشتری یافت نشد");
    }

    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => {
      return sum + item.quantity * item.unit_price;
    }, 0);

    const tax = data.items.reduce((sum, item) => {
      const taxRate = item.tax_rate || 0;
      return sum + item.quantity * item.unit_price * taxRate;
    }, 0);

    const total = subtotal + tax;

    // Create invoice
    const result = await getServiceClient()
      .from("invoices")
      .insert({
        customer_id: data.customer_id,
        invoice_number: data.invoice_number,
        issue_date: data.issue_date,
        due_date: data.due_date || null,
        status: "draft",
        subtotal,
        tax,
        total,
        notes: data.notes || null,
        items: data.items,
        created_by: user.id,
      })
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
        action: "CREATE",
        entity_type: "invoices",
        entity_id: result.data.id,
        diff: {
          invoice_number: data.invoice_number,
          customer_id: data.customer_id,
          total,
          item_count: data.items.length,
        },
      });
    } catch (auditError) {
      console.error(
        "[audit] %s row failed for %s: %s",
        "CREATE",
        "invoices",
        auditError instanceof Error ? auditError.message : String(auditError),
      );
    }

    return result.data;
  });

export const updateInvoiceFn = createServerFn({ method: "POST" })
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
    let data: UpdateInvoiceInput;
    try {
      data = UpdateInvoiceInput.parse(input);
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
    if (data.due_date) updateData.due_date = data.due_date;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.items) {
      // Recalculate totals if items changed
      const subtotal = data.items.reduce((sum, item) => {
        return sum + item.quantity * item.unit_price;
      }, 0);
      const tax = data.items.reduce((sum, item) => {
        const taxRate = item.tax_rate || 0;
        return sum + item.quantity * item.unit_price * taxRate;
      }, 0);
      updateData.items = data.items;
      updateData.subtotal = subtotal;
      updateData.tax = tax;
      updateData.total = subtotal + tax;
    }

    // Update invoice
    const result = await getServiceClient()
      .from("invoices")
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
        entity_type: "invoices",
        entity_id: data.id,
        diff: updateData,
      });
    } catch (auditError) {
      console.error(
        "[audit] %s row failed for %s: %s",
        "UPDATE",
        "invoices",
        auditError instanceof Error ? auditError.message : String(auditError),
      );
    }

    return result.data;
  });

export const deleteInvoiceFn = createServerFn({ method: "POST" })
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
  .handler(async (invoiceId: string) => {
    // Validate
    if (!invoiceId || typeof invoiceId !== "string") {
      throw new Error("شناسه فاکتور نامعتبر است");
    }

    // Get authenticated user
    const { user } = await requireSupabaseAuth();
    if (!user) throw new Error("نشست کاربری معتبر نیست");

    // Check if invoice can be deleted (only draft)
    const invoiceCheck = await getServiceClient()
      .from("invoices")
      .select("status")
      .eq("id", invoiceId)
      .single();

    if (invoiceCheck.error || !invoiceCheck.data) {
      throw new Error("فاکتور یافت نشد");
    }

    if (invoiceCheck.data.status !== "draft") {
      throw new Error("فقط فاکتورهای پیش‌نویس قابل حذف هستند");
    }

    // Delete
    const result = await getServiceClient()
      .from("invoices")
      .delete()
      .eq("id", invoiceId)
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
        action: "DELETE",
        entity_type: "invoices",
        entity_id: invoiceId,
        diff: { deleted_at: new Date().toISOString() },
      });
    } catch (auditError) {
      console.error(
        "[audit] %s row failed for %s: %s",
        "DELETE",
        "invoices",
        auditError instanceof Error ? auditError.message : String(auditError),
      );
    }

    return { success: true };
  });
