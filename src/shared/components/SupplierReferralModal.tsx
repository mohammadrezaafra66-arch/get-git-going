import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
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
  const { user } = useAuth();
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
      const payload = {
        name: values.name.trim(),
        phone: values.phone?.trim() || null,
        city: values.city?.trim() || null,
        notes: values.notes?.trim() || null,
        status: "pending" as const,
        trust_level: "medium" as const,
        created_by: user?.id ?? null,
      };
      const { error } = await supabase.from("suppliers").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تأمین‌کننده جدید معرفی شد و پس از بررسی فعال خواهد شد.");
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
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
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>معرفی تأمین‌کننده جدید</DialogTitle>
          <DialogDescription>
            اطلاعات اولیه تأمین‌کننده را وارد کنید. پس از ثبت، مدیر آن را بررسی خواهد کرد.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="sr-name">
              نام تأمین‌کننده <span className="text-destructive">*</span>
            </Label>
            <Input id="sr-name" {...form.register("name")} placeholder="نام شرکت یا فروشگاه" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sr-phone">تلفن</Label>
            <Input
              id="sr-phone"
              dir="ltr"
              inputMode="numeric"
              placeholder="0xxxxxxxxxx"
              {...form.register("phone")}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sr-city">شهر</Label>
            <Input id="sr-city" {...form.register("city")} placeholder="مثلاً تهران" />
            {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sr-notes">توضیحات</Label>
            <Textarea id="sr-notes" rows={3} maxLength={300} {...form.register("notes")} />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ثبت
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}