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
  trust_level: z.enum(["low", "medium", "high"]),
  status: z.enum(["pending", "active", "rejected"]),
});

export type SupplierFormValues = z.infer<typeof schema>;

interface Props {
  supplierId?: string;
  defaultValues?: Partial<SupplierFormValues>;
  /** اگر فعال شود، انتخاب وضعیت در فرم در دسترس نیست (فقط دکمه‌های تأیید/رد) */
  hideStatus?: boolean;
}

export function SupplierForm({ supplierId, defaultValues, hideStatus }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // `user` is no longer needed: person_create_inline stamps created_by from
  // auth.uid() server-side (Phase 6.1).
  const { roles } = useAuth();
  const canSetActive = hasAnyRole(roles, ["admin", "accountant"]);
  const canEdit = hasAnyRole(roles, ["admin", "accountant"]);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      contact_name: defaultValues?.contact_name ?? "",
      phone: defaultValues?.phone ?? "",
      city: defaultValues?.city ?? "",
      notes: defaultValues?.notes ?? "",
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
      if (supplierId) {
        // Editing an existing supplier does not create identity, so it stays a
        // plain UPDATE. Only creation has to go through the person RPC.
        const { error } = await supabase
          .from("suppliers")
          .update(payload as never)
          .eq("id", supplierId);
        if (error) throw error;
        return supplierId;
      }

      // Phase 6.1 — creation goes through person_create_inline so a supplier can
      // never exist without a person. The RPC writes person + identifiers +
      // suppliers row + context link in ONE transaction; a direct insert here
      // would recreate the person_id=NULL hole this phase exists to close.
      const identifiers = payload.phone
        ? [
            {
              kind: "mobile_e164",
              value_raw: payload.phone,
              is_primary: true,
              status: "provisional",
            },
          ]
        : [];

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
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`عملیات ناموفق بود: ${msg}`);
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
