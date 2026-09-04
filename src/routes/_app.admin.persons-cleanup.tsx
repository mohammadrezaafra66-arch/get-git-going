/**
 * A-5a — completing, or removing, the people the Asan import left half-finished.
 *
 * WHY THIS PAGE EXISTS. Importing the Asan person list produced rows with no Asan code and
 * no mobile number. Both absences are load-bearing: `require_asan_code` refuses a receipt,
 * a payment and a dual document for a person with no code, and `create_sales_quote_with_items`
 * refuses a pre-invoice for one with no phone. So an incomplete person is not untidy data,
 * it is a person nobody can transact with.
 *
 * WHY A RE-IMPORT IS NOT ENOUGH. `asan_commit_person_batch` matches a spreadsheet row to an
 * existing person by an identifier that row already carries, and its identifier inserts are
 * additive — so re-importing DOES complete anyone who holds one of the two. Measured on the
 * test server: of 90 people, 14 hold both, 3 hold only a code, 21 only a mobile. The
 * remaining **52 hold neither**, and for those a re-import has nothing to match on: it
 * creates a duplicate person instead of completing the existing one. This page is for those
 * 52, and it is why the completion has to be done by hand.
 *
 * WHY DELETION LIVES HERE TOO. The two answers to "this record is wrong" are opposites of the
 * same question — complete it, or it should never have existed. Splitting them across two
 * screens would mean an admin who cannot complete a record has nowhere to go. The delete
 * dialog COUNTS FIRST: it calls person_delete_blockers before offering the button, so nobody
 * is ever one click away from removing somebody who has forty pre-invoices.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It writes identifiers through
 * `createPersonIdentifier` — the same server function the person edit page uses — rather
 * than through a second insert path of its own. Normalisation, the cross-person duplicate
 * check, the Persian error messages and the audit triggers are all already there; a private
 * shortcut would drift from them. Nor does it offer a "force" delete: a person with history
 * is refused, and the refusal names what would have been lost.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { useDebounce } from "@/hooks/use-debounce";
import { toFaDigits } from "@/lib/i18n/formatters";
import { toError } from "@/lib/server-fn-error";
import { createPersonIdentifier } from "@/lib/persons/identifiers.functions";
import { normalizeIdentifier } from "@/lib/persons/identifiers-normalize";

import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * A hard ceiling on the listing.
 *
 * The population is ~90 people and the completeness filter has to run client-side —
 * "has no identifier of kind X" is not expressible as a PostgREST filter on an embedded
 * resource. The limit is what stops that being true at ten thousand people as well: past it
 * the page says so out loud rather than quietly showing a subset. Search narrows server-side
 * and is debounced.
 */
const LIST_LIMIT = 300;

type IdentifierRow = {
  kind: string;
  value_normalized: string | null;
  status: string;
  is_primary: boolean;
};

type PersonRow = {
  id: string;
  display_name: string;
  kind: string;
  is_active: boolean;
  created_at: string;
  person_identifiers: IdentifierRow[];
};

type Blocker = { ref_table: string; ref_label: string; row_count: number };

type Enriched = {
  id: string;
  displayName: string;
  kind: string;
  isActive: boolean;
  asanCode: string | null;
  mobile: string | null;
};

function enrich(p: PersonRow): Enriched {
  const active = (p.person_identifiers ?? []).filter((i) => i.status !== "revoked");
  const pick = (kind: string) =>
    active.find((i) => i.kind === kind && i.is_primary)?.value_normalized ??
    active.find((i) => i.kind === kind)?.value_normalized ??
    null;
  return {
    id: p.id,
    displayName: p.display_name,
    kind: p.kind,
    isActive: p.is_active,
    asanCode: pick("asan_person_code"),
    mobile: pick("mobile_e164"),
  };
}

async function authHeaders(): Promise<{ Authorization: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
  return { Authorization: `Bearer ${token}` };
}

/** One missing identifier, editable in place. Renders nothing once the value exists. */
function IdentifierCell({
  personId,
  kind,
  value,
  placeholder,
  onSaved,
}: {
  personId: string;
  kind: "asan_person_code" | "mobile_e164";
  value: string | null;
  placeholder: string;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState("");
  const createFn = useServerFn(createPersonIdentifier);

  const save = useMutation({
    mutationFn: async () => {
      const headers = await authHeaders();
      return toError(
        createFn({
          headers,
          data: {
            person_id: personId,
            kind,
            value_raw: draft,
            // The admin is copying the value out of Asan or off a contract, not guessing
            // at it, and this is the person's only identifier of this kind — so it is the
            // confirmed, primary one.
            status: "confirmed",
            is_primary: true,
          },
        }),
      );
    },
    onSuccess: () => {
      toast.success("شناسه ثبت شد");
      setDraft("");
      onSaved();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "ثبت شناسه ناموفق بود");
    },
  });

  if (value) {
    return (
      <span className="font-mono text-sm" dir="ltr">
        {toFaDigits(value)}
      </span>
    );
  }

  // The same normaliser the server runs, used here only to say "this will be refused"
  // before the round trip. The server still normalises and still decides.
  const check = draft.trim() ? normalizeIdentifier(kind, draft) : null;
  const localError = check && !check.ok ? check.message_fa : null;

  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-8 w-36 font-mono text-sm"
          dir="ltr"
          aria-label={placeholder}
          disabled={save.isPending}
        />
        {localError ? <p className="mt-1 text-xs text-destructive">{localError}</p> : null}
      </div>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        aria-label="ثبت"
        disabled={!draft.trim() || !!localError || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

/** Count first, then offer the button — never the other way round. */
function DeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: Enriched | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const blockers = useQuery({
    queryKey: ["person-delete-blockers", target?.id],
    enabled: !!target,
    // Never served from cache: the whole point is that this number is current.
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        // Not in the generated Database types yet (migration 435); the codebase's
        // established idiom for that is a cast, not a hand-edit of the generated file.
        "person_delete_blockers" as never,
        { p_person_id: target?.id } as never,
      );
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Blocker[];
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "person_delete" as never,
        {
          p_person_id: target?.id,
        } as never,
      );
      // The Persian refusal is composed by the RPC and names the dependants; show it as-is.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("شخص حذف شد");
      onDeleted();
      onClose();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "حذف ناموفق بود");
    },
  });

  const rows = blockers.data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.row_count), 0);
  const canDelete = blockers.isSuccess && total === 0;

  return (
    <Dialog open={!!target} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>حذف «{target?.displayName}»</DialogTitle>
          <DialogDescription>
            پیش از حذف، هر رکوردی که به این شخص وابسته است شمرده می‌شود.
          </DialogDescription>
        </DialogHeader>

        {blockers.isPending ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            در حال بررسی وابستگی‌ها…
          </div>
        ) : blockers.isError ? (
          <p className="py-4 text-sm text-destructive">
            {blockers.error instanceof Error ? blockers.error.message : "بررسی ناموفق بود"}
          </p>
        ) : total === 0 ? (
          <div className="space-y-2 py-2">
            <p className="text-sm">
              هیچ سابقه‌ای برای این شخص ثبت نشده است. پروندهٔ مشتری و شناسه‌های او هم همراه خودش حذف
              می‌شوند.
            </p>
            <p className="text-sm font-medium text-destructive">این حذف برگشت‌پذیر نیست.</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                این شخص {toFaDigits(total)} رکورد وابسته دارد و حذف نمی‌شود. سابقهٔ او باید حفظ شود؛
                به‌جای حذف، کد آسان و موبایل او را کامل کنید.
              </span>
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">مورد</TableHead>
                  <TableHead className="text-right">تعداد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.ref_table}>
                    <TableCell>{r.ref_label}</TableCell>
                    <TableCell>{toFaDigits(r.row_count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            variant="destructive"
            disabled={!canDelete || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            حذف قطعی
          </Button>
          <Button variant="outline" onClick={onClose} disabled={remove.isPending}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonsCleanupPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 350);
  const [onlyIncomplete, setOnlyIncomplete] = useState(true);
  const [target, setTarget] = useState<Enriched | null>(null);

  const list = useQuery({
    queryKey: ["persons-cleanup", debounced],
    queryFn: async (): Promise<PersonRow[]> => {
      const columns =
        "id, display_name, kind, is_active, created_at, person_identifiers(kind, value_normalized, status, is_primary)";

      // A digit search is almost always an Asan code or a phone number being pasted in, and
      // those live on the child table. Resolving them to person ids first is one extra
      // indexed query; matching only on display_name would silently fail the common case.
      let idsFromIdentifier: string[] | null = null;
      if (debounced && /\d/.test(debounced)) {
        const { data, error } = await supabase
          .from("person_identifiers")
          .select("person_id")
          .neq("status", "revoked")
          .ilike("value_normalized", `%${debounced.replace(/^\+?98/, "")}%`)
          .limit(LIST_LIMIT);
        if (error) throw new Error(error.message);
        idsFromIdentifier = (data ?? []).map((r) => r.person_id as string);
      }

      const byName = supabase
        .from("persons")
        .select(columns)
        .order("display_name", { ascending: true })
        .limit(LIST_LIMIT);
      const { data: named, error: namedErr } = await (debounced
        ? byName.ilike("display_name", `%${debounced}%`)
        : byName);
      if (namedErr) throw new Error(namedErr.message);

      const merged = new Map<string, PersonRow>();
      for (const r of (named ?? []) as unknown as PersonRow[]) merged.set(r.id, r);

      if (idsFromIdentifier?.length) {
        const { data: byId, error: byIdErr } = await supabase
          .from("persons")
          .select(columns)
          .in("id", idsFromIdentifier)
          .limit(LIST_LIMIT);
        if (byIdErr) throw new Error(byIdErr.message);
        for (const r of (byId ?? []) as unknown as PersonRow[]) merged.set(r.id, r);
      }

      return [...merged.values()].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, "fa"),
      );
    },
  });

  const all = useMemo(() => (list.data ?? []).map(enrich), [list.data]);
  const incomplete = useMemo(() => all.filter((p) => !p.asanCode || !p.mobile), [all]);
  const neither = useMemo(() => all.filter((p) => !p.asanCode && !p.mobile), [all]);
  const shown = onlyIncomplete ? incomplete : all;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["persons-cleanup"] });
    void qc.invalidateQueries({ queryKey: ["person-delete-blockers"] });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <PageHeader
        title="تکمیل و پاک‌سازی پروندهٔ اشخاص"
        description="کسانی که کد آسان یا شمارهٔ موبایل ندارند. تا این دو تکمیل نشود نمی‌توان برایشان دریافت، پرداخت یا پیش‌فاکتور ثبت کرد. اگر شخصی اشتباهی وارد شده و هیچ سابقه‌ای ندارد، می‌توانید حذفش کنید."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">نمایش‌داده‌شده</p>
            <p className="text-2xl font-bold">{toFaDigits(all.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">ناقص</p>
            <p className="text-2xl font-bold text-amber-600">{toFaDigits(incomplete.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">بدون کد و بدون موبایل</p>
            <p className="text-2xl font-bold text-destructive">{toFaDigits(neither.length)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجو بر اساس نام، کد آسان یا موبایل"
            className="pr-9"
            aria-label="جست‌وجوی شخص"
          />
        </div>
        <Button
          variant={onlyIncomplete ? "default" : "outline"}
          onClick={() => setOnlyIncomplete(true)}
        >
          فقط ناقص‌ها
        </Button>
        <Button
          variant={onlyIncomplete ? "outline" : "default"}
          onClick={() => setOnlyIncomplete(false)}
        >
          همه
        </Button>
      </div>

      {all.length >= LIST_LIMIT ? (
        <p className="text-sm text-amber-700">
          فهرست به {toFaDigits(LIST_LIMIT)} ردیف محدود شده است؛ برای دیدن بقیه جست‌وجو کنید.
        </p>
      ) : null}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {list.isPending ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال بارگذاری…
            </div>
          ) : list.isError ? (
            <p className="p-6 text-sm text-destructive">
              {list.error instanceof Error ? list.error.message : "بارگذاری ناموفق بود"}
            </p>
          ) : shown.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">موردی یافت نشد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">نام</TableHead>
                  <TableHead className="text-right">کد آسان</TableHead>
                  <TableHead className="text-right">موبایل</TableHead>
                  <TableHead className="text-right">وضعیت</TableHead>
                  <TableHead className="text-right">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.displayName}
                      {!p.isActive ? (
                        <Badge variant="outline" className="mr-2 text-muted-foreground">
                          غیرفعال
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <IdentifierCell
                        personId={p.id}
                        kind="asan_person_code"
                        value={p.asanCode}
                        placeholder="کد آسان"
                        onSaved={refresh}
                      />
                    </TableCell>
                    <TableCell>
                      <IdentifierCell
                        personId={p.id}
                        kind="mobile_e164"
                        value={p.mobile}
                        placeholder="09121234567"
                        onSaved={refresh}
                      />
                    </TableCell>
                    <TableCell>
                      {p.asanCode && p.mobile ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          کامل
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500 text-white hover:bg-amber-500">ناقص</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTarget(p)}
                        aria-label={`حذف ${p.displayName}`}
                      >
                        <Trash2 className="ml-1 h-4 w-4" />
                        حذف
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DeleteDialog target={target} onClose={() => setTarget(null)} onDeleted={refresh} />
    </div>
  );
}

export const Route = createFileRoute("/_app/admin/persons-cleanup")({
  beforeLoad: async () => {
    await requireAnyRole(["admin"]);
  },
  component: PersonsCleanupPage,
});
