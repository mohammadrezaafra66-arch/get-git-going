import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, PowerOff, Power } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa, formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/operations/api-keys")({
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: OperationsApiKeysPage,
});

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string | null;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  managed_by_role: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  key_id: string | null;
  key_name: string | null;
  reason: string | null;
  performed_at: string;
  performed_by: string;
}

function actionLabel(a: string): string {
  switch (a) {
    case "deactivated":
      return "غیرفعال شد";
    case "reactivated":
      return "فعال شد";
    case "create":
      return "ایجاد";
    case "delete":
      return "حذف";
    case "view_key":
      return "مشاهده کلید";
    case "rotate":
      return "چرخش";
    default:
      return a;
  }
}

function OperationsApiKeysPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [deactivateRow, setDeactivateRow] = useState<ApiKeyRow | null>(null);
  const [reason, setReason] = useState("");

  const keysQuery = useQuery({
    enabled: !!user,
    queryKey: ["ops-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_keys")
        .select("id, name, key_prefix, is_active, last_used_at, expires_at, managed_by_role")
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKeyRow[];
    },
  });

  const auditQuery = useQuery({
    enabled: !!user,
    queryKey: ["ops-api-keys-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_key_audit_log")
        .select("id, action, key_id, key_name, reason, performed_at, performed_by")
        .order("performed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  async function writeAudit(params: {
    action: string;
    keyId: string;
    keyName: string;
    reason?: string | null;
  }) {
    if (!user) return;
    const { error } = await supabase.from("bot_api_key_audit_log").insert({
      action: params.action,
      key_id: params.keyId,
      key_name: params.keyName,
      performed_by: user.id,
      reason: params.reason ?? null,
    });
    if (error) console.error("audit insert failed:", error.message);
  }

  const deactivateMut = useMutation({
    mutationFn: async (vars: { row: ApiKeyRow; reason: string }) => {
      const r = vars.reason.trim();
      if (!r) throw new Error("دلیل غیرفعال‌سازی الزامی است");
      const { error } = await supabase
        .from("bot_api_keys")
        .update({ is_active: false })
        .eq("id", vars.row.id);
      if (error) throw error;
      await writeAudit({
        action: "deactivated",
        keyId: vars.row.id,
        keyName: vars.row.name,
        reason: r,
      });
    },
    onSuccess: () => {
      toast.success("کلید غیرفعال شد");
      qc.invalidateQueries({ queryKey: ["ops-api-keys"] });
      qc.invalidateQueries({ queryKey: ["ops-api-keys-audit"] });
      setDeactivateRow(null);
      setReason("");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطا در غیرفعال‌سازی";
      toast.error(msg);
    },
  });

  const reactivateMut = useMutation({
    mutationFn: async (row: ApiKeyRow) => {
      const { error } = await supabase
        .from("bot_api_keys")
        .update({ is_active: true })
        .eq("id", row.id);
      if (error) throw error;
      await writeAudit({
        action: "reactivated",
        keyId: row.id,
        keyName: row.name,
      });
    },
    onSuccess: () => {
      toast.success("کلید فعال شد");
      qc.invalidateQueries({ queryKey: ["ops-api-keys"] });
      qc.invalidateQueries({ queryKey: ["ops-api-keys-audit"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطا در فعال‌سازی";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="sr-only">حاکمیت کلیدهای API</h1>
      <PageHeader
        title="حاکمیت کلیدهای API"
        description="مدیریت وضعیت فعال/غیرفعال کلیدهای موجود — دسترسی فقط برای مدیر"
      />

      <Card>
        <CardContent className="p-0">
          {keysQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (keysQuery.data ?? []).length === 0 ? (
            <div className="py-10">
              <EmptyState
                icon={KeyRound}
                title="کلیدی ثبت نشده است"
                description="کلیدهای API ربات‌ها در این جدول قابل مدیریت خواهند بود."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام</TableHead>
                    <TableHead>پیشوند</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>آخرین استفاده</TableHead>
                    <TableHead>تاریخ انقضا</TableHead>
                    <TableHead>نقش مدیریت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(keysQuery.data ?? []).map((k) => {
                    const expired = k.expires_at
                      ? new Date(k.expires_at).getTime() < Date.now()
                      : false;
                    return (
                      <TableRow key={k.id}>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell className="font-mono text-xs" dir="ltr">
                          {k.key_prefix ?? "—"}
                        </TableCell>
                        <TableCell>
                          {k.is_active ? (
                            <Badge variant="outline">فعال</Badge>
                          ) : (
                            <Badge variant="secondary">غیرفعال</Badge>
                          )}
                          {expired && (
                            <Badge variant="destructive" className="mr-1">
                              منقضی
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {k.last_used_at ? formatDateTimeFa(k.last_used_at) : "—"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {k.expires_at ? formatDateFa(k.expires_at) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {k.managed_by_role ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 justify-end">
                            {k.is_active ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  setDeactivateRow(k);
                                  setReason("");
                                }}
                              >
                                <PowerOff className="ml-1 h-3.5 w-3.5" />
                                غیرفعال‌سازی
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => reactivateMut.mutate(k)}
                                disabled={reactivateMut.isPending}
                              >
                                <Power className="ml-1 h-3.5 w-3.5" />
                                فعال‌سازی مجدد
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">تاریخچه عملیات</h2>
            <span className="text-xs text-muted-foreground">۲۰ مورد اخیر</span>
          </div>
          {auditQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (auditQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              رویدادی ثبت نشده است.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>زمان</TableHead>
                    <TableHead>عملیات</TableHead>
                    <TableHead>کلید</TableHead>
                    <TableHead>دلیل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(auditQuery.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateTimeFa(row.performed_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {actionLabel(row.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{row.key_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {row.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deactivateRow}
        onOpenChange={(v) => {
          if (!v && !deactivateMut.isPending) {
            setDeactivateRow(null);
            setReason("");
          }
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>غیرفعال‌سازی کلید API</AlertDialogTitle>
            <AlertDialogDescription>
              پس از غیرفعال شدن، درخواست‌های آینده با این کلید رد می‌شوند. دلیل غیرفعال‌سازی
              الزامی است و در تاریخچه ثبت می‌شود.
              {deactivateRow && (
                <span className="block mt-2 font-medium text-foreground">
                  {deactivateRow.name}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">دلیل</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلاً: کلید فاش شده یا دیگر استفاده نمی‌شود"
              rows={3}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivateMut.isPending}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deactivateRow)
                  deactivateMut.mutate({ row: deactivateRow, reason });
              }}
              disabled={deactivateMut.isPending || !reason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivateMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              غیرفعال‌سازی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
