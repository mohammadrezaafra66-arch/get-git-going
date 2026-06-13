import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Power, Download, Pencil } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { CURRENCY_LABELS } from "@/lib/pricing/constants";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import { useServerFn } from "@tanstack/react-start";
import { autoFetchCurrencyRate } from "@/lib/currency-sources.functions";

export const Route = createFileRoute("/_app/pricing/currency-sources")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: CurrencySourcesPage,
});

type SourceRow = {
  id: string;
  name: string;
  url: string | null;
  has_api_key: boolean;
  is_active: boolean;
  created_at: string;
};

function CurrencySourcesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "accountant"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [fetchOpen, setFetchOpen] = useState<SourceRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["currency-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currency_sources")
        .select("id, name, url, is_active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Strip api_key from the client-side row shape; only expose a boolean.
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        url: (r.url as string | null) ?? null,
        has_api_key: false,
        is_active: Boolean(r.is_active),
        created_at: r.created_at as string,
      })) as SourceRow[];
    },
    staleTime: 60_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["currency-sources"] });

  const toggleActive = async (s: SourceRow) => {
    if (!canWrite) return;
    const { error } = await supabase
      .from("currency_sources")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(s.is_active ? "منبع غیرفعال شد" : "منبع فعال شد");
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="منابع نرخ ارز"
        description="منابع دریافت خودکار نرخ ارز را مدیریت کنید. نرخ‌های دریافتی پس از تأیید قابل استفاده هستند."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/pricing">
                <ArrowRight className="ms-1 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="ms-1 h-4 w-4" />
                منبع جدید
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : !data || data.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              منبعی تعریف نشده است.
            </div>
          ) : (
            <ul className="divide-y">
              {data.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      {s.is_active ? (
                        <Badge variant="default">فعال</Badge>
                      ) : (
                        <Badge variant="outline">غیرفعال</Badge>
                      )}
                    </div>
                    {s.url && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {s.url}
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setFetchOpen(s)}
                        disabled={!s.is_active}
                      >
                        <Download className="ms-1 h-3 w-3" />
                        دریافت نرخ
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          setEditing(s);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="ms-1 h-3 w-3" />
                        ویرایش
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => toggleActive(s)}
                      >
                        <Power
                          className={`ms-1 h-3 w-3 ${s.is_active ? "text-destructive" : ""}`}
                        />
                        {s.is_active ? "غیرفعال" : "فعال"}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SourceDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={refresh} />
      <FetchDialog
        source={fetchOpen}
        onOpenChange={(v) => !v && setFetchOpen(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["currency-rate-fetches"] });
        }}
      />
    </div>
  );
}

function SourceDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SourceRow | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  // Sync editing
  const isOpen = open;
  useState(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  if (isOpen) {
    // initialize once when dialog opens
  }

  const reset = () => {
    setName(editing?.name ?? "");
    setUrl(editing?.url ?? "");
    // Never preload the stored api_key into the client. Blank = keep as is on update.
    setApiKey("");
    setIsActive(editing?.is_active ?? true);
  };

  // initialize fields when dialog opens or editing changes
  // simple effect via key-controlled mount
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش منبع" : "منبع نرخ ارز جدید"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>نام منبع *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: TGJU، Bonbast"
            />
          </div>
          <div>
            <Label>URL منبع</Label>
            <Input
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/usd"
            />
          </div>
          <div>
            <Label>API Key</Label>
            <Input
              dir="ltr"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing ? "بدون تغییر — برای جایگزینی، مقدار جدید وارد کنید" : "اختیاری"}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>فعال</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            disabled={loading || !name.trim()}
            onClick={async () => {
              if (url && !/^https?:\/\//i.test(url)) {
                toast.error("URL باید با http یا https شروع شود.");
                return;
              }
              setLoading(true);
              try {
                const payload: Record<string, unknown> = {
                  name: name.trim(),
                  url: url || null,
                  is_active: isActive,
                };
                if (!editing) {
                  payload.api_key = apiKey || null;
                } else if (apiKey.trim().length > 0) {
                  payload.api_key = apiKey;
                }
                const op = editing
                  ? supabase
                      .from("currency_sources")
                      .update(payload as never)
                      .eq("id", editing.id)
                  : supabase.from("currency_sources").insert(payload as never);
                const { error } = await op;
                if (error) throw error;
                const { data: u } = await supabase.auth.getUser();
                // Redact api_key before persisting to audit log.
                const auditDiff: Record<string, unknown> = { ...payload };
                if ("api_key" in auditDiff) {
                  auditDiff.api_key = auditDiff.api_key ? "[REDACTED]" : null;
                }
                await supabase.from("audit_logs").insert({
                  action: editing ? "currency_source_updated" : "currency_source_created",
                  entity_type: "currency_sources",
                  entity_id: editing?.id ?? "new",
                  actor_id: u.user?.id ?? null,
                  diff: auditDiff as never,
                } as never);
                toast.success(editing ? "منبع ویرایش شد" : "منبع ثبت شد");
                onSaved();
                onOpenChange(false);
              } catch (e: any) {
                toast.error(e?.message ?? "خطا");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FetchDialog({
  source,
  onOpenChange,
  onSaved,
}: {
  source: SourceRow | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [currency, setCurrency] = useState<"usd" | "aed">("usd");
  const [rate, setRate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [autoFetching, setAutoFetching] = useState(false);
  const autoFetchFn = useServerFn(autoFetchCurrencyRate);

  const tryAutoFetch = async () => {
    if (!source?.url) {
      toast.error("URL منبع تعریف نشده است.");
      return;
    }
    setAutoFetching(true);
    try {
      const { rate: parsed } = await autoFetchFn({ data: { sourceId: source.id, currency } });
      setRate(String(parsed));
      toast.success("نرخ از منبع دریافت شد، لطفاً تأیید نهایی کنید.");
    } catch (e: any) {
      toast.error(
        `خطا در دریافت از منبع: ${e?.message ?? "نامشخص"}. می‌توانید نرخ را دستی وارد کنید.`,
      );
    } finally {
      setAutoFetching(false);
    }
  };

  const submit = async () => {
    if (!source) return;
    const r = Number(rate);
    if (!Number.isFinite(r) || r <= 0) {
      toast.error("نرخ معتبر وارد کنید.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.rpc("record_currency_fetch", {
        p_source_id: source.id,
        p_currency: currency,
        p_rate: r,
        p_note: undefined,
      });
      if (error) throw error;
      toast.success("نرخ ثبت شد و در انتظار تأیید قرار گرفت.");
      onSaved();
      onOpenChange(false);
      setRate("");
    } catch (e: any) {
      const msg = e?.message ?? "خطا در ثبت نرخ";
      toast.error(
        msg.includes("rate limit") ? "محدودیت ۱۰ بار در ساعت برای این منبع فعال است." : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!source} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>دریافت نرخ از {source?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>ارز</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as "usd" | "aed")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">{CURRENCY_LABELS.usd}</SelectItem>
                <SelectItem value="aed">{CURRENCY_LABELS.aed}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {source?.url && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={tryAutoFetch}
              disabled={autoFetching}
              className="w-full"
            >
              {autoFetching && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
              دریافت خودکار از URL
            </Button>
          )}
          <div>
            <Label>نرخ به تومان *</Label>
            <Input
              type="number"
              inputMode="numeric"
              dir="ltr"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              نرخ به‌صورت در انتظار تأیید ذخیره می‌شود و فقط پس از تأیید در محاسبات استفاده خواهد
              شد.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ثبت برای تأیید
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
