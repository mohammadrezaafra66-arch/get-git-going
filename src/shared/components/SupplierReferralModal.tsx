import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, UserPlus, Phone, MapPin, FileText, Building2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const phoneRegex = /^0\d{2,10}$/;

const schema = z.object({
  name: z.string().trim().min(2, "نام باید حداقل ۲ کاراکتر باشد").max(150, "حداکثر ۱۵۰ کاراکتر"),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || phoneRegex.test(v), "شماره تماس نامعتبر است"),
  city: z.string().trim().max(80, "حداکثر ۸۰ کاراکتر").optional(),
  notes: z.string().trim().max(300, "حداکثر ۳۰۰ کاراکتر").optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultNotes?: string;
}

export function SupplierReferralModal({ open, onOpenChange, defaultNotes }: Props) {
  // created_by is stamped server-side from auth.uid() by person_create_inline.
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", city: "", notes: defaultNotes ?? "" },
    mode: "onBlur",
  });

  useEffect(() => {
    if (open && defaultNotes && !form.getValues("notes")) {
      form.setValue("notes", defaultNotes);
    }
  }, [open, defaultNotes, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Phase 6.2 — referrals used to INSERT into suppliers directly, which is
      // the most likely origin of the stray person_id=NULL rows. Routed through
      // person_create_inline so a referred supplier always has a person.
      const phone = values.phone?.trim() || null;
      const { error } = await supabase.rpc("person_create_inline", {
        p_display_name: values.name.trim(),
        p_context_kind: "supplier",
        p_kind: "organization",
        p_identifiers: phone
          ? [{ kind: "mobile_e164", value_raw: phone, is_primary: true, status: "provisional" }]
          : [],
        p_city: values.city?.trim() || null,
        p_notes: values.notes?.trim() || null,
        // A referral is unvetted by definition: it stays pending until reviewed.
        p_legacy_fields: { status: "pending", trust_level: "medium" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تأمین‌کننده جدید معرفی شد و پس از بررسی فعال خواهد شد.");
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-form-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`ثبت تأمین‌کننده ناموفق بود: ${msg}`);
    },
  });

  const errors = form.formState.errors;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) form.reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg p-0 overflow-hidden" dir="rtl">
        {/* Decorative header */}
        <div className="relative bg-gradient-to-bl from-primary/15 via-primary/5 to-transparent px-6 pt-6 pb-5 border-b">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <UserPlus className="h-5 w-5" />
            </div>
            <DialogHeader className="space-y-1 text-right flex-1">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                معرفی تأمین‌کننده جدید
                <Sparkles className="h-4 w-4 text-primary/70" />
              </DialogTitle>
              <DialogDescription className="text-xs leading-6">
                با معرفی تأمین‌کننده‌های جدید به گسترش شبکه‌ی خرید کمک می‌کنید. اطلاعات اولیه را
                وارد کنید؛ پس از تأیید مدیر، فعال می‌شود.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4 px-6 py-5"
        >
          <div className="space-y-1.5">
            <Label htmlFor="sr-name" className="flex items-center gap-1.5 text-sm">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              نام تأمین‌کننده <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sr-name"
              {...form.register("name")}
              placeholder="نام شرکت یا فروشگاه"
              className="h-10"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sr-phone" className="flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                تلفن
              </Label>
              <Input
                id="sr-phone"
                dir="ltr"
                inputMode="numeric"
                placeholder="0xxxxxxxxxx"
                className="h-10"
                {...form.register("phone")}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sr-city" className="flex items-center gap-1.5 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                شهر
              </Label>
              <Input
                id="sr-city"
                {...form.register("city")}
                placeholder="مثلاً تهران"
                className="h-10"
              />
              {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-notes" className="flex items-center gap-1.5 text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              توضیحات
            </Label>
            <Textarea
              id="sr-notes"
              rows={3}
              maxLength={300}
              placeholder="مثلاً: محصول، مدل، قیمت پیشنهادی یا هر اطلاعات تکمیلی"
              className="resize-none"
              {...form.register("notes")}
            />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
          </div>

          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            تأمین‌کننده‌های معرفی‌شده توسط شما برای کل تیم قابل مشاهده خواهد بود و پس از تأیید نهایی
            برای ثبت قیمت خرید فعال می‌شود.
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.reset();
                onOpenChange(false);
              }}
              disabled={mutation.isPending}
            >
              انصراف
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              ثبت تأمین‌کننده
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
