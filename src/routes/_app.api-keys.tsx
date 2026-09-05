import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Plus, Loader2, Copy, Check, Trash2, History } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { sha256Hex } from "@/lib/utils/sha256";

export const Route = createFileRoute("/_app/api-keys")({
  // M6/OG-24 — mirrors the guard below. `requireAdmin`/`requireAnyRole` return WITHOUT
  // throwing during SSR and while roles are still loading, so on a COLD page load the
  // page renders for anyone. Measured on this branch before this line was added:
  // test.viewer opened /api-keys directly and saw the full page. RouteRoleGate in _app
  // reads this staticData and enforces the same rule on the client.
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: ApiKeysGovernancePage,
});

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  managed_by_role: string | null;
}

interface AuditRow {
  id: string;
  key_id: string | null;
  key_name: string | null;
  action: string;
  reason: string | null;
  performed_at: string;
  performed_by: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRawKey(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return `afk_${bytesToHex(bytes)}`;
}

function actionLabel(action: string): string {
  switch (action) {
    case "create":
      return "ایجاد";
    case "activate":
      return "فعال‌سازی";
    case "deactivate":
      return "غیرفعال‌سازی";
    case "delete":
      return "حذف";
    case "view_key":
      return "مشاهده کلید";
    case "rotate":
      return "چرخش";
    default:
      return action;
  }
}

function ApiKeysGovernancePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [revealed, setRevealed] = useState<{ id: string; raw: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteRow, setDeleteRow] = useState<ApiKeyRow | null>(null);
  const [historyRow, setHistoryRow] = useState<ApiKeyRow | null>(null);

  const keysQuery = useQuery({
    enabled: !!user,
    queryKey: ["api-keys-governance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_keys")
        .select(
          "id, name, key_prefix, is_active, created_at, expires_at, last_used_at, managed_by_role",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKeyRow[];
    },
  });

  async function writeAudit(params: {
    action: string;
    keyId: string | null;
    keyName: string | null;
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
    if (error) console.error("audit log insert failed:", error.message);
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("نام کلید الزامی است");
      if (!user) throw new Error("کاربر معتبر نیست");
      const rawKey = generateRawKey();
      const keyHash = await sha256Hex(rawKey);
      const keyPrefix = rawKey.slice(0, 12); // "afk_" + 8 chars
      const { data, error } = await supabase
        .from("bot_api_keys")
        .insert({
          name,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          is_active: true,
          created_by: user.id,
          managed_by_role: newRole.trim() || null,
          allowed_table_ids: [],
        })
        .select("id, name")
        .single();
      if (error) throw error;
      await writeAudit({
        action: "create",
        keyId: data.id,
        keyName: data.name,
        reason: "ایجاد کلید جدید",
      });
      return { id: data.id, raw: rawKey };
    },
    onSuccess: (row) => {
      setRevealed(row);
      setCreateOpen(false);
      setNewName("");
      setNewRole("");
      qc.invalidateQueries({ queryKey: ["api-keys-governance"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطا در ساخت کلید";
      toast.error(msg);
    },
  });

  const toggleMut = useMutation({
    mutationFn: async (vars: { row: ApiKeyRow; nextActive: boolean }) => {
      const { error } = await supabase
        .from("bot_api_keys")
        .update({ is_active: vars.nextActive })
        .eq("id", vars.row.id);
      if (error) throw error;
      await writeAudit({
        action: vars.nextActive ? "activate" : "deactivate",
        keyId: vars.row.id,
        keyName: vars.row.name,
      });
    },
    onSuccess: (_d, v) => {
      toast.success(v.nextActive ? "کلید فعال شد" : "کلید غیرفعال شد");
      qc.invalidateQueries({ queryKey: ["api-keys-governance"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطا";
      toast.error(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (row: ApiKeyRow) => {
      // Write audit first so the FK reference (key_id) is captured before delete;
      // key_id is nullable so the row remains after the key is removed.
      await writeAudit({
        action: "delete",
        keyId: row.id,
        keyName: row.name,
        reason: "حذف کلید",
      });
      const { error } = await supabase.from("bot_api_keys").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("کلید حذف شد");
      qc.invalidateQueries({ queryKey: ["api-keys-governance"] });
      setDeleteRow(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطا در حذف کلید";
      toast.error(msg);
    },
  });

  const historyQuery = useQuery({
    enabled: !!historyRow,
    queryKey: ["api-key-history", historyRow?.id],
    queryFn: async () => {
      if (!historyRow) return [] as AuditRow[];
      const { data, error } = await supabase
        .from("bot_api_key_audit_log")
        .select("id, key_id, key_name, action, reason, performed_at, performed_by")
        .eq("key_id", historyRow.id)
        .order("performed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  async function copyRevealed() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("در کلیپ‌بورد کپی شد");
    } catch {
      toast.error("کپی ناموفق بود");
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="sr-only">حاکمیت کلیدهای API</h1>
      <PageHeader
        title="حاکمیت کلیدهای API"
        description="ایجاد، فعال/غیرفعال، حذف و مشاهده تاریخچه کلیدهای API — دسترسی فقط برای مدیر"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="ml-2 h-4 w-4" />
            کلید جدید
          </Button>
        }
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
                description="با دکمه «کلید جدید» اولین کلید API را بسازید."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام</TableHead>
                    <TableHead>پیشوند</TableHead>
                    <TableHead>نقش مدیریتی</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>تاریخ ایجاد</TableHead>
                    <TableHead>تاریخ انقضا</TableHead>
                    <TableHead>آخرین استفاده</TableHead>
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
                        <TableCell className="text-sm text-muted-foreground">
                          {k.managed_by_role ?? "—"}
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
                          {formatDateFa(k.created_at)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {k.expires_at ? formatDateFa(k.expires_at) : "—"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {k.last_used_at ? formatDateTimeFa(k.last_used_at) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 justify-end">
                            <label className="flex items-center gap-1 text-xs">
                              <Switch
                                checked={k.is_active}
                                onCheckedChange={(v) =>
                                  toggleMut.mutate({ row: k, nextActive: v })
                                }
                                disabled={toggleMut.isPending}
                              />
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setHistoryRow(k)}
                            >
                              <History className="ml-1 h-3.5 w-3.5" />
                              تاریخچه
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteRow(k)}
                              aria-label="حذف کلید"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(v) => {
          if (!v && !createMut.isPending) {
            setCreateOpen(false);
            setNewName("");
            setNewRole("");
          }
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>ایجاد کلید API جدید</DialogTitle>
            <DialogDescription>
              کلید فقط یک‌بار پس از ساخت نمایش داده می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="key-name">نام کلید</Label>
              <Input
                id="key-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثلاً: ربات وردپرس"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="key-role">نقش مدیریتی (اختیاری)</Label>
              <Input
                id="key-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder="مثلاً: integration"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMut.isPending}
            >
              انصراف
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !newName.trim()}
            >
              {createMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ساخت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal-once dialog */}
      <Dialog
        open={!!revealed}
        onOpenChange={(v) => {
          if (!v) setRevealed(null);
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>کلید API ساخته شد</DialogTitle>
            <DialogDescription className="text-destructive">
              این کلید دیگر نمایش داده نخواهد شد — همین حالا کپی و در محل امن ذخیره کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={revealed?.raw ?? ""}
              className="font-mono text-xs"
              dir="ltr"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="outline" onClick={copyRevealed}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>بستم و ذخیره کردم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog
        open={!!historyRow}
        onOpenChange={(v) => {
          if (!v) setHistoryRow(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تاریخچه کلید: {historyRow?.name}</DialogTitle>
            <DialogDescription>رویدادهای ثبت‌شده برای این کلید</DialogDescription>
          </DialogHeader>
          {historyQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (historyQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              رویدادی ثبت نشده است.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>زمان</TableHead>
                    <TableHead>عملیات</TableHead>
                    <TableHead>دلیل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(historyQuery.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateTimeFa(row.performed_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {actionLabel(row.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryRow(null)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteRow}
        onOpenChange={(v) => {
          if (!v) setDeleteRow(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کلید API</AlertDialogTitle>
            <AlertDialogDescription>
              این عملیات برگشت‌ناپذیر است. کلید حذف خواهد شد و تمام درخواست‌های آینده با آن رد
              می‌شود.
              {deleteRow && (
                <span className="block mt-2 font-medium text-foreground">{deleteRow.name}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteRow) deleteMut.mutate(deleteRow);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
