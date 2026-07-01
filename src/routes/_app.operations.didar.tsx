import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Plug, Save, Download, Info, Link2, Users, Trophy } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

      <ContactLinkSection />
      <GamificationEnrichmentSection />
    </div>
  );
}

function ContactLinkSection() {
  const qc = useQueryClient();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const unlinkedQuery = useQuery({
    queryKey: ["didar", "unlinked-contacts"],
    queryFn: async () => {
      const { data: linkedRows, error: linkedErr } = await supabase
        .from("customers")
        .select("didar_contact_id")
        .not("didar_contact_id", "is", null);
      if (linkedErr) throw linkedErr;
      const linkedSet = new Set(
        (linkedRows ?? []).map((r: any) => String(r.didar_contact_id)).filter(Boolean),
      );

      const { data, error } = await supabase
        .from("didar_import_log")
        .select("id, didar_id, raw_data, imported_at")
        .eq("entity_type", "contact")
        .order("imported_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).filter((r: any) => !linkedSet.has(String(r.didar_id)));
    },
  });

  const customersQuery = useQuery({
    queryKey: ["didar", "customers-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, didar_contact_id")
        .order("name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ customerId, didarId }: { customerId: string; didarId: string }) => {
      const { error } = await supabase
        .from("customers")
        .update({ didar_contact_id: didarId })
        .eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("مخاطب لینک شد");
      qc.invalidateQueries({ queryKey: ["didar", "unlinked-contacts"] });
      qc.invalidateQueries({ queryKey: ["didar", "customers-for-link"] });
    },
    onError: (e: unknown) => toast.error(`لینک ناموفق: ${(e as Error).message}`),
    onSettled: () => setPendingId(null),
  });

  const handleLink = (didarId: string) => {
    const customerId = selection[didarId];
    if (!customerId) {
      toast.error("لطفاً یک مشتری انتخاب کنید");
      return;
    }
    setPendingId(didarId);
    linkMutation.mutate({ customerId, didarId });
  };

  const rows = unlinkedQuery.data ?? [];
  const customers = customersQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          اتصال مخاطبین دیدار به مشتریان
        </CardTitle>
      </CardHeader>
      <CardContent>
        {unlinkedQuery.isLoading || customersQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            همه مخاطبین لینک شده‌اند ✓
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام مخاطب دیدار</TableHead>
                  <TableHead>تلفن</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>انتخاب مشتری</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: any) => {
                  const name = extractContactName(row.raw_data);
                  const phone = extractContactPhone(row.raw_data);
                  const didarId = String(row.didar_id);
                  const isPending = pendingId === didarId && linkMutation.isPending;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground" dir="ltr">
                        {phone || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">لینک نشده</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={selection[didarId] ?? ""}
                          onValueChange={(v) =>
                            setSelection((s) => ({ ...s, [didarId]: v }))
                          }
                          disabled={isPending}
                        >
                          <SelectTrigger className="w-64">
                            <SelectValue placeholder="یک مشتری انتخاب کنید" />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                                {c.phone ? ` — ${c.phone}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          size="sm"
                          onClick={() => handleLink(didarId)}
                          disabled={isPending || !selection[didarId]}
                        >
                          {isPending ? (
                            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Link2 className="ml-2 h-4 w-4" />
                          )}
                          لینک کن
                        </Button>
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

function GamificationEnrichmentSection() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const statsQuery = useQuery({
    queryKey: ["didar", "gamification-stats"],
    queryFn: async () => {
      const { count: totalCount, error: e1 } = await supabase
        .from("didar_activities")
        .select("id", { count: "exact", head: true });
      if (e1) throw e1;
      const { count: recordedCount, error: e2 } = await supabase
        .from("employee_score_events")
        .select("id", { count: "exact", head: true })
        .eq("source_table", "didar_activities");
      if (e2) throw e2;
      const total = totalCount ?? 0;
      const recorded = recordedCount ?? 0;
      return { total, recorded, pending: Math.max(0, total - recorded) };
    },
  });

  const handleRun = async () => {
    setRunning(true);
    setProgress({ done: 0, total: 0 });
    try {
      // 1) fetch existing recorded didar source_ids
      const recordedIds = new Set<string>();
      {
        const pageSize = 1000;
        let from = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from("employee_score_events")
            .select("source_id")
            .eq("source_table", "didar_activities")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const rows = data ?? [];
          for (const r of rows) {
            if ((r as any).source_id) recordedIds.add(String((r as any).source_id));
          }
          if (rows.length < pageSize) break;
          from += pageSize;
          if (from > 500_000) break;
        }
      }

      // 2) fetch all didar activities (paged)
      type Activity = {
        didar_id: string;
        customer_id: string | null;
        activity_type: string | null;
        occurred_at: string | null;
      };
      const activities: Activity[] = [];
      {
        const pageSize = 1000;
        let from = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from("didar_activities")
            .select("didar_id, customer_id, activity_type, occurred_at")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const rows = (data ?? []) as any[];
          for (const r of rows) {
            activities.push({
              didar_id: String(r.didar_id),
              customer_id: r.customer_id ?? null,
              activity_type: r.activity_type ?? null,
              occurred_at: r.occurred_at ?? null,
            });
          }
          if (rows.length < pageSize) break;
          from += pageSize;
          if (from > 500_000) break;
        }
      }

      const pending = activities.filter((a) => !recordedIds.has(a.didar_id));
      setProgress({ done: 0, total: pending.length });

      if (pending.length === 0) {
        toast.success("فعالیت جدیدی برای ثبت وجود ندارد");
        return;
      }

      // 3) resolve responsible_id for unique customer_ids
      const customerIds = Array.from(
        new Set(pending.map((a) => a.customer_id).filter((v): v is string => !!v)),
      );
      const responsibleMap = new Map<string, string | null>();
      if (customerIds.length > 0) {
        const chunk = 500;
        for (let i = 0; i < customerIds.length; i += chunk) {
          const slice = customerIds.slice(i, i + chunk);
          const { data, error } = await supabase
            .from("customers")
            .select("id, responsible_id")
            .in("id", slice);
          if (error) throw error;
          for (const r of (data ?? []) as any[]) {
            responsibleMap.set(String(r.id), r.responsible_id ?? null);
          }
        }
      }

      // 4) build insert rows (skip when no responsible)
      const rows = pending
        .map((a) => {
          const emp = a.customer_id ? responsibleMap.get(a.customer_id) : null;
          if (!emp) return null;
          return {
            employee_id: emp,
            event_type: "didar_activity",
            source_id: a.didar_id,
            source_table: "didar_activities",
            payload: {
              activity_type: a.activity_type,
              customer_id: a.customer_id,
              occurred_at: a.occurred_at,
            } as any,
          };
        })
        .filter(Boolean) as Array<{
          employee_id: string;
          event_type: string;
          source_id: string;
          source_table: string;
          payload: any;
        }>;

      // 5) insert in batches with progress
      let inserted = 0;
      const batch = 500;
      for (let i = 0; i < rows.length; i += batch) {
        const slice = rows.slice(i, i + batch);
        const { error } = await supabase.from("employee_score_events").insert(slice);
        if (error) throw error;
        inserted += slice.length;
        setProgress({ done: inserted, total: pending.length });
      }

      const skipped = pending.length - rows.length;
      toast.success(
        `${inserted.toLocaleString("fa-IR")} فعالیت ثبت شد` +
          (skipped > 0 ? ` — ${skipped.toLocaleString("fa-IR")} مورد بدون کارشناس مسئول رد شد` : ""),
      );
      qc.invalidateQueries({ queryKey: ["didar", "gamification-stats"] });
    } catch (e) {
      toast.error(`ثبت ناموفق: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const s = statsQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4" />
          ثبت فعالیت‌های دیدار در گیمیفیکیشن
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">کل فعالیت‌های دیدار</p>
            <p className="mt-1 text-2xl font-bold">
              {statsQuery.isLoading ? "…" : (s?.total ?? 0).toLocaleString("fa-IR")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ثبت‌شده در گیمیفیکیشن</p>
            <p className="mt-1 text-2xl font-bold">
              {statsQuery.isLoading ? "…" : (s?.recorded ?? 0).toLocaleString("fa-IR")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ثبت‌نشده</p>
            <p className="mt-1 text-2xl font-bold">
              {statsQuery.isLoading ? "…" : (s?.pending ?? 0).toLocaleString("fa-IR")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={running || statsQuery.isLoading || (s?.pending ?? 0) === 0}>
                {running ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trophy className="ml-2 h-4 w-4" />
                )}
                ثبت فعالیت‌های جدید در گیمیفیکیشن
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>تأیید ثبت فعالیت‌ها</AlertDialogTitle>
                <AlertDialogDescription>
                  {`${(s?.pending ?? 0).toLocaleString("fa-IR")} فعالیت ثبت‌نشده به‌عنوان رویداد امتیازی برای کارشناس مسئول مشتری ثبت می‌شود. مواردی که مشتری آن‌ها بدون کارشناس مسئول است رد می‌شوند.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction onClick={handleRun}>تأیید و اجرا</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {progress && progress.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              {`${progress.done.toLocaleString("fa-IR")} از ${progress.total.toLocaleString("fa-IR")} فعالیت ثبت شد`}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}