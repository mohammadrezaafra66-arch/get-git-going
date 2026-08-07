import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const phoneRegex = /^0\d{2,10}$/;
// Same shape the customer side uses (CustomerForm.tsx) and the same shape
// suppliers_accounting_code_format enforces in the database (migration 308).
const accountingCodeRegex = /^[A-Za-z0-9_-]{1,30}$/;

const schema = z.object({
  name: z.string().trim().min(2, "نام باید حداقل ۲ کاراکتر باشد").max(150),
  contact_name: z.string().trim().max(120).optional(),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || phoneRegex.test(v), "شماره تماس نامعتبر است"),
  city: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500, "حداکثر ۵۰۰ کاراکتر").optional(),
  accounting_code: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || accountingCodeRegex.test(v),
      "کد آسان فقط شامل حروف انگلیسی، اعداد، _ و - و حداکثر ۳۰ کاراکتر",
    ),
  trust_level: z.enum(["low", "medium", "high"]),
  status: z.enum(["pending", "active", "rejected"]),
});

export type SupplierFormValues = z.infer<typeof schema>;

/**
 * Set, change or clear a person's Asan code.
 *
 * The code is stored once, on `person_identifiers`, and mirrored onto
 * `suppliers.accounting_code` (and the customer mirror) by database triggers —
 * so this never writes the mirror itself. `asan_list_purchase_export` reads the
 * identifier directly, which is why the identifier is what actually matters.
 */
async function upsertAsanCode(personId: string, code: string | null) {
  const { data: existing, error: readError } = await supabase
    .from("person_identifiers")
    .select("id, value_raw, is_primary")
    .eq("person_id", personId)
    .eq("kind", "asan_person_code")
    .neq("status", "revoked")
    .maybeSingle();
  if (readError) throw readError;

  const row = existing as { id: string; value_raw: string | null; is_primary: boolean } | null;

  if (!code) {
    if (!row) return;
    // validate_person_identifier() refuses to revoke a row while it is primary
    // ("A revoked identifier cannot be primary"), so primary comes off first.
    // Found by the migration 308 dry run, not by reading the code.
    if (row.is_primary) {
      const { error } = await supabase
        .from("person_identifiers")
        .update({ is_primary: false } as never)
        .eq("id", row.id);
      if (error) throw error;
    }
    const { error } = await supabase
      .from("person_identifiers")
      .update({ status: "revoked" } as never)
      .eq("id", row.id);
    if (error) throw error;
    return;
  }

  if (row) {
    if (row.value_raw === code) return;
    const { error } = await supabase
      .from("person_identifiers")
      .update({ value_raw: code } as never)
      .eq("id", row.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("person_identifiers").insert({
    person_id: personId,
    kind: "asan_person_code",
    value_raw: code,
    is_primary: true,
    status: "provisional",
  } as never);
  if (error) throw error;
}

interface Props {
  supplierId?: string;
  /**
   * The person behind this supplier. Required to edit the Asan code, because the
   * code lives on `person_identifiers`, not on the suppliers row — see the note
   * on the field below.
   */
  personId?: string | null;
  defaultValues?: Partial<SupplierFormValues>;
  /** اگر فعال شود، انتخاب وضعیت در فرم در دسترس نیست (فقط دکمه‌های تأیید/رد) */
  hideStatus?: boolean;
}

export function SupplierForm({ supplierId, personId, defaultValues, hideStatus }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // `user` is no longer needed: person_create_inline stamps created_by from
  // auth.uid() server-side (Phase 6.1).
  const { roles } = useAuth();
  const canSetActive = hasAnyRole(roles, ["admin", "accountant"]);
  const canEdit = hasAnyRole(roles, ["admin", "accountant"]);
  // The Asan code lives on person_identifiers, whose RLS is asymmetric:
  //   INSERT  admin, manager, sales, accountant
  //   UPDATE  admin, manager only
  // So an accountant can set a code while creating a supplier but cannot change
  // one afterwards. Mirroring that in the UI keeps the guard honest instead of
  // letting the save fail with a raw RLS error. Widening the UPDATE policy would
  // be an RBAC decision, not a form change.
  const canChangeExistingAsanCode = hasAnyRole(roles, ["admin", "manager"]);
  const asanCodeDisabled = Boolean(supplierId) && !canChangeExistingAsanCode;

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      contact_name: defaultValues?.contact_name ?? "",
      phone: defaultValues?.phone ?? "",
      city: defaultValues?.city ?? "",
      notes: defaultValues?.notes ?? "",
      accounting_code: defaultValues?.accounting_code ?? "",
      trust_level: (defaultValues?.trust_level as "low" | "medium" | "high") ?? "medium",
      status:
        (defaultValues?.status as "pending" | "active" | "rejected") ??
        (canSetActive ? "active" : "pending"),
    },
    mode: "onBlur",
  });

  const mutation = useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      const finalStatus = supplierId ? values.status : canSetActive ? values.status : "pending";
      const payload = {
        name: values.name.trim(),
        contact_name: values.contact_name?.trim() || null,
        phone: values.phone?.trim() || null,
        city: values.city?.trim() || null,
        notes: values.notes?.trim() || null,
        trust_level: values.trust_level,
        status: finalStatus,
      };
      const asanCode = values.accounting_code?.trim() || null;

      if (supplierId) {
        // Editing an existing supplier does not create identity, so it stays a
        // plain UPDATE. Only creation has to go through the person RPC.
        //
        // NOTE: accounting_code is deliberately absent from this payload. It is
        // a mirror maintained by migrations 308/309; the source of truth is the
        // person's asan_person_code identifier, and asan_list_purchase_export
        // reads that identifier — not this column. Writing the column here would
        // put the two out of step and still not reach the export.
        const { error } = await supabase
          .from("suppliers")
          .update(payload as never)
          .eq("id", supplierId);
        if (error) throw error;

        if (canChangeExistingAsanCode && personId) {
          await upsertAsanCode(personId, asanCode);
        }
        return supplierId;
      }

      // Phase 6.1 — creation goes through person_create_inline so a supplier can
      // never exist without a person. The RPC writes person + identifiers +
      // suppliers row + context link in ONE transaction; a direct insert here
      // would recreate the person_id=NULL hole this phase exists to close.
      const identifiers: Array<{
        kind: string;
        value_raw: string;
        is_primary: boolean;
        status: string;
      }> = [];
      if (payload.phone) {
        identifiers.push({
          kind: "mobile_e164",
          value_raw: payload.phone,
          is_primary: true,
          status: "provisional",
        });
      }
      if (asanCode) {
        // The RPC forwards p_identifiers to person_create_full, which inserts
        // them generically — so the Asan code rides the same path as the phone.
        // Migration 309's BEFORE INSERT trigger then fills suppliers
        // .accounting_code, which 308 alone could not do here: the RPC creates
        // the identifier BEFORE the suppliers row exists.
        identifiers.push({
          kind: "asan_person_code",
          value_raw: asanCode,
          is_primary: true,
          status: "provisional",
        });
      }

      const { data, error } = await supabase.rpc("person_create_inline", {
        p_display_name: payload.name,
        p_context_kind: "supplier",
        p_kind: "organization",
        p_identifiers: identifiers,
        p_city: payload.city,
        p_notes: payload.notes,
        // Fields that live only on the suppliers row. Applied by the RPC through
        // a whitelist (migration 232) so nothing this form collects is dropped.
        p_legacy_fields: {
          contact_name: payload.contact_name,
          trust_level: payload.trust_level,
          status: payload.status,
        },
      });
      if (error) throw error;

      const row = data as { legacy_id: string | null } | null;
      if (!row?.legacy_id) {
        throw new Error("ثبت تأمین‌کننده ناموفق بود — شناسه‌ای بازگردانده نشد");
      }
      return row.legacy_id;
    },
    onSuccess: () => {
      toast.success(supplierId ? "تأمین‌کننده ویرایش شد" : "تأمین‌کننده ثبت شد");
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplier", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-form-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      navigate({ to: "/suppliers" });
    },
    onError: (err: unknown) => {
      const raw = err instanceof Error ? err.message : "";
      const lower = raw.toLowerCase();

      // Two different uniqueness rules can reject an Asan code, and the raw
      // Postgres text is unreadable for the user:
      //   uq_person_identifiers_asan_code_active — another PERSON holds it
      //   suppliers_accounting_code_unique_idx   — the mirror already has it
      if (lower.includes("asan_code_active") || lower.includes("accounting_code_unique")) {
        toast.error("این کد آسان قبلاً برای شخص دیگری ثبت شده است.");
        return;
      }
      // The normaliser rejects anything non-numeric for this kind.
      if (raw.includes("کد حساب آسان")) {
        toast.error(raw);
        return;
      }
      if (lower.includes("row-level security") || lower.includes("permission denied")) {
        toast.error("اجازهٔ تغییر کد آسان را ندارید.");
        return;
      }

      toast.error(`عملیات ناموفق بود: ${raw || "خطای ناشناخته"}`);
    },
  });

  const errors = form.formState.errors;
  const disabled = !canEdit;

  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
      className="mx-auto w-full max-w-2xl space-y-5"
      dir="rtl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">
            نام تأمین‌کننده <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            disabled={disabled}
            {...form.register("name")}
            placeholder="نام شرکت یا فروشگاه"
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="accounting_code">کد آسان</Label>
          <Input
            id="accounting_code"
            dir="ltr"
            inputMode="numeric"
            disabled={disabled || asanCodeDisabled}
            placeholder="مثلاً ۵۸۲۷۹"
            {...form.register("accounting_code")}
          />
          {errors.accounting_code && (
            <p className="text-xs text-destructive">{errors.accounting_code.message}</p>
          )}
          <p className="text-xs text-muted-foreground leading-5">
            کد یکتای آسان برای این شخص. اگر خالی باشد، خروجی آسان این تأمین‌کننده را بلاک می‌کند.
          </p>
          {asanCodeDisabled && (
            <p className="text-xs text-muted-foreground leading-5">
              تغییر کد آسانِ ثبت‌شده فقط از عهدهٔ مدیر سامانه برمی‌آید.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_name">شخص تماس</Label>
          <Input id="contact_name" disabled={disabled} {...form.register("contact_name")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">تلفن</Label>
          <Input
            id="phone"
            disabled={disabled}
            dir="ltr"
            inputMode="numeric"
            placeholder="0xxxxxxxxxx"
            {...form.register("phone")}
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">شهر</Label>
          <Input
            id="city"
            disabled={disabled}
            {...form.register("city")}
            placeholder="مثلاً تهران"
          />
        </div>
        <div className="space-y-2">
          <Label>سطح اعتماد</Label>
          <Select
            value={form.watch("trust_level")}
            onValueChange={(v) =>
              form.setValue("trust_level", v as "low" | "medium" | "high", { shouldDirty: true })
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">پایین</SelectItem>
              <SelectItem value="medium">متوسط</SelectItem>
              <SelectItem value="high">بالا</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!hideStatus && !supplierId && canSetActive && (
          <div className="space-y-2">
            <Label>وضعیت اولیه</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(v) =>
                form.setValue("status", v as "pending" | "active" | "rejected", {
                  shouldDirty: true,
                })
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="pending">در انتظار تأیید</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">یادداشت</Label>
        <Textarea
          id="notes"
          rows={3}
          maxLength={500}
          disabled={disabled}
          {...form.register("notes")}
        />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending || disabled} className="flex-1">
          {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          {supplierId ? "ذخیره تغییرات" : "ثبت تأمین‌کننده"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/suppliers" })}>
          بازگشت
        </Button>
      </div>
    </form>
  );
}
