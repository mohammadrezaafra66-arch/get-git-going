import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { IDENTIFIER_KINDS, type IdentifierKind } from "@/lib/persons/identifiers-normalize";

const KIND_LABEL: Record<IdentifierKind, string> = {
  mobile_e164: "موبایل",
  landline: "تلفن ثابت",
  national_id_ir: "کد ملی",
  tax_id_ir: "شناسه مالیاتی",
  company_reg_id_ir: "شماره ثبت",
  email: "ایمیل",
  iban: "شبا",
  custom: "سفارشی",
};

const STATUS_LABEL: Record<PersonIdentifierDTO["status"], string> = {
  provisional: "موقت",
  confirmed: "تأییدشده",
  revoked: "ابطال‌شده",
};

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

export function PersonIdentifiersForm({
  personId,
  identifiers,
  canManage,
}: {
  personId: string;
  identifiers: PersonIdentifierDTO[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createPersonIdentifier);
  const revokeFn = useServerFn(revokePersonIdentifier);

  const [kind, setKind] = useState<IdentifierKind>("mobile_e164");
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isPrimary, setIsPrimary] = useState(false);

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          person_id: personId,
          kind,
          value_raw: value,
          status: confirmed ? "confirmed" : "provisional",
          is_primary: isPrimary,
        },
      }),
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
    mutationFn: (id: string) => revokeFn({ data: { id } }),
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
            onClick={() => createMut.mutate()}
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
            {identifiers.length === 0 ? (
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
                  <TableCell dir="ltr" className="font-mono text-sm">
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
