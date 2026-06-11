import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Play, Eye, EyeOff, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { requirePermission } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/bot-api-keys/playground")({
  beforeLoad: async () => { await requirePermission("bot-api-keys", "view"); },
  component: ApiPlaygroundPage,
});

type EndpointDef = {
  id: string;
  group: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  label: string;
  path: string; // template e.g. /api/public/bot/dynamic-tables/{tableId}/rows
  needs: { tableId?: boolean; rowId?: boolean; body?: boolean; bearer?: boolean };
  defaultBody?: string;
};

export const ENDPOINTS: EndpointDef[] = [
  {
    id: "bot-get-rows",
    group: "Bot API – Dynamic Tables",
    method: "GET",
    label: "خواندن ردیف‌های جدول",
    path: "/api/public/bot/dynamic-tables/{tableId}/rows",
    needs: { tableId: true, bearer: true },
  },
  {
    id: "bot-patch-row",
    group: "Bot API – Dynamic Tables",
    method: "PATCH",
    label: "به‌روزرسانی یک ردیف",
    path: "/api/public/bot/dynamic-tables/{tableId}/rows/{rowId}",
    needs: { tableId: true, rowId: true, body: true, bearer: true },
    defaultBody: `{\n  "values": {\n    "column_key": "value"\n  }\n}`,
  },
  {
    id: "bot-create-row",
    group: "Bot API – Dynamic Tables",
    method: "POST",
    label: "افزودن ردیف جدید",
    path: "/api/public/bot/dynamic-tables/{tableId}/rows",
    needs: { tableId: true, body: true, bearer: true },
    defaultBody: `{\n  "values": {\n    "source": "rubika",\n    "title": "نمونه داده استخراج‌شده",\n    "message": "این یک پیام تستی از ربات است",\n    "status": "new"\n  }\n}`,
  },
];

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("کپی شد.");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("کپی ناموفق بود."); }
  };
  return (
    <div className="relative">
      {lang && (
        <Badge variant="secondary" className="absolute top-2 left-2 z-10 font-mono text-[10px]">
          {lang}
        </Badge>
      )}
      <Button type="button" size="sm" variant="outline" onClick={copy}
        className="absolute top-2 right-2 z-10 h-7">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 pt-10 text-xs font-mono leading-relaxed" dir="ltr">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ApiPlaygroundPage() {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const [endpointId, setEndpointId] = useState<string>(ENDPOINTS[0].id);
  const endpoint = useMemo(
    () => ENDPOINTS.find((e) => e.id === endpointId) ?? ENDPOINTS[0],
    [endpointId],
  );

  const [bearer, setBearer] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [tableId, setTableId] = useState("");
  const [rowId, setRowId] = useState("");
  const [body, setBody] = useState(endpoint.defaultBody ?? "");

  const [busy, setBusy] = useState(false);
  const [resStatus, setResStatus] = useState<number | null>(null);
  const [resBody, setResBody] = useState("");

  const onChangeEndpoint = (id: string) => {
    setEndpointId(id);
    const ep = ENDPOINTS.find((e) => e.id === id);
    setBody(ep?.defaultBody ?? "");
    setResStatus(null);
    setResBody("");
  };

  const buildUrl = () => {
    let p = endpoint.path;
    if (endpoint.needs.tableId) p = p.replace("{tableId}", encodeURIComponent(tableId.trim()));
    if (endpoint.needs.rowId) p = p.replace("{rowId}", encodeURIComponent(rowId.trim()));
    return `${baseUrl}${p}`;
  };

  const send = async () => {
    if (endpoint.needs.bearer && !bearer.trim()) { toast.error("کلید Bearer را وارد کنید."); return; }
    if (endpoint.needs.tableId && !tableId.trim()) { toast.error("tableId الزامی است."); return; }
    if (endpoint.needs.rowId && !rowId.trim()) { toast.error("rowId الزامی است."); return; }

    let payload: string | undefined;
    if (endpoint.needs.body) {
      try { JSON.parse(body); payload = body; }
      catch { toast.error("بدنه JSON معتبر نیست."); return; }
    }

    setBusy(true); setResStatus(null); setResBody("");
    try {
      const init: RequestInit = {
        method: endpoint.method,
        headers: {
          ...(endpoint.needs.bearer ? { Authorization: `Bearer ${bearer.trim()}` } : {}),
          ...(endpoint.needs.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(payload ? { body: payload } : {}),
      };
      const res = await fetch(buildUrl(), init);
      setResStatus(res.status);
      const text = await res.text();
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try { setResBody(JSON.stringify(JSON.parse(text), null, 2)); }
        catch { setResBody(text); }
      } else {
        setResBody(text || "(پاسخ خالی)");
      }
    } catch (e: unknown) {
      setResStatus(0);
      setResBody(`خطای شبکه: ${(e as Error)?.message ?? "نامشخص"}`);
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    const m = new Map<string, EndpointDef[]>();
    for (const e of ENDPOINTS) {
      if (!m.has(e.group)) m.set(e.group, []);
      m.get(e.group)!.push(e);
    }
    return Array.from(m.entries());
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Bot API Playground</h1>
      <PageHeader
        title="API Playground"
        description="انتخاب endpoint و تست زنده درخواست‌ها"
        actions={
          <Button asChild variant="outline">
            <Link to="/bot-api-keys"><ArrowLeft className="ml-2 h-4 w-4" />بازگشت</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">انتخاب endpoint</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Endpoint</Label>
            <Select value={endpointId} onValueChange={onChangeEndpoint}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {groups.map(([groupName, items]) => (
                  <SelectGroup key={groupName}>
                    <SelectLabel>{groupName}</SelectLabel>
                    {items.map((ep) => (
                      <SelectItem key={ep.id} value={ep.id}>
                        <span className="font-mono text-[10px] me-2">{ep.method}</span>
                        {ep.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">URL</Label>
            <CodeBlock lang={endpoint.method} code={`${endpoint.method} ${endpoint.path}`} />
          </div>

          {endpoint.needs.bearer && (
            <div className="space-y-1">
              <Label className="text-xs">Authorization (Bearer)</Label>
              <div className="flex gap-2">
                <Input
                  type={showKey ? "text" : "password"}
                  dir="ltr" placeholder="bk_…" value={bearer}
                  onChange={(e) => setBearer(e.target.value)}
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowKey((s) => !s)}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {endpoint.needs.tableId && (
              <div className="space-y-1">
                <Label className="text-xs">tableId (UUID)</Label>
                <Input dir="ltr" value={tableId} onChange={(e) => setTableId(e.target.value)} className="font-mono" />
              </div>
            )}
            {endpoint.needs.rowId && (
              <div className="space-y-1">
                <Label className="text-xs">rowId (UUID)</Label>
                <Input dir="ltr" value={rowId} onChange={(e) => setRowId(e.target.value)} className="font-mono" />
              </div>
            )}
          </div>

          {endpoint.needs.body && (
            <div className="space-y-1">
              <Label className="text-xs">Body (JSON)</Label>
              <Textarea dir="ltr" rows={8} value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-xs" />
            </div>
          )}

          <Button onClick={send} disabled={busy}>
            {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}
            ارسال درخواست
          </Button>
        </CardContent>
      </Card>

      {(resStatus !== null || resBody) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              پاسخ
              {resStatus !== null && (
                <Badge variant={resStatus >= 200 && resStatus < 300 ? "secondary" : "destructive"}>
                  HTTP {resStatus}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock lang="json" code={resBody || "(خالی)"} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}