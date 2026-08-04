import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, PhoneOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * ASAN M3.2 — the phone collision review queue.
 *
 * Two different records normalise to one phone number. The firm decision in the
 * brief is that the system flags it and stops: it never merges automatically and
 * never picks a winner. So this page deliberately has no merge button.
 * `/persons/merge` remains the only merge path, and resolving here records a
 * judgement without moving any data.
 *
 * Detection lives in `public.detect_phone_collisions()` so that the rule is in
 * the database rather than in this component — a direct PostgREST write is
 * normalised by a trigger and picked up by the next detection run either way.
 */

type EntityRef = { table: string; id: string; label: string | null };

type Collision = {
  id: string;
  normalized_phone: string;
  entity_refs: EntityRef[];
  detected_at: string;
  status: "pending" | "resolved" | "ignored";
  resolution_note: string | null;
  resolved_at: string | null;
};

const TABLE_LABEL: Record<string, string> = {
  customers: "مشتری",
  suppliers: "تأمین‌کننده",
  external_parties: "طرف حساب",
  profiles: "کاربر",
  visitors: "ویزیتور",
};

const STATUS_LABEL: Record<Collision["status"], string> = {
  pending: "در انتظار بررسی",
  resolved: "بررسی‌شده",
  ignored: "نادیده گرفته شد",
};

export const Route = createFileRoute("/_app/admin/phone-collisions")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: PhoneCollisionsPage,
});

function PhoneCollisionsPage() {
  const { roles, user } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("manager");

  const [rows, setRows] = useState<Collision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("phone_collisions")
      .select(
        "id, normalized_phone, entity_refs, detected_at, status, resolution_note, resolved_at",
      )
      .order("status", { ascending: true })
      .order("detected_at", { ascending: false });
    if (error) {
      toast.error(`خواندن فهرست ناموفق بود: ${error.message}`);
    } else {
      setRows((data ?? []) as unknown as Collision[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  async function rescan() {
    setScanning(true);
    const { data, error } = await supabase.rpc("detect_phone_collisions" as never);
    setScanning(false);
    if (error) {
      toast.error(`بررسی مجدد ناموفق بود: ${error.message}`);
      return;
    }
    const found = typeof data === "number" ? data : 0;
    toast.success(found > 0 ? `${found} تداخل تازه ثبت شد` : "تداخل تازه‌ای پیدا نشد");
    void load();
  }

  async function resolve(row: Collision, status: "resolved" | "ignored") {
    setBusyId(row.id);
    const { error } = await supabase
      .from("phone_collisions")
      .update({
        status,
        resolved_by: user?.id ?? null,
        resolved_at: new Date().toISOString(),
        resolution_note: notes[row.id]?.trim() || null,
      } as never)
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast.error(`ثبت تصمیم ناموفق بود: ${error.message}`);
      return;
    }
    toast.success("تصمیم ثبت شد. هیچ رکوردی ادغام نشد.");
    void load();
  }

  if (!allowed) {
    return <div className="p-6 text-muted-foreground">دسترسی ندارید.</div>;
  }

  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="تداخل شماره تلفن"
        description="شماره‌هایی که پس از یکسان‌سازی به بیش از یک رکورد می‌خورند"
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {pending.length > 0
            ? `${pending.length} مورد در انتظار بررسی`
            : "موردی در انتظار بررسی نیست"}
        </div>
        <Button variant="outline" onClick={rescan} disabled={scanning}>
          {scanning ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="ml-2 h-4 w-4" />
          )}
          بررسی مجدد
        </Button>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        این صفحه فقط گزارش می‌دهد. هیچ رکوردی به‌صورت خودکار ادغام نمی‌شود و سامانه هیچ‌وقت خودش یکی
        از دو رکورد را انتخاب نمی‌کند. برای ادغام واقعی از صفحهٔ «ادغام اشخاص» استفاده کنید.
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
          <PhoneOff className="h-8 w-8" />
          هیچ تداخلی ثبت نشده است.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره یکسان‌شده</TableHead>
                <TableHead>رکوردهای درگیر</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>تصمیم</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono whitespace-nowrap">
                    {row.normalized_phone}
                  </TableCell>
                  <TableCell>
                    <ul className="space-y-1">
                      {(row.entity_refs ?? []).map((ref) => (
                        <li key={`${ref.table}-${ref.id}`} className="text-sm">
                          <Badge variant="secondary" className="ml-2">
                            {TABLE_LABEL[ref.table] ?? ref.table}
                          </Badge>
                          {ref.label ?? "—"}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "pending" ? "destructive" : "outline"}>
                      {STATUS_LABEL[row.status]}
                    </Badge>
                    {row.resolution_note && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.resolution_note}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[16rem]">
                    {row.status === "pending" ? (
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          placeholder="توضیح تصمیم (اختیاری)"
                          value={notes[row.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => resolve(row, "resolved")}
                          >
                            بررسی شد
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => resolve(row, "ignored")}
                          >
                            نادیده بگیر
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {row.resolved_at ? new Date(row.resolved_at).toLocaleString("fa-IR") : "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
