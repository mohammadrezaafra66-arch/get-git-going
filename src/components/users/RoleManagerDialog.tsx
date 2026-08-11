import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_ROLES, ROLE_LABELS, type AppRole } from "@/lib/rbac/roles";
import { X } from "lucide-react";
import { toast } from "sonner";

/**
 * دیالوگ مدیریت نقش‌های یک کاربر فعال.
 * - افزودن نقش جدید (INSERT در user_roles)
 * - حذف نقش موجود (DELETE از user_roles) با تأیید
 * - محدودیت: حداقل یک نقش باید باقی بماند
 */
export function RoleManagerDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: {
  userId: string | null;
  userName?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [newRole, setNewRole] = useState<AppRole>("viewer");
  const [removeTarget, setRemoveTarget] = useState<AppRole | null>(null);

  const rolesQ = useQuery({
    queryKey: ["user-roles-manage", userId],
    enabled: !!userId && open,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
    },
  });

  const current = rolesQ.data ?? [];
  const addable = ALL_ROLES.filter((r) => !current.includes(r));

  const addMut = useMutation({
    mutationFn: async (role: AppRole) => {
      if (!userId) throw new Error("کاربر انتخاب نشده");
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("نقش با موفقیت اضافه شد");
      qc.invalidateQueries({ queryKey: ["user-roles-manage", userId] });
      qc.invalidateQueries({ queryKey: ["user-detail-roles", userId] });
    },
    onError: (e: Error) => toast.error(e.message || "افزودن نقش ناموفق"),
  });

  const removeMut = useMutation({
    mutationFn: async (role: AppRole) => {
      if (!userId) throw new Error("کاربر انتخاب نشده");
      if (current.length <= 1) {
        throw new Error("حداقل یک نقش باید برای کاربر باقی بماند");
      }
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("نقش حذف شد");
      qc.invalidateQueries({ queryKey: ["user-roles-manage", userId] });
      qc.invalidateQueries({ queryKey: ["user-detail-roles", userId] });
      setRemoveTarget(null);
    },
    onError: (e: Error) => {
      toast.error(e.message || "حذف نقش ناموفق");
      setRemoveTarget(null);
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>مدیریت نقش کاربر</DialogTitle>
            <DialogDescription>
              {userName ? `${userName} — ` : ""}افزودن یا حذف نقش‌های سازمانی.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs">نقش‌های فعلی</Label>
              {rolesQ.isLoading ? (
                <div className="text-sm text-muted-foreground">در حال بارگذاری...</div>
              ) : current.length === 0 ? (
                <div className="text-sm text-muted-foreground">هیچ نقشی ندارد.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {current.map((r) => (
                    <Badge key={r} variant="secondary" className="gap-1 pl-1 pr-2">
                      {ROLE_LABELS[r] ?? r}
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(r)}
                        className="rounded-full p-0.5 hover:bg-destructive/20"
                        disabled={current.length <= 1}
                        title={current.length <= 1 ? "حداقل یک نقش الزامی است" : "حذف نقش"}
                        aria-label={`حذف نقش ${ROLE_LABELS[r] ?? r}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {current.length <= 1 && current.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  حداقل یک نقش باید برای کاربر باقی بماند.
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <Label className="mb-2 block text-xs">افزودن نقش جدید</Label>
              {addable.length === 0 ? (
                <p className="text-sm text-muted-foreground">تمام نقش‌ها به این کاربر داده شده.</p>
              ) : (
                <div className="flex gap-2">
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {addable.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r] ?? r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => addMut.mutate(newRole)}
                    disabled={addMut.isPending || !addable.includes(newRole)}
                  >
                    {addMut.isPending ? "در حال افزودن..." : "افزودن"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نقش</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف نقش «{removeTarget ? (ROLE_LABELS[removeTarget] ?? removeTarget) : ""}»
              مطمئنید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMut.mutate(removeTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف نقش
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default RoleManagerDialog;