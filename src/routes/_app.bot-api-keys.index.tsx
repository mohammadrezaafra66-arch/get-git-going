import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  KeyRound, Plus, Loader2, Copy, Check, Eye, EyeOff, Trash2, Settings2, Activity, BookOpen, FlaskConical, Tags,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/bot-api-keys/")({
  beforeLoad: async () => { await requirePermission("bot-api-keys", "view"); },
  component: BotApiKeysPage,
});

interface BotKey {
  id: string;
  name: string;
  key_prefix: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

interface DynamicTableRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface AccessRow {
  id: string;
  api_key_id: string;
  table_id: string;
  can_read: boolean;
  can_update: boolean;
  allowed_update_columns: string[];
}

interface ColumnRow {
  id: string;
  table_id: string;
  column_key: string;
  label: string;
}

function BotApiKeysPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newExpires, setNewExpires] = useState<string>("");
  const [revealedKey, setRevealedKey] = useState<{ id: string; raw: string; prefix: string } | null>(null);
  const [accessKey, setAccessKey] = useState<BotKey | null>(null);
  const [labelKey, setLabelKey] = useState<BotKey | null>(null);

  const keysQuery = useQuery({
    enabled: !!user,
    queryKey: ["bot-api-keys"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_keys")
        .select("id, name, key_prefix, is_active, created_at, last_used_at, expires_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BotKey[];
    },
  });

  const statsQuery = useQuery({
    enabled: !!user,
    queryKey: ["bot-api-key-stats-today"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bot_key_stats_today");
      if (error) throw error;
      const map = new Map<string, { requests_today: number; errors_today: number; last_used_at: string | null }>();
      for (const r of (data ?? [])) {
        map.set(r.api_key_id, {
          requests_today: Number(r.requests_today ?? 0),
          errors_today: Number(r.errors_today ?? 0),
          last_used_at: r.last_used_at ?? null,
        });
      }
      return map;
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const expIso = newExpires ? new Date(newExpires).toISOString() : null;
      const { data, error } = await supabase.rpc("create_bot_api_key", {
        p_name: newName.trim(),
        p_expires_at: expIso ?? undefined,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { id: string; raw_key: string; key_prefix: string } | null;
      if (!row) throw new Error("پاسخ نامعتبر");
      return row;
    },
    onSuccess: (row) => {
      toast.success("کلید جدید ساخته شد. این کلید را اکنون کپی کنید — دیگر نمایش داده نمی‌شود.");
      setRevealedKey({ id: row.id, raw: row.raw_key, prefix: row.key_prefix });
      setCreateOpen(false);
      setNewName(""); setNewExpires("");
      qc.invalidateQueries({ queryKey: ["bot-api-keys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ساخت کلید"),
  });

  const toggleMut = useMutation({
    mutationFn: async (vars: { id: string; isActive: boolean }) => {
      const { error } = await supabase.rpc("set_bot_api_key_active", {
        p_key_id: vars.id, p_is_active: vars.isActive,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.isActive ? "کلید فعال شد." : "کلید غیرفعال شد.");
      qc.invalidateQueries({ queryKey: ["bot-api-keys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Bot API Keys</h1>
      <PageHeader
        title="کلیدهای API ربات"
        description="ساخت و مدیریت کلیدهای امن برای دسترسی ربات‌ها به جداول داده پویا"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/bot-api-keys/docs">
              <Button variant="outline">
                <BookOpen className="ml-2 h-4 w-4" />مستندات و تست API
              </Button>
            </Link>
            <Link to="/bot-api-keys/playground">
              <Button variant="outline">
                <FlaskConical className="ml-2 h-4 w-4" />API Playground
              </Button>
            </Link>
            <Link to="/bot-api-keys/usage">
              <Button variant="outline">
                <Activity className="ml-2 h-4 w-4" />گزارش استفاده
              </Button>
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="ml-2 h-4 w-4" />کلید جدید
            </Button>
          </div>
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
                title="کلیدی ساخته نشده است"
                description="با دکمه «کلید جدید» اولین کلید API ربات را بسازید."
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(keysQuery.data ?? []).map((k) => {
                const expired = k.expires_at ? new Date(k.expires_at).getTime() < Date.now() : false;
                const stat = statsQuery.data?.get(k.id);
                const lastUsed = stat?.last_used_at ?? k.last_used_at;
                return (
                  <div key={k.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{k.name}</span>
                        <span className="text-xs font-mono text-muted-foreground" dir="ltr">
                          {k.key_prefix ?? "—"}…
                        </span>
                        {!k.is_active && <Badge variant="secondary">غیرفعال</Badge>}
                        {expired && <Badge variant="destructive">منقضی</Badge>}
                        <Badge variant="outline" className="text-xs">
                          امروز: {stat?.requests_today ?? 0}
                        </Badge>
                        {(stat?.errors_today ?? 0) > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            خطا: {stat?.errors_today}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        <span>ساخت: {formatDateTimeFa(k.created_at)}</span>
                        {k.expires_at && <span>انقضا: {formatDateTimeFa(k.expires_at)}</span>}
                        <span>آخرین استفاده: {lastUsed ? formatDateTimeFa(lastUsed) : "—"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setAccessKey(k)}>
                        <Settings2 className="ml-2 h-4 w-4" />دسترسی جداول
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setLabelKey(k)}>
                        <Tags className="ml-2 h-4 w-4" />دسترسی برچسب محصولات
                      </Button>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={k.is_active}
                          onCheckedChange={(v) => toggleMut.mutate({ id: k.id, isActive: v })}
                          disabled={toggleMut.isPending}
                        />
                        فعال
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ساخت کلید API ربات جدید</DialogTitle>
            <DialogDescription>
              نام توصیفی برای کلید انتخاب کنید. در صورت تعیین تاریخ انقضا، کلید پس از آن قابل استفاده نخواهد بود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>نام کلید</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثلاً ربات تلگرام فروش" />
            </div>
            <div className="space-y-1">
              <Label>تاریخ انقضا (اختیاری)</Label>
              <Input type="datetime-local" dir="ltr" value={newExpires} onChange={(e) => setNewExpires(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMut.isPending}>انصراف</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !newName.trim()}>
              {createMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ساخت کلید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal-once dialog */}
      <RevealKeyDialog
        revealed={revealedKey}
        onClose={() => setRevealedKey(null)}
      />

      {/* Access management dialog */}
      <AccessDialog
        botKey={accessKey}
        onClose={() => setAccessKey(null)}
      />

      {/* Product label access dialog */}
      <LabelAccessDialog
        botKey={labelKey}
        onClose={() => setLabelKey(null)}
      />
    </div>
  );
}

function RevealKeyDialog({
  revealed, onClose,
}: { revealed: { id: string; raw: string; prefix: string } | null; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const open = !!revealed;

  const copy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.raw);
      setCopied(true);
      toast.success("کلید کپی شد.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("کپی ناموفق بود؛ لطفاً دستی انتخاب و کپی کنید.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setShown(false); setCopied(false); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>کلید جدید آماده شد</DialogTitle>
          <DialogDescription className="text-destructive">
            این کلید فقط همین یک‌بار نمایش داده می‌شود. آن را در محل امن ذخیره کنید.
          </DialogDescription>
        </DialogHeader>
        {revealed && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-sm break-all" dir="ltr">
              {shown ? revealed.raw : "•".repeat(revealed.raw.length)}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShown((s) => !s)}>
                {shown ? <EyeOff className="ml-2 h-4 w-4" /> : <Eye className="ml-2 h-4 w-4" />}
                {shown ? "پنهان" : "نمایش"}
              </Button>
              <Button size="sm" onClick={copy}>
                {copied ? <Check className="ml-2 h-4 w-4" /> : <Copy className="ml-2 h-4 w-4" />}
                کپی
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => { onClose(); setShown(false); setCopied(false); }}>متوجه شدم، بستن</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessDialog({ botKey, onClose }: { botKey: BotKey | null; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!botKey;
  const [selectedTableId, setSelectedTableId] = useState<string>("");

  const tablesQuery = useQuery({
    enabled: open,
    queryKey: ["dynamic-tables-min"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dynamic_tables")
        .select("id, name, slug, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DynamicTableRow[];
    },
  });

  const accessQuery = useQuery({
    enabled: open && !!botKey,
    queryKey: ["bot-api-key-access", botKey?.id],
    staleTime: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_key_table_access")
        .select("id, api_key_id, table_id, can_read, can_update, allowed_update_columns")
        .eq("api_key_id", botKey!.id);
      if (error) throw error;
      return (data ?? []) as unknown as AccessRow[];
    },
  });

  const tables = tablesQuery.data ?? [];
  const access = accessQuery.data ?? [];
  const linkedIds = useMemo(() => new Set(access.map((a) => a.table_id)), [access]);
  const unlinkedTables = useMemo(() => tables.filter((t) => !linkedIds.has(t.id)), [tables, linkedIds]);

  const addAccessMut = useMutation({
    mutationFn: async (tableId: string) => {
      const { error } = await supabase.rpc("set_bot_api_key_table_access", {
        p_key_id: botKey!.id, p_table_id: tableId,
        p_can_read: true, p_can_update: false, p_allowed_update_columns: [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("جدول به کلید افزوده شد.");
      qc.invalidateQueries({ queryKey: ["bot-api-key-access", botKey?.id] });
      setSelectedTableId("");
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>دسترسی جداول — {botKey?.name}</DialogTitle>
          <DialogDescription>
            مشخص کنید این کلید به کدام جداول و با چه مجوزهایی دسترسی دارد.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new table to access list */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">افزودن جدول جدید</Label>
              <Select value={selectedTableId} onValueChange={setSelectedTableId}>
                <SelectTrigger><SelectValue placeholder="یک جدول انتخاب کنید" /></SelectTrigger>
                <SelectContent>
                  {unlinkedTables.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">جدول جدیدی برای افزودن نیست.</div>
                  )}
                  {unlinkedTables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => addAccessMut.mutate(selectedTableId)}
              disabled={!selectedTableId || addAccessMut.isPending}
            >
              <Plus className="ml-2 h-4 w-4" />افزودن
            </Button>
          </div>

          {/* Existing access list */}
          <div className="space-y-2">
            {accessQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : access.length === 0 ? (
              <p className="text-sm text-muted-foreground">جدولی به این کلید متصل نشده است.</p>
            ) : (
              access.map((a) => {
                const tbl = tables.find((t) => t.id === a.table_id);
                return (
                  <AccessRowCard
                    key={a.id}
                    keyId={botKey!.id}
                    access={a}
                    tableName={tbl?.name ?? "نامشخص"}
                  />
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>بستن</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessRowCard({
  keyId, access, tableName,
}: { keyId: string; access: AccessRow; tableName: string }) {
  const qc = useQueryClient();
  const [canRead, setCanRead] = useState(access.can_read);
  const [canUpdate, setCanUpdate] = useState(access.can_update);
  const [allowedCols, setAllowedCols] = useState<string[]>(access.allowed_update_columns ?? []);

  const colsQuery = useQuery({
    queryKey: ["dynamic-table-columns-mini", access.table_id],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dynamic_table_columns")
        .select("id, table_id, column_key, label")
        .eq("table_id", access.table_id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ColumnRow[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_bot_api_key_table_access", {
        p_key_id: keyId,
        p_table_id: access.table_id,
        p_can_read: canRead,
        p_can_update: canUpdate,
        p_allowed_update_columns: canUpdate ? allowedCols : [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ذخیره شد.");
      qc.invalidateQueries({ queryKey: ["bot-api-key-access", keyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ذخیره"),
  });

  const removeMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_bot_api_key_table_access", {
        p_key_id: keyId, p_table_id: access.table_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("حذف شد.");
      qc.invalidateQueries({ queryKey: ["bot-api-key-access", keyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  const toggleCol = (id: string) => {
    setAllowedCols((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{tableName}</span>
        <Button size="icon" variant="ghost" onClick={() => removeMut.mutate()} disabled={removeMut.isPending} title="حذف دسترسی">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-2">
          <Switch checked={canRead} onCheckedChange={setCanRead} /> خواندن
        </label>
        <label className="flex items-center gap-2">
          <Switch checked={canUpdate} onCheckedChange={setCanUpdate} /> به‌روزرسانی
        </label>
      </div>
      {canUpdate && (
        <div className="space-y-1">
          <Label className="text-xs">ستون‌های قابل به‌روزرسانی</Label>
          {colsQuery.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (colsQuery.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">ستونی تعریف نشده است.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
              {(colsQuery.data ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={allowedCols.includes(c.id)}
                    onCheckedChange={() => toggleCol(c.id)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          ذخیره
        </Button>
      </div>
    </div>
  );
}