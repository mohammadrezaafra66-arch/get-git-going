import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

/**
 * بنر هشدار روی صفحه پروفایل کارمند: اگر employment_start_date در
 * employee_profiles خالی باشد، توصیه به تکمیل با دیالوگ ویرایش سریع.
 * فیلد در schema همچنان nullable است (backward compat).
 */
export function EmploymentStartDateBanner({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>("");

  const q = useQuery({
    queryKey: ["employee-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_profiles")
        .select("id, user_id, employment_start_date")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; user_id: string; employment_start_date: string | null } | null;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("تاریخ شروع همکاری الزامی است");
      const { error } = await supabase
        .from("employee_profiles")
        .upsert(
          { user_id: userId, employment_start_date: date },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تاریخ شروع همکاری ذخیره شد");
      qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "خطا در ذخیره‌سازی"),
  });

  if (q.isLoading || q.data?.employment_start_date) return null;

  return (
    <>
      <Alert>
        <CalendarClock className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>تاریخ شروع همکاری ثبت نشده — برای دقت لیدربرد توصیه می‌شود تکمیل شود.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDate(q.data?.employment_start_date ?? "");
              setOpen(true);
            }}
          >
            ویرایش سریع
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>ثبت تاریخ شروع همکاری</DialogTitle>
            <DialogDescription>
              این تاریخ برای محاسبه سابقه و رتبه‌بندی در لیدربرد استفاده می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>
              تاریخ شروع همکاری <span className="text-destructive">*</span>
            </Label>
            <JalaliDateInput
              value={date}
              onChange={(iso) => setDate(iso)}
              max={new Date().toISOString().slice(0, 10)}
              placeholder="انتخاب تاریخ"
              invalid={!date}
            />
            {!date && (
              <p className="text-xs text-destructive">تاریخ شروع همکاری الزامی است</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={() => save.mutate()} disabled={!date || save.isPending}>
              {save.isPending ? "در حال ذخیره..." : "ذخیره"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default EmploymentStartDateBanner;