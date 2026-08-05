import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toError } from "@/lib/server-fn-error";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  createPersonIdentifier,
  revokePersonIdentifier,
  type PersonIdentifierDTO,
} from "@/lib/persons/identifiers.functions";
import {
  IDENTIFIER_KINDS,
  normalizeIdentifier,
  type IdentifierKind,
} from "@/lib/persons/identifiers-normalize";

const KIND_LABEL: Record<IdentifierKind, string> = {
  mobile_e164: "موبایل",
  landline: "تلفن ثابت",
  national_id_ir: "کد ملی",
  tax_id_ir: "شناسه مالیاتی",
  company_reg_id_ir: "شماره ثبت",
  email: "ایمیل",
  iban: "شبا",
  custom: "سفارشی",
  asan_person_code: "کد حساب آسان",
};

const STATUS_LABEL: Record<PersonIdentifierDTO["status"], string> = {
  provisional: "موقت",
  confirmed: "تأییدشده",
  revoked: "ابطال‌شده",
};

async function authHeaders(): Promise<{ Authorization: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
  }
  return { Authorization: `Bearer ${token}` };
}

function statusBadge(s: PersonIdentifierDTO["status"]) {
  if (s === "confirmed")
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{STATUS_LABEL[s]}</Badge>
    );
  if (s === "revoked")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {STATUS_LABEL[s]}
      </Badge>
    );
  return <Badge className="bg-amber-500 text-white hover:bg-amber-500">{STATUS_LABEL[s]}</Badge>;
}

/** An identifier collected before the person exists (create page, Phase 6.4). */
export interface DraftIdentifier {
  kind: IdentifierKind;
  value_raw: string;
  status: "provisional" | "confirmed";
  is_primary: boolean;
}

/**
 * Two modes, one component (Phase 6.4).
 *
 * PERSISTED — `personId` is set. Adding or revoking hits the server immediately.
 *             This is the person edit page and is the original behaviour.
 * DRAFT     — `personId` is undefined and `draft` is supplied. The person does
 *             not exist yet, so there is nothing to attach to: rows accumulate
 *             in the parent's state and are sent with person_create_full when
 *             the form is submitted, which creates and normalizes them in one
 *             transaction.
 *
 * A second component was deliberately not built. The picker, the kind list, the
 * validation and the table must not drift apart between create and edit.
 */
export function PersonIdentifiersForm({
  personId,
  identifiers,
  canManage,
  draft,
}: {
  personId?: string;
  identifiers: PersonIdentifierDTO[];
  canManage: boolean;
  draft?: {
    items: DraftIdentifier[];
    onAdd: (item: DraftIdentifier) => void;
    onRemove: (index: number) => void;
  };
}) {
  const isDraft = !personId && !!draft;
  const qc = useQueryClient();
  const createFn = useServerFn(createPersonIdentifier);
  const revokeFn = useServerFn(revokePersonIdentifier);

  const [kind, setKind] = useState<IdentifierKind>("mobile_e164");
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isPrimary, setIsPrimary] = useState(false);

  const createMut = useMutation({
    mutationFn: async () => {
      const headers = await authHeaders();
      return toError(
        createFn({
          headers,
          data: {
            person_id: personId,
            kind,
            value_raw: value,
            status: confirmed ? "confirmed" : "provisional",
            is_primary: isPrimary,
          },
        }),
      );
    },
    onSuccess: () => {
      toast.success("شناسه افزوده شد");
      setValue("");
      setIsPrimary(false);
      setConfirmed(false);
      qc.invalidateQueries({ queryKey: ["person", personId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "افزودن شناسه ناموفق بود");
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      const headers = await authHeaders();
      return toError(revokeFn({ headers, data: { id } }));
    },
    onSuccess: () => {
      toast.success("شناسه ابطال شد");
      qc.invalidateQueries({ queryKey: ["person", personId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "ابطال شناسه ناموفق بود");
    },
  });

  return (
    <div className="space-y-4" dir="rtl">
      {canManage && (
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label>نوع شناسه</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as IdentifierKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDENTIFIER_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>مقدار</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="مقدار شناسه (نرمال‌سازی روی سرور انجام می‌شود)"
              dir="ltr"
              maxLength={512}
            />
          </div>
          <Button
            type="button"
            onClick={() => {
              if (isDraft) {
                // Validate client-side so the user is not told "invalid" only
                // after submitting the whole form. The DB re-normalizes and
                // remains authoritative (migration 228).
                const norm = normalizeIdentifier(kind, value);
                if (!norm.ok) {
                  toast.error(norm.message_fa);
                  return;
                }
                draft!.onAdd({
                  kind,
                  value_raw: value.trim(),
                  status: confirmed ? "confirmed" : "provisional",
                  is_primary: isPrimary,
                });
                setValue("");
                setIsPrimary(false);
                setConfirmed(false);
                return;
              }
              createMut.mutate();
            }}
            disabled={createMut.isPending || !value.trim()}
          >
            {createMut.isPending ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="ml-2 h-4 w-4" />
            )}
            افزودن
          </Button>
          <div className="flex items-center gap-3 sm:col-span-3">
            <div className="flex items-center gap-2">
              <Switch id="id-confirmed" checked={confirmed} onCheckedChange={setConfirmed} />
              <Label htmlFor="id-confirmed" className="text-sm">
                تأییدشده
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="id-primary" checked={isPrimary} onCheckedChange={setIsPrimary} />
              <Label htmlFor="id-primary" className="text-sm">
                شناسه اصلی
              </Label>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>نوع</TableHead>
              <TableHead>مقدار نرمال‌شده</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead>اصلی</TableHead>
              {canManage && <TableHead className="text-left">عملیات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Draft rows: not saved yet, so the normalized value shown here is
                the client-side preview. The server recomputes it on submit. */}
            {isDraft &&
              draft!.items.map((d, i) => {
                const preview = normalizeIdentifier(d.kind, d.value_raw);
                return (
                  <TableRow key={`draft-${i}`}>
                    <TableCell>{KIND_LABEL[d.kind]}</TableCell>
                    <TableCell dir="ltr" className="font-mono text-sm">
                      {preview.ok ? preview.value_normalized : d.value_raw}
                    </TableCell>
                    <TableCell>{statusBadge(d.status)}</TableCell>
                    <TableCell>{d.is_primary ? "بله" : "—"}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => draft!.onRemove(i)}>
                          <Trash2 className="ml-1 h-3 w-3" /> حذف
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            {identifiers.length === 0 && (!isDraft || draft!.items.length === 0) ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 5 : 4}
                  className="py-6 text-center text-muted-foreground"
                >
                  شناسه‌ای ثبت نشده است.
                </TableCell>
              </TableRow>
            ) : (
              identifiers.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{KIND_LABEL[r.kind]}</TableCell>
                  <TableCell dir="ltr" className="break-all font-mono text-sm">
                    {r.value_normalized}
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell>{r.is_primary ? "بله" : "—"}</TableCell>
                  {canManage && (
                    <TableCell>
                      {r.status !== "revoked" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => revokeMut.mutate(r.id)}
                          disabled={revokeMut.isPending}
                        >
                          <Trash2 className="ml-1 h-3 w-3" /> ابطال
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
