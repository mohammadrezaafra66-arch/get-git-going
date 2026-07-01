import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Plug, Save, Download, Info } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatJalaliDateTime } from "@/lib/messenger/format";

export const Route = createFileRoute("/_app/operations/didar")({
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: OperationsDidarPage,
});

const KEY_URL = "didar_api_url";
const KEY_API = "didar_api_key";

type DidarContact = { Id?: string; id?: string; [k: string]: unknown };

function toDidarId(c: DidarContact): string | null {
  const raw = c.Id ?? c.id;
  return raw ? String(raw) : null;
}

async function callDidar(baseUrl: string, apiKey: string, path: string) {
  const url = baseUrl.replace(/\/+$/, "") + path;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = (body && (body.message || body.Message)) || res.statusText || "خطای ناشناخته";
    throw new Error(`${res.status} — ${msg}`);
  }
  return body;
}

function extractContacts(payload: any): DidarContact[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.Response?.List)) return payload.Response.List;
  if (Array.isArray(payload.Response)) return payload.Response;
  if (Array.isArray(payload.Data)) return payload.Data;
  if (Array.isArray(payload.Items)) return payload.Items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function extractTotal(payload: any): number | null {
  if (!payload) return null;
  return (
    payload.Response?.Total ??
    payload.Total ??
    payload.total ??
    payload.Count ??
    payload.count ??
    null
  );
}

function OperationsDidarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["didar", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_settings")
        .select("key, value")
        .in("key", [KEY_URL, KEY_API]);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[(row as any).key] = (row as any).value ?? "";
      return { url: map[KEY_URL] ?? "", apiKey: map[KEY_API] ?? "" };
    },
  });

  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number | null } | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setUrl(settingsQuery.data.url);
      setApiKey(settingsQuery.data.apiKey);
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = [
        { key: KEY_URL, value: url.trim(), updated_by: user?.id ?? null },
        { key: KEY_API, value: apiKey.trim(), updated_by: user?.id ?? null },
      ];
      const { error } = await supabase.from("shop_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد");
      qc.invalidateQueries({ queryKey: ["didar", "settings"] });
    },
    onError: (e: unknown) => toast.error(`ذخیره ناموفق: ${(e as Error).message}`),
  });

  const statsQuery = useQuery({
    queryKey: ["didar", "contact-stats"],
    queryFn: async () => {
      const { count } = await supabase
        .from("didar_import_log")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "contact");
      const { data: latest } = await supabase
        .from("didar_import_log")
        .select("imported_at")
        .eq("entity_type", "contact")
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { count: count ?? 0, lastAt: latest?.imported_at ?? null };
    },
  });

  const bothEmpty = !url.trim() || !apiKey.trim();

  const handleTest = async () => {
    if (bothEmpty) {
      toast.error("آدرس API و کلید API الزامی هستند");
      return;
    }
    setTesting(true);
    try {
      const body = await callDidar(url.trim(), apiKey.trim(), "/contacts?page=1&size=1");
      const total = extractTotal(body);
      toast.success(total != null ? `اتصال موفق — تعداد مخاطبین: ${total}` : "اتصال موفق");
    } catch (e) {
      toast.error(`اتصال ناموفق: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleImport = async () => {
    if (bothEmpty) {
      toast.error("آدرس API و کلید API الزامی هستند");
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: null });
    try {
      // Preflight
      const first = await callDidar(url.trim(), apiKey.trim(), "/contacts?page=1&size=1");
      let total = extractTotal(first);
      setProgress({ done: 0, total: typeof total === "number" ? total : null });

      const pageSize = 100;
      let page = 1;
      let done = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const body = await callDidar(
          url.trim(),
          apiKey.trim(),
          `/contacts?page=${page}&size=${pageSize}`,
        );
        const contacts = extractContacts(body);
        if (contacts.length === 0) break;

        const rows = contacts
          .map((c) => {
            const did = toDidarId(c);
            if (!did) return null;
            return {
              entity_type: "contact" as const,
              didar_id: did,
              action: "created" as const,
              raw_data: c as any,
            };
          })
          .filter(Boolean) as Array<{
          entity_type: "contact";
          didar_id: string;
          action: "created";
          raw_data: any;
        }>;

        if (rows.length > 0) {
          const { error } = await supabase
            .from("didar_import_log")
            .upsert(rows, { onConflict: "entity_type,didar_id" });
          if (error) throw error;
        }

        done += contacts.length;
        setProgress({ done, total: typeof total === "number" ? total : null });

        if (contacts.length < pageSize) break;
        page += 1;
        if (page > 1000) break; // safety
      }

      toast.success(`import کامل شد — ${done} مخاطب`);
      qc.invalidateQueries({ queryKey: ["didar", "contact-stats"] });
    } catch (e) {
      toast.error(`import ناموفق: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader title="یکپارچه‌سازی دیدار CRM" description="تنظیمات اتصال و import مخاطبین" />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          کلید API فقط برای مدیران قابل مشاهده است و در جدول shop_settings ذخیره می‌شود.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4" />
            تنظیمات دیدار
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="didar-url">آدرس API</Label>
            <Input
              id="didar-url"
              placeholder="https://app.didar.me/api/v2"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={settingsQuery.isLoading}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="didar-key">کلید API</Label>
            <div className="flex gap-2">
              <Input
                id="didar-key"
                type={showKey ? "text" : "password"}
                placeholder="API Key دیدار"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={settingsQuery.isLoading}
                dir="ltr"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "مخفی کردن کلید" : "نمایش کلید"}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || settingsQuery.isLoading}
            >
              {saveMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="ml-2 h-4 w-4" />
              )}
              ذخیره تنظیمات
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={bothEmpty || testing || importing}
            >
              {testing ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="ml-2 h-4 w-4" />
              )}
              تست اتصال
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            import مخاطبین
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleImport} disabled={bothEmpty || importing || testing}>
            {importing ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="ml-2 h-4 w-4" />
            )}
            import مخاطبین از دیدار
          </Button>
          {progress ? (
            <p className="text-sm text-muted-foreground">
              {progress.total != null
                ? `${progress.done.toLocaleString("fa-IR")} مخاطب import شد از ${progress.total.toLocaleString("fa-IR")}`
                : `${progress.done.toLocaleString("fa-IR")} مخاطب import شد`}
            </p>
          ) : null}
          {bothEmpty ? (
            <p className="text-xs text-muted-foreground">
              برای فعال‌سازی، ابتدا آدرس API و کلید API را وارد و ذخیره کنید.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">آمار</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">تعداد کل مخاطبین import‌شده</p>
            <p className="mt-1 text-2xl font-bold">
              {statsQuery.isLoading
                ? "…"
                : (statsQuery.data?.count ?? 0).toLocaleString("fa-IR")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">آخرین import</p>
            <p className="mt-1 text-sm">
              {statsQuery.isLoading
                ? "…"
                : statsQuery.data?.lastAt
                  ? formatJalaliDateTime(statsQuery.data.lastAt)
                  : "—"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function extractContactName(raw: any): string {
  if (!raw || typeof raw !== "object") return "بدون نام";
  const first = raw.FirstName ?? raw.firstName ?? raw.first_name ?? "";
  const last = raw.LastName ?? raw.lastName ?? raw.last_name ?? "";
  const full = `${first ?? ""} ${last ?? ""}`.trim();
  if (full) return full;
  return raw.name ?? raw.Name ?? raw.DisplayName ?? raw.displayName ?? raw.title ?? "بدون نام";
}

function extractContactPhone(raw: any): string {
  if (!raw || typeof raw !== "object") return "";
  const direct =
    raw.Mobile ?? raw.mobile ?? raw.Phone ?? raw.phone ?? raw.PhoneNumber ?? raw.phoneNumber;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const list = raw.Mobiles ?? raw.mobiles ?? raw.Phones ?? raw.phones;
  if (Array.isArray(list) && list.length > 0) {
    const v = list[0];
    if (typeof v === "string") return v;
    if (v && typeof v === "object") return v.Number ?? v.number ?? v.value ?? "";
  }
  return "";
}