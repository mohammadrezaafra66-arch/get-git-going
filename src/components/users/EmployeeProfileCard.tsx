import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { formatDateFa } from "@/lib/i18n/formatters";
import { Pencil, UserCog } from "lucide-react";
import { toast } from "sonner";

/**
 * کارت جامع «اطلاعات پرسنلی» در صفحه پروفایل کاربر.
 * داده از employee_profiles با upsert روی user_id.
 */
interface EmployeeProfileRow {
  id?: string;
  user_id: string;
  employment_start_date: string | null;
  department: string | null;
  bio: string | null;
  direct_manager_id: string | null;
}

interface ManagerOption {
  id: string;
  full_name: string | null;
}

const NONE_MANAGER = "__none__";

export function EmployeeProfileCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const [employmentDate, setEmploymentDate] = useState("");
  const [department, setDepartment] = useState("");
  const [bio, setBio] = useState("");
  const [managerId, setManagerId] = useState<string>(NONE_MANAGER);

  const profileQ = useQuery({
    queryKey: ["employee-profile-full", userId],
    queryFn: async (): Promise<EmployeeProfileRow | null> => {
      const { data, error } = await supabase
        .from("employee_profiles")
        .select("id, user_id, employment_start_date, department, bio, direct_manager_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as EmployeeProfileRow | null;
    },
  });

  const managersQ = useQuery({
    queryKey: ["active-managers-list"],
    queryFn: async (): Promise<ManagerOption[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ManagerOption[];
    },
    enabled: open,
  });

  const managerNameQ = useQuery({
    queryKey: ["manager-name", profileQ.data?.direct_manager_id],
    enabled: !!profileQ.data?.direct_manager_id,
    queryFn: async () => {
      const id = profileQ.data?.direct_manager_id;
      if (!id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data?.full_name ?? null) as string | null;
    },
  });

  // Populate dialog state on open
  useEffect(() => {
    if (open) {
      const p = profileQ.data;
      setEmploymentDate(p?.employment_start_date ?? "");
      setDepartment(p?.department ?? "");
      setBio(p?.bio ?? "");
      setManagerId(p?.direct_manager_id ?? NONE_MANAGER);
    }
  }, [open, profileQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!employmentDate) throw new Error("تاریخ شروع همکاری الزامی است");
      if (bio.length > 500) throw new Error("شرح سابقه نباید بیش از ۵۰۰ کاراکتر باشد");
      const payload = {
        user_id: userId,
        employment_start_date: employmentDate,
        department: department.trim() || null,
        bio: bio.trim() || null,
        direct_manager_id: managerId === NONE_MANAGER ? null : managerId,
      };
      const { error } = await supabase
        .from("employee_profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("اطلاعات پرسنلی با موفقیت ذخیره شد");
      qc.invalidateQueries({ queryKey: ["employee-profile-full", userId] });
      qc.invalidateQueries({ queryKey: ["employee-profile", userId] });
      qc.invalidateQueries({ queryKey: ["manager-name"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "خطا در ذخیره‌سازی"),
  });

  const p = profileQ.data;
  const empty = <span className="text-muted-foreground">ثبت نشده</span>;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4" />
          اطلاعات پرسنلی
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="ml-1 h-3.5 w-3.5" />
          ویرایش
        </Button>
      </CardHeader>
      <CardContent>
        {profileQ.isLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">تاریخ شروع همکاری</div>
              <div className="font-medium">
                {p?.employment_start_date ? formatDateFa(p.employment_start_date) : empty}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">دپارتمان</div>
              <div className="font-medium">{p?.department || empty}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">مدیر مستقیم</div>
              <div className="font-medium">
                {p?.direct_manager_id ? (managerNameQ.data ?? "…") : empty}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">شرح سابقه / بیو</div>
              <div className="font-medium whitespace-pre-wrap">{p?.bio || empty}</div>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ویرایش اطلاعات پرسنلی</DialogTitle>
            <DialogDescription>
              تاریخ شروع همکاری برای محاسبه سابقه و رتبه‌بندی در لیدربرد استفاده می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                تاریخ شروع همکاری <span className="text-destructive">*</span>
              </Label>
              <JalaliDateInput
                value={employmentDate}
                onChange={(iso) => setEmploymentDate(iso)}
                max={new Date().toISOString().slice(0, 10)}
                placeholder="انتخاب تاریخ"
                invalid={!employmentDate}
              />
              {!employmentDate && (
                <p className="text-xs text-destructive">تاریخ شروع همکاری الزامی است</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>دپارتمان</Label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="مثال: فروش، حسابداری"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label>مدیر مستقیم</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="بدون مدیر" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_MANAGER}>— بدون مدیر —</SelectItem>
                  {(managersQ.data ?? [])
                    .filter((m) => m.id !== userId)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name ?? m.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>شرح سابقه / بیو</Label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="سابقه کاری، تخصص‌ها، یادداشت‌های داخلی..."
                rows={4}
                maxLength={500}
              />
              <div className="text-left text-xs text-muted-foreground">
                {bio.length} / ۵۰۰
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={() => save.mutate()} disabled={!employmentDate || save.isPending}>
              {save.isPending ? "در حال ذخیره..." : "ذخیره"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default EmployeeProfileCard;