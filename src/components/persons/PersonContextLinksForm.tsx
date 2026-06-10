import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addPersonContextLink,
  endPersonContextLink,
  listPersonContextLinks,
  updatePersonContextLink,
} from "@/lib/persons/context-links.functions";
import {
  PERSON_CONTEXT_KINDS,
  type PersonContextKind,
  type PersonContextLinkDTO,
} from "@/lib/persons/context-links.schemas";

/**
 * Server functions (via `requireSupabaseAuth`) may throw a raw `Response`
 * (e.g. 401/500) instead of an `Error`. React Query stores whatever is
 * thrown, and a raw Response surfaces in window.onerror as the literal
 * string "[object Response]" — which blanks the page. Wrap every server
 * function call so the rejection is always a proper Error with a Persian
 * message, and the inline error row in the table renders normally.
 */
async function toError<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof Error) throw e;
    if (e instanceof Response) {
      let detail = "";
      try {
        detail = await e.clone().text();
      } catch {
        /* ignore */
      }
      if (e.status === 401) {
        throw new Error("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.");
      }
      throw new Error(detail || `خطای سرور (${e.status})`);
    }
    throw new Error("خطای ناشناخته در ارتباط با سرور");
  }
}

/**
 * Belt-and-suspenders: attach the bearer token at the call site.
 * Mirrors the pattern in /persons/create and /persons/$id/edit — guards
 * against the global `attachSupabaseAuth` middleware failing to run on
 * first paint, which would otherwise blank the page with "[object Response]".
 */
async function authHeaders(): Promise<{ Authorization: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
  }
  return { Authorization: `Bearer ${token}` };
}

const KIND_LABEL: Record<PersonContextKind, string> = {
  customer: "مشتری",
  supplier: "تأمین‌کننده",
  driver: "راننده",
  sender: "فرستنده",
  receiver: "گیرنده",
  referrer: "معرف",
  marketer: "بازاریاب",
  representative: "نماینده",
  complainant: "شاکی",
  returner: "مرجوع‌کننده",
  staff_link: "پرسنل",
  credit_party: "طرف اعتباری",
  accounting_party: "طرف حسابداری",
  delivery_party: "طرف تحویل",
  purchase_owner: "متصدی خرید",
  sales_expert: "کارشناس فروش",
  warehouse_owner: "متصدی انبار",
  other: "سایر",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fa-IR");
  } catch {
    return iso;
  }
}

export function PersonContextLinksForm({
  personId,
  canManage,
}: {
  personId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPersonContextLinks);
  const addFn = useServerFn(addPersonContextLink);
  const updateFn = useServerFn(updatePersonContextLink);
  const endFn = useServerFn(endPersonContextLink);

  const queryKey = ["person", personId, "context-links"] as const;
  const linksQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const headers = await authHeaders();
      return toError(listFn({ headers, data: { person_id: personId, include_ended: true } }));
    },
  });

  const [kind, setKind] = useState<PersonContextKind>("customer");
  const [note, setNote] = useState("");
  const [refTable, setRefTable] = useState("");
  const [refId, setRefId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const addMut = useMutation({
    mutationFn: async () => {
      const rt = refTable.trim() || null;
      const ri = refId.trim() || null;
      const headers = await authHeaders();
      return toError(
        addFn({
          headers,
          data: {
            person_id: personId,
            context_kind: kind,
            ref_table: rt,
            ref_id: ri,
            note: note.trim() ? note.trim() : null,
          },
        }),
      );
    },
    onSuccess: () => {
      toast.success("ارتباط افزوده شد");
      setNote("");
      setRefTable("");
      setRefId("");
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "افزودن ارتباط ناموفق بود");
    },
  });

  const updateMut = useMutation({
    mutationFn: async (vars: { id: string; note: string }) => {
      const headers = await authHeaders();
      return toError(
        updateFn({
          headers,
          data: { id: vars.id, note: vars.note.trim() ? vars.note.trim() : null },
        }),
      );
    },
    onSuccess: () => {
      toast.success("یادداشت ذخیره شد");
      setEditingId(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "ذخیره یادداشت ناموفق بود");
    },
  });

  const endMut = useMutation({
    mutationFn: async (id: string) => {
      const headers = await authHeaders();
      return toError(endFn({ headers, data: { id } }));
    },
    onSuccess: () => {
      toast.success("ارتباط بسته شد");
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "بستن ارتباط ناموفق بود");
    },
  });

  function statusBadge(row: PersonContextLinkDTO) {
    if (row.ended_at) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          بسته‌شده
        </Badge>
      );
    }
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">فعال</Badge>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {canManage && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label>نوع ارتباط</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as PersonContextKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSON_CONTEXT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>یادداشت (اختیاری)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="توضیح کوتاه درباره این ارتباط"
                maxLength={2000}
              />
            </div>
            <Button type="button" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
              {addMut.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="ml-2 h-4 w-4" />
              )}
              افزودن
            </Button>
          </div>

          <div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowAdvanced((s) => !s)}
            >
              {showAdvanced ? "بستن گزینه‌های پیشرفته" : "گزینه‌های پیشرفته (مرجع اختیاری)"}
            </button>
          </div>

          {showAdvanced && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>جدول مرجع</Label>
                <Input
                  value={refTable}
                  onChange={(e) => setRefTable(e.target.value)}
                  placeholder="مثال: customers"
                  dir="ltr"
                  maxLength={63}
                />
              </div>
              <div className="space-y-2">
                <Label>شناسه ردیف مرجع (UUID)</Label>
                <Input
                  value={refId}
                  onChange={(e) => setRefId(e.target.value)}
                  placeholder="UUID"
                  dir="ltr"
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                هر دو فیلد باید همزمان مقدار داشته باشند یا هر دو خالی بمانند.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>نوع</TableHead>
              <TableHead>مرجع</TableHead>
              <TableHead>یادداشت</TableHead>
              <TableHead>شروع</TableHead>
              <TableHead>پایان</TableHead>
              <TableHead>وضعیت</TableHead>
              {canManage && <TableHead className="text-left">عملیات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linksQuery.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 7 : 6}
                  className="py-6 text-center text-muted-foreground"
                >
                  <Loader2 className="ml-2 inline h-4 w-4 animate-spin" /> در حال بارگذاری...
                </TableCell>
              </TableRow>
            ) : linksQuery.error ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 7 : 6}
                  className="py-6 text-center text-destructive"
                >
                  بارگذاری ارتباط‌ها با خطا مواجه شد.
                </TableCell>
              </TableRow>
            ) : (linksQuery.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 7 : 6}
                  className="py-6 text-center text-muted-foreground"
                >
                  ارتباطی ثبت نشده است.
                </TableCell>
              </TableRow>
            ) : (
              (linksQuery.data ?? []).map((r) => {
                const isEditing = editingId === r.id;
                return (
                  <TableRow key={r.id}>
                    <TableCell>{KIND_LABEL[r.context_kind] ?? r.context_kind}</TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">
                      {r.ref_table ? `${r.ref_table} / ${r.ref_id?.slice(0, 8)}…` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      {isEditing ? (
                        <Textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          rows={2}
                          maxLength={2000}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{r.note || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(r.started_at)}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.ended_at)}</TableCell>
                    <TableCell>{statusBadge(r)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateMut.mutate({ id: r.id, note: editNote })}
                                disabled={updateMut.isPending}
                              >
                                <Save className="ml-1 h-3 w-3" /> ذخیره
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                <X className="ml-1 h-3 w-3" /> انصراف
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingId(r.id);
                                  setEditNote(r.note ?? "");
                                }}
                              >
                                ویرایش یادداشت
                              </Button>
                              {!r.ended_at && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => endMut.mutate(r.id)}
                                  disabled={endMut.isPending}
                                >
                                  بستن
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
