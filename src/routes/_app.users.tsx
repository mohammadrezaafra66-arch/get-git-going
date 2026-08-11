import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { requireAdmin } from "@/lib/rbac/route-guards";
import { ROLE_LABELS, ALL_ROLES, type AppRole } from "@/lib/rbac/roles";
import { formatDateFa } from "@/lib/i18n/formatters";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { fetchProfileFieldValues, fetchActiveProfileFields } from "@/lib/profile-fields/queries";
import { WEEK_DAYS } from "@/lib/profile-fields/types";
import { Zap, ShieldCheck } from "lucide-react";
import { RoleManagerDialog } from "@/components/users/RoleManagerDialog";

type Status = "all" | "pending" | "active" | "inactive" | "rejected";
const VALID_STATUS: Status[] = ["all", "pending", "active", "inactive", "rejected"];

export const Route = createFileRoute("/_app/users")({
  validateSearch: (s: Record<string, unknown>): { status?: Status } => {
    const v = s.status;
    return {
      status:
        typeof v === "string" && (VALID_STATUS as string[]).includes(v) ? (v as Status) : undefined,
    };
  },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: UsersManagementPage,
});

interface Row {
  id: string;
  full_name: string | null;
  phone: string | null;
  position: string | null;
  status: string;
  registered_at: string;
}

const PAGE = 20;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "در انتظار", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  active: { label: "فعال", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  inactive: { label: "غیرفعال", className: "bg-muted text-muted-foreground" },
  rejected: { label: "رد شده", className: "bg-red-100 text-red-800 hover:bg-red-100" },
};

function UsersManagementPage() {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/users" });
  const search = Route.useSearch();
  const initialStatus: Status = search.status ?? "all";

  const [status, setStatus] = useState<Status>(initialStatus);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);
  const debounced = useDebounce(searchText, 350);

  const [approveTarget, setApproveTarget] = useState<Row | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Row | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<Row | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Row | null>(null);
  const [roleManageTarget, setRoleManageTarget] = useState<Row | null>(null);
  const [selRole, setSelRole] = useState<AppRole>("viewer");
  const [selPosition, setSelPosition] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  // Sync status to URL
  useEffect(() => {
    navigate({ search: status === "all" ? {} : { status }, replace: true });
  }, [status, navigate]);

  // Realtime subscription on profiles
  useEffect(() => {
    const ch = supabase
      .channel("users-page-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        qc.invalidateQueries({ queryKey: ["users-management"] });
        qc.invalidateQueries({ queryKey: ["pending-users-count"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const queryKey = useMemo(
    () => ["users-management", status, debounced, page] as const,
    [status, debounced, page],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, phone, position, status, registered_at", { count: "exact" })
        .order("registered_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (status !== "all") q = q.eq("status", status);
      if (debounced.trim()) q = q.ilike("full_name", `%${debounced.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Row[], count: count ?? 0 };
    },
  });

  const approveMut = useMutation({
    mutationFn: async (args: { userId: string; role: AppRole; position: string }) => {
      const { error } = await supabase.rpc("approve_pending_user", {
        _user_id: args.userId,
        _role: args.role,
        _position: args.position || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("کاربر تأیید و فعال شد.");
      setApproveTarget(null);
      setSelRole("viewer");
      setSelPosition("");
      qc.invalidateQueries({ queryKey: ["users-management"] });
      qc.invalidateQueries({ queryKey: ["pending-users-count"] });
    },
    onError: (e: Error) => toast.error("تأیید ناموفق", { description: e.message }),
  });

  const rejectMut = useMutation({
    mutationFn: async (args: { userId: string; notes: string }) => {
      const { error } = await supabase.rpc("reject_pending_user", {
        _user_id: args.userId,
        _notes: args.notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("کاربر رد شد.");
      setRejectTarget(null);
      setRejectNotes("");
      qc.invalidateQueries({ queryKey: ["users-management"] });
      qc.invalidateQueries({ queryKey: ["pending-users-count"] });
    },
    onError: (e: Error) => toast.error("رد ناموفق", { description: e.message }),
  });

  const deactivateMut = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("deactivate_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("کاربر غیرفعال شد.");
      setDeactivateTarget(null);
      qc.invalidateQueries({ queryKey: ["users-management"] });
    },
    onError: (e: Error) => toast.error("غیرفعال‌سازی ناموفق", { description: e.message }),
  });

  const quickApproveMut = useMutation({
    mutationFn: async (args: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc(
        "quick_approve_user" as never,
        {
          _user_id: args.userId,
          _role: args.role,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("کاربر با نقش پیش‌فرض تأیید شد.");
      qc.invalidateQueries({ queryKey: ["users-management"] });
      qc.invalidateQueries({ queryKey: ["pending-users-count"] });
    },
    onError: (e: Error) => toast.error("تأیید سریع ناموفق", { description: e.message }),
  });

  const reactivateMut = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc(
        "reactivate_user" as never,
        { _user_id: userId } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("کاربر فعال شد.");
      setReactivateTarget(null);
      qc.invalidateQueries({ queryKey: ["users-management"] });
    },
    onError: (e: Error) => toast.error("فعال‌سازی ناموفق", { description: e.message }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مدیریت کاربران"
        description="تأیید ثبت‌نام‌های جدید، تخصیص نقش، فعال/غیرفعال‌سازی و مشاهدهٔ همهٔ کاربران سامانه."
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
              <div className="space-y-1">
                <Label className="text-xs">جستجوی نام</Label>
                <Input
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(0);
                  }}
                  placeholder="نام کاربر..."
                  className="h-9 w-full sm:w-56"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">وضعیت</Label>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v as Status);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-9 w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه</SelectItem>
                    <SelectItem value="pending">در انتظار تأیید</SelectItem>
                    <SelectItem value="active">فعال</SelectItem>
                    <SelectItem value="inactive">غیرفعال</SelectItem>
                    <SelectItem value="rejected">رد شده</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{data ? `${data.count} کاربر` : ""}</div>
          </div>

          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">موردی یافت نشد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">نام کامل</th>
                    <th className="p-3 font-medium">تلفن</th>
                    <th className="p-3 font-medium">سمت پیشنهادی</th>
                    <th className="p-3 font-medium">وضعیت</th>
                    <th className="p-3 font-medium">تاریخ ثبت‌نام</th>
                    <th className="p-3 font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((u) => {
                    const b = STATUS_BADGE[u.status] ?? { label: u.status, className: "" };
                    return (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-medium">{u.full_name ?? "—"}</td>
                        <td className="p-3 text-muted-foreground" dir="ltr">
                          {u.phone ?? "—"}
                        </td>
                        <td className="p-3 text-muted-foreground">{u.position ?? "—"}</td>
                        <td className="p-3">
                          <Badge className={b.className}>{b.label}</Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {formatDateFa(u.registered_at)}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setDetailsTarget(u)}>
                              جزئیات
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <Link to="/users/$userId" params={{ userId: u.id }}>
                                امتیاز پویا
                              </Link>
                            </Button>
                            {u.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    quickApproveMut.mutate({ userId: u.id, role: "sales" })
                                  }
                                  disabled={quickApproveMut.isPending}
                                >
                                  <Zap className="ml-1 h-3.5 w-3.5" />
                                  تأیید سریع
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setApproveTarget(u);
                                    setSelPosition(u.position ?? "");
                                  }}
                                >
                                  تأیید
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setRejectTarget(u)}
                                >
                                  رد
                                </Button>
                              </>
                            )}
                            {u.status === "active" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setRoleManageTarget(u)}
                                >
                                  <ShieldCheck className="ml-1 h-3.5 w-3.5" />
                                  مدیریت نقش
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeactivateTarget(u)}
                                >
                                  غیرفعال‌سازی
                                </Button>
                              </>
                            )}
                            {(u.status === "inactive" || u.status === "rejected") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReactivateTarget(u)}
                              >
                                فعال‌سازی
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data && data.count > PAGE && (
            <div className="flex items-center justify-between pt-2 text-xs">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                قبلی
              </Button>
              <span className="text-muted-foreground">
                صفحه {page + 1} از {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تأیید کاربر</DialogTitle>
            <DialogDescription>
              {approveTarget?.full_name} — لطفاً نقش و سمت سازمانی را تعیین کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>
                نقش <span className="text-destructive">*</span>
              </Label>
              <Select value={selRole} onValueChange={(v) => setSelRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>سمت سازمانی</Label>
              <Input
                value={selPosition}
                onChange={(e) => setSelPosition(e.target.value)}
                placeholder="مثال: کارشناس فروش"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              انصراف
            </Button>
            <Button
              disabled={!selRole || approveMut.isPending}
              onClick={() =>
                approveTarget &&
                approveMut.mutate({
                  userId: approveTarget.id,
                  role: selRole,
                  position: selPosition,
                })
              }
            >
              {approveMut.isPending ? "در حال تأیید..." : "تأیید و فعال‌سازی"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>رد ثبت‌نام</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از رد کاربر «{rejectTarget?.full_name}» مطمئن هستید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">توضیح (اختیاری)</Label>
            <Input
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="دلیل رد..."
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                rejectTarget && rejectMut.mutate({ userId: rejectTarget.id, notes: rejectNotes })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              رد کاربر
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Dialog */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>غیرفعال‌سازی کاربر</AlertDialogTitle>
            <AlertDialogDescription>
              «{deactivateTarget?.full_name}» دیگر نمی‌تواند وارد سامانه شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateTarget && deactivateMut.mutate(deactivateTarget.id)}
            >
              غیرفعال کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate Dialog */}
      <AlertDialog open={!!reactivateTarget} onOpenChange={(o) => !o && setReactivateTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>فعال‌سازی مجدد کاربر</AlertDialogTitle>
            <AlertDialogDescription>
              «{reactivateTarget?.full_name}» می‌تواند دوباره وارد سامانه شود (نقش‌های قبلی حفظ
              می‌شوند).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reactivateTarget && reactivateMut.mutate(reactivateTarget.id)}
            >
              فعال‌سازی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UserDetailsDialog target={detailsTarget} onClose={() => setDetailsTarget(null)} />

      <RoleManagerDialog
        userId={roleManageTarget?.id ?? null}
        userName={roleManageTarget?.full_name}
        open={!!roleManageTarget}
        onOpenChange={(o) => !o && setRoleManageTarget(null)}
      />
    </div>
  );
}

function UserDetailsDialog({ target, onClose }: { target: Row | null; onClose: () => void }) {
  const { data: fields = [] } = useQuery({
    queryKey: ["profile-fields-all"],
    queryFn: () => fetchActiveProfileFields(),
    enabled: !!target,
  });
  const { data: values = {} } = useQuery({
    queryKey: ["profile-field-values", target?.id],
    queryFn: () => fetchProfileFieldValues(target!.id),
    enabled: !!target,
  });

  if (!target) return null;

  const renderValue = (_fieldName: string, type: string, raw: unknown) => {
    if (raw == null || raw === "") return "—";
    if (type === "days" && Array.isArray(raw)) {
      return raw.map((v) => WEEK_DAYS.find((d) => d.value === v)?.label ?? v).join("، ");
    }
    if (Array.isArray(raw)) return raw.join("، ");
    return String(raw);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>جزئیات کاربر</DialogTitle>
          <DialogDescription>{target.full_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">تلفن: </span>
            <span dir="ltr">{target.phone ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">سمت: </span>
            {target.position ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">وضعیت: </span>
            {target.status}
          </div>
          <div className="border-t pt-2">
            <p className="mb-2 font-medium">اطلاعات تکمیلی</p>
            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">فیلد فعالی تعریف نشده.</p>
            ) : (
              <dl className="space-y-1.5">
                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="flex justify-between gap-2 border-b border-dashed pb-1.5 last:border-0"
                  >
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="font-medium">
                      {renderValue(
                        f.name,
                        f.field_type,
                        (values as Record<string, unknown>)[f.name],
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
