import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Merge,
  ShieldAlert,
  UserRoundCog,
  UserX,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import {
  BULK_CONFIRM_PHRASE,
  BULK_MERGE_MAX,
  isBulkMergeEligible,
  suggestMergeWinner,
} from "@/lib/persons/suggest-merge-winner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toFaDigits } from "@/lib/i18n/formatters";

const PAGE_SIZE_OPTIONS = [20, 25, 50] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

// Phase 8.1 — UI for suspected duplicate persons. Route guard lives in
// `_app.persons_.merge.tsx` (createFileRoute must not appear in this file).

interface CandidateSide {
  id: string;
  display_name: string;
  legal_name: string | null;
  kind: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  has_customer: boolean;
  has_supplier: boolean;
  has_external_party: boolean;
  reference_count: number;
  identifiers: {
    kind: string;
    value_raw: string;
    value_normalized: string;
    status: string;
    is_primary: boolean;
  }[];
  aliases: { alias: string; alias_kind: string }[];
  contexts: {
    context_kind: string;
    ref_table: string | null;
    ref_id: string | null;
    ended_at: string | null;
  }[];
}

interface Candidate {
  candidate_id: string;
  reason: string;
  detail: string | null;
  created_at: string;
  a: CandidateSide;
  b: CandidateSide;
  blocked_reason: "both_customer" | "both_supplier" | null;
}

const KIND_LABEL: Record<string, string> = {
  individual: "حقیقی",
  organization: "حقوقی",
};

const IDENTIFIER_LABEL: Record<string, string> = {
  mobile_e164: "موبایل",
  landline: "تلفن ثابت",
  national_id_ir: "کد ملی",
  tax_id_ir: "کد اقتصادی",
  company_reg_id_ir: "شناسهٔ ثبت",
  email: "ایمیل",
  iban: "شبا",
  custom: "سایر",
  asan_person_code: "کد آسان",
};

const STATUS_LABEL: Record<string, string> = {
  provisional: "تأییدنشده",
  confirmed: "تأییدشده",
  revoked: "باطل‌شده",
};

const BLOCKED_MESSAGE: Record<string, string> = {
  both_customer:
    "هر دو شخص پروندهٔ مشتری دارند. ادغام هویت، مانده‌ها و سابقهٔ اعتباری دو مشتری را در هم می‌آمیزد. ابتدا باید دو پروندهٔ مشتری به‌صورت حسابداری تعیین تکلیف شوند.",
  both_supplier:
    "هر دو شخص پروندهٔ تأمین‌کننده دارند. ادغام هویت، سابقهٔ خرید و پرداخت دو تأمین‌کننده را در هم می‌آمیزد. ابتدا باید دو پروندهٔ تأمین‌کننده تعیین تکلیف شوند.",
};

function rpcMessage(error: unknown, fallback: string): string {
  const msg = (error as { message?: string } | null)?.message;
  return msg && msg.trim() ? msg : fallback;
}

interface OverviewPage {
  items: Candidate[];
  total: number;
  limit: number;
  offset: number;
}

function winnerIds(c: Candidate): { winner: CandidateSide; loser: CandidateSide } | null {
  const suggestion = suggestMergeWinner(c.a, c.b, c.blocked_reason !== null);
  if (!suggestion.side) return null;
  return suggestion.side === "a"
    ? { winner: c.a, loser: c.b }
    : { winner: c.b, loser: c.a };
}

export function PersonMergePage() {
  const queryClient = useQueryClient();
  const { roles, rolesLoading } = useAuth();
  const allowed = hasAnyRole(roles, ["admin", "manager"]);
  // Cleanup deletes people; only admin may open it. Do not send managers there.
  const canOpenCleanup = hasAnyRole(roles, ["admin"]);

  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState("");

  useEffect(() => {
    setPage(0);
    setExpandedId(null);
    setSelectedIds(new Set());
  }, [pageSize]);

  useEffect(() => {
    setSelectedIds(new Set());
    setExpandedId(null);
  }, [page]);

  const offset = page * pageSize;

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["person-merge-candidates", pageSize, offset],
    enabled: allowed,
    queryFn: async (): Promise<OverviewPage> => {
      const { data, error } = await supabase.rpc("person_merge_candidates_overview", {
        p_limit: pageSize,
        p_offset: offset,
      });
      if (error) throw error;
      const raw = data as unknown;
      // Backward-compat: old unpaged RPC returned a bare array.
      if (Array.isArray(raw)) {
        return { items: raw as Candidate[], total: raw.length, limit: pageSize, offset };
      }
      const obj = (raw ?? {}) as {
        items?: Candidate[];
        total?: number;
        limit?: number;
        offset?: number;
      };
      return {
        items: Array.isArray(obj.items) ? obj.items : [],
        total: Number(obj.total ?? 0),
        limit: Number(obj.limit ?? pageSize),
        offset: Number(obj.offset ?? offset),
      };
    },
  });

  const detectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("person_detect_merge_candidates", {
        p_person_id: null,
      });
      if (error) throw error;
      return data as { pending?: number } | null;
    },
    onSuccess: (result) => {
      const pendingRaw =
        result && typeof result === "object" && "pending" in result
          ? (result as { pending?: unknown }).pending
          : 0;
      const pending = Number(pendingRaw ?? 0);
      toast.success(
        pending > 0
          ? `صف تشخیص به روز شد - ${toFaDigits(pending)} جفت در انتظار`
          : "صف تشخیص به روز شد - جفت مشکوکی نیست",
      );
      setPage(0);
      setExpandedId(null);
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ["person-merge-candidates"] });
    },
    onError: (e) => toast.error(rpcMessage(e, "بازخوانی صف تشخیص انجام نشد.")),
  });

  const candidates = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + candidates.length, total);

  const eligibleOnPage = useMemo(
    () => candidates.filter((c) => isBulkMergeEligible(c)),
    [candidates],
  );

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.candidate_id) && isBulkMergeEligible(c)),
    [candidates, selectedIds],
  );

  const bulkMutation = useMutation({
    mutationFn: async (pairs: Candidate[]) => {
      let ok = 0;
      for (const c of pairs) {
        const sides = winnerIds(c);
        if (!sides) {
          throw new Error(`جفت «${c.a.display_name}» برای ادغام گروهی واجد شرایط نیست.`);
        }
        const { error } = await supabase.rpc("person_merge", {
          p_winner_id: sides.winner.id,
          p_loser_id: sides.loser.id,
          p_reason: "ادغام گروهی از صف اشخاص تکراری",
        });
        if (error) {
          throw new Error(
            ok > 0
              ? `${rpcMessage(error, "ادغام گروهی متوقف شد.")} (موفق تا اینجا: ${toFaDigits(ok)})`
              : rpcMessage(error, "ادغام گروهی انجام نشد."),
          );
        }
        ok += 1;
      }
      return ok;
    },
    onSuccess: (ok) => {
      toast.success(`${toFaDigits(ok)} جفت با موفقیت ادغام شد.`);
      setBulkOpen(false);
      setBulkConfirm("");
      setSelectedIds(new Set());
      setExpandedId(null);
      void queryClient.invalidateQueries({ queryKey: ["person-merge-candidates"] });
    },
    onError: (e) => {
      toast.error(rpcMessage(e, "ادغام گروهی انجام نشد."));
      void queryClient.invalidateQueries({ queryKey: ["person-merge-candidates"] });
    },
  });

  const refreshPage = () => {
    void queryClient.invalidateQueries({ queryKey: ["person-merge-candidates"] });
  };

  const toggleSelected = (id: string, on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) {
        if (next.size >= BULK_MERGE_MAX && !next.has(id)) {
          toast.error(`حداکثر ${toFaDigits(BULK_MERGE_MAX)} جفت در هر ادغام گروهی.`);
          return prev;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const selectAllEligibleOnPage = (on: boolean) => {
    if (!on) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set<string>();
    for (const c of eligibleOnPage) {
      if (next.size >= BULK_MERGE_MAX) break;
      next.add(c.candidate_id);
    }
    if (eligibleOnPage.length > BULK_MERGE_MAX) {
      toast.message(`فقط ${toFaDigits(BULK_MERGE_MAX)} جفت اول این صفحه انتخاب شد.`);
    }
    setSelectedIds(next);
  };

  if (rolesLoading) {
    return <div className="p-6 text-muted-foreground">در حال بررسی دسترسی…</div>;
  }
  if (!allowed) {
    return <div className="p-6 text-muted-foreground">دسترسی ندارید.</div>;
  }

  const allEligibleSelected =
    eligibleOnPage.length > 0 &&
    eligibleOnPage.every((c) => selectedIds.has(c.candidate_id)) &&
    selectedIds.size > 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/persons">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت به اشخاص
          </Link>
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={detectMutation.isPending}
          onClick={() => detectMutation.mutate()}
        >
          {detectMutation.isPending ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <Merge className="ml-2 h-4 w-4" />
          )}
          پیشنهاد ادغام‌ها
        </Button>
        {canOpenCleanup ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/persons-cleanup">
              <UserRoundCog className="ml-2 h-4 w-4" />
              تکمیل و پاک‌سازی
            </Link>
          </Button>
        ) : null}
      </div>

      <PageHeader
        title="بررسی اشخاص تکراری"
        description="جفت‌هایی که سیستم به تکراری‌بودن آن‌ها مشکوک است. برندهٔ ادغام را انتخاب کنید یا اعلام کنید این‌ها یک نفر نیستند."
      />

      {canOpenCleanup ? (
        <p className="text-sm text-muted-foreground">
          اگر پروندهٔ ناقص (بدون کد آسان یا موبایل) دارید، اول در{" "}
          <Link
            to="/admin/persons-cleanup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            تکمیل و پاک‌سازی
          </Link>{" "}
          کامل یا حذفش کنید؛ بعد به این صف برگردید.
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          بارگذاری صف ادغام با خطا مواجه شد. لطفاً دوباره تلاش کنید.
        </div>
      ) : total === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            هیچ جفت مشکوکی در انتظار بررسی نیست.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              نمایش {toFaDigits(from)} تا {toFaDigits(to)} از {toFaDigits(total)}
              {isFetching ? " …" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="merge-page-size" className="text-sm text-muted-foreground">
                در هر صفحه
              </Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v) as PageSize)}
              >
                <SelectTrigger id="merge-page-size" className="w-[5.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {toFaDigits(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 0 || isFetching}
                onClick={() => {
                  setExpandedId(null);
                  setPage((p) => Math.max(0, p - 1));
                }}
              >
                قبلی
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                {toFaDigits(page + 1)} / {toFaDigits(totalPages)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages || isFetching}
                onClick={() => {
                  setExpandedId(null);
                  setPage((p) => p + 1);
                }}
              >
                بعدی
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="merge-select-all-eligible"
                  checked={allEligibleSelected}
                  disabled={eligibleOnPage.length === 0 || bulkMutation.isPending}
                  onCheckedChange={(v) => selectAllEligibleOnPage(v === true)}
                />
                <Label htmlFor="merge-select-all-eligible" className="text-sm cursor-pointer">
                  انتخاب واجد شرایط این صفحه ({toFaDigits(eligibleOnPage.length)})
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                فقط شناسهٔ مشترک یا نام ناقص — همنامِ صرف و جفت‌های مسدود در گروهی نیستند.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={selectedCandidates.length === 0 || bulkMutation.isPending}
              onClick={() => {
                setBulkConfirm("");
                setBulkOpen(true);
              }}
            >
              <Merge className="ml-2 h-4 w-4" />
              ادغام گروهی ({toFaDigits(selectedCandidates.length)})
            </Button>
          </div>

          <div className="space-y-4">
            {candidates.map((c) => (
              <CandidateCard
                key={c.candidate_id}
                candidate={c}
                expanded={expandedId === c.candidate_id}
                selected={selectedIds.has(c.candidate_id)}
                onSelectedChange={(on) => toggleSelected(c.candidate_id, on)}
                onToggle={() =>
                  setExpandedId((cur) => (cur === c.candidate_id ? null : c.candidate_id))
                }
                onResolved={() => {
                  setExpandedId(null);
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(c.candidate_id);
                    return next;
                  });
                  refreshPage();
                }}
              />
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={bulkOpen}
        onOpenChange={(open) => {
          if (bulkMutation.isPending) return;
          setBulkOpen(open);
          if (!open) setBulkConfirm("");
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأیید ادغام گروهی</DialogTitle>
            <DialogDescription>
              {toFaDigits(selectedCandidates.length)} جفت با برندهٔ پیشنهادی سیستم ادغام می‌شوند.
              برای تأیید عبارت «{BULK_CONFIRM_PHRASE}» را عیناً تایپ کنید.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
            {selectedCandidates.map((c) => {
              const sides = winnerIds(c);
              if (!sides) return null;
              return (
                <li key={c.candidate_id} className="leading-relaxed">
                  نگه داشتن «{sides.winner.display_name}» ← ادغام «{sides.loser.display_name}»
                </li>
              );
            })}
          </ul>
          <div className="space-y-2">
            <Label htmlFor="bulk-confirm-phrase">عبارت تأیید</Label>
            <Input
              id="bulk-confirm-phrase"
              value={bulkConfirm}
              onChange={(e) => setBulkConfirm(e.target.value)}
              placeholder={BULK_CONFIRM_PHRASE}
              disabled={bulkMutation.isPending}
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={bulkMutation.isPending}
              onClick={() => setBulkOpen(false)}
            >
              انصراف
            </Button>
            <Button
              type="button"
              disabled={
                bulkMutation.isPending ||
                bulkConfirm.trim() !== BULK_CONFIRM_PHRASE ||
                selectedCandidates.length === 0
              }
              onClick={() => bulkMutation.mutate(selectedCandidates)}
            >
              {bulkMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Merge className="ml-2 h-4 w-4" />
              )}
              اجرای ادغام گروهی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CandidateCard({
  candidate,
  expanded,
  selected,
  onSelectedChange,
  onToggle,
  onResolved,
}: {
  candidate: Candidate;
  expanded: boolean;
  selected: boolean;
  onSelectedChange: (on: boolean) => void;
  onToggle: () => void;
  onResolved: () => void;
}) {
  const blocked = candidate.blocked_reason !== null;
  const suggestion = suggestMergeWinner(candidate.a, candidate.b, blocked);
  const suggestedSide = suggestion.side ?? "a";
  const bulkOk = isBulkMergeEligible(candidate);

  const [winner, setWinner] = useState<"a" | "b">(suggestedSide);
  const [reason, setReason] = useState("");
  const [dismissReason, setDismissReason] = useState("");

  useEffect(() => {
    setWinner(suggestedSide);
  }, [candidate.candidate_id, suggestedSide]);

  const winnerSide = winner === "a" ? candidate.a : candidate.b;
  const loserSide = winner === "a" ? candidate.b : candidate.a;
  const overridden = !blocked && suggestion.side !== null && winner !== suggestion.side;

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("person_merge", {
        p_winner_id: winnerSide.id,
        p_loser_id: loserSide.id,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`«${loserSide.display_name}» در «${winnerSide.display_name}» ادغام شد.`);
      onResolved();
    },
    onError: (e) => toast.error(rpcMessage(e, "ادغام انجام نشد.")),
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("person_merge_dismiss", {
        p_candidate_id: candidate.candidate_id,
        p_reason: dismissReason.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("این جفت به‌عنوان «دو نفر متفاوت» ثبت شد.");
      onResolved();
    },
    onError: (e) => toast.error(rpcMessage(e, "ثبت رد پیشنهاد انجام نشد.")),
  });

  const busy = mergeMutation.isPending || dismissMutation.isPending;
  const suggestedName =
    suggestion.side === "a"
      ? candidate.a.display_name
      : suggestion.side === "b"
        ? candidate.b.display_name
        : null;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Checkbox
              className="mt-1"
              checked={selected}
              disabled={!bulkOk || busy}
              onCheckedChange={(v) => onSelectedChange(v === true)}
              aria-label={`انتخاب برای ادغام گروهی: ${candidate.a.display_name}`}
            />
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">
                {candidate.a.display_name} ↔ {candidate.b.display_name}
              </CardTitle>
              {candidate.detail ? (
                <p className="text-sm text-muted-foreground">{candidate.detail}</p>
              ) : null}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {blocked ? <Badge variant="destructive">ادغام مسدود</Badge> : null}
                {!bulkOk && !blocked ? (
                  <Badge variant="outline">فقط بررسی دستی</Badge>
                ) : null}
                {suggestedName ? (
                  <Badge variant="secondary">
                    پیشنهاد نگه‌داشتن: {suggestedName} — {suggestion.label}
                  </Badge>
                ) : null}
                <Badge variant="outline">
                  ارجاع‌ها: {toFaDigits(candidate.a.reference_count)} /{" "}
                  {toFaDigits(candidate.b.reference_count)}
                </Badge>
              </div>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onToggle}>
            {expanded ? (
              <>
                <ChevronUp className="ml-1 h-4 w-4" />
                بستن جزئیات
              </>
            ) : (
              <>
                <ChevronDown className="ml-1 h-4 w-4" />
                باز کردن جزئیات
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded ? (
        <CardContent className="space-y-5">
          {blocked ? (
            <div
              role="alert"
              className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
            >
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1">
                <div className="font-medium">ادغام این جفت مجاز نیست</div>
                <p>{BLOCKED_MESSAGE[candidate.blocked_reason as string]}</p>
                <p className="text-xs">
                  اگر مطمئنید این دو یک نفر نیستند، از دکمهٔ «این‌ها یک نفر نیستند» استفاده کنید.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {overridden
                ? `پیشنهاد عوض شد (پیشنهاد سیستم: ${suggestion.label}).`
                : `پیشنهاد سیستم: ${suggestion.label}.`}
            </p>
          )}

          <RadioGroup
            value={winner}
            onValueChange={(v) => setWinner(v as "a" | "b")}
            disabled={blocked || busy}
            className="grid gap-4 md:grid-cols-2"
          >
            <SidePanel
              side={candidate.a}
              value="a"
              selected={winner === "a"}
              disabled={blocked || busy}
              radioId={`winner-a-${candidate.candidate_id}`}
              systemSuggested={suggestion.side === "a"}
              overridden={overridden && winner === "a"}
            />
            <SidePanel
              side={candidate.b}
              value="b"
              selected={winner === "b"}
              disabled={blocked || busy}
              radioId={`winner-b-${candidate.candidate_id}`}
              systemSuggested={suggestion.side === "b"}
              overridden={overridden && winner === "b"}
            />
          </RadioGroup>

          {!blocked ? (
            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm">
                با ادغام، همهٔ ارجاع‌های «{loserSide.display_name}» به «{winnerSide.display_name}»
                منتقل می‌شود و شخص بازنده غیرفعال (نه حذف) خواهد شد.
              </p>
              <div className="space-y-2">
                <Label htmlFor={`merge-reason-${candidate.candidate_id}`}>دلیل ادغام</Label>
                <Input
                  id={`merge-reason-${candidate.candidate_id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثلاً: رکورد آزمایشی، همان شخص با املای متفاوت"
                  disabled={busy}
                />
              </div>
              <Button onClick={() => mergeMutation.mutate()} disabled={busy}>
                {mergeMutation.isPending ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Merge className="ml-2 h-4 w-4" />
                )}
                ادغام
              </Button>
            </div>
          ) : null}

          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-2">
              <Label htmlFor={`dismiss-reason-${candidate.candidate_id}`}>
                دلیل رد پیشنهاد (اختیاری)
              </Label>
              <Input
                id={`dismiss-reason-${candidate.candidate_id}`}
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="مثلاً: شمارهٔ تلفن ثابتِ مشترک بین دو همکار"
                disabled={busy}
              />
            </div>
            <Button variant="outline" onClick={() => dismissMutation.mutate()} disabled={busy}>
              {dismissMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <UserX className="ml-2 h-4 w-4" />
              )}
              این‌ها یک نفر نیستند
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function SidePanel({
  side,
  value,
  selected,
  disabled,
  radioId,
  systemSuggested,
  overridden,
}: {
  side: CandidateSide;
  value: "a" | "b";
  selected: boolean;
  disabled: boolean;
  radioId: string;
  systemSuggested: boolean;
  overridden: boolean;
}) {
  return (
    <div
      className={`space-y-3 rounded-md border p-4 ${
        selected && !disabled ? "border-primary bg-primary/5" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <RadioGroupItem value={value} id={radioId} disabled={disabled} />
        <Label htmlFor={radioId} className="cursor-pointer font-medium">
          این را نگه دار
        </Label>
        {systemSuggested && selected && !overridden ? (
          <Badge variant="secondary">پیشنهاد سیستم</Badge>
        ) : null}
        {overridden ? <Badge variant="outline">پیشنهاد عوض شد</Badge> : null}
      </div>

      <div>
        <Link
          to="/persons/$personId/edit"
          params={{ personId: side.id }}
          className="text-base font-semibold text-primary hover:underline"
        >
          {side.display_name}
        </Link>
        {side.legal_name ? (
          <div className="text-sm text-muted-foreground">{side.legal_name}</div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{KIND_LABEL[side.kind] ?? side.kind}</Badge>
        {side.has_customer ? <Badge variant="secondary">مشتری</Badge> : null}
        {side.has_supplier ? <Badge variant="secondary">تأمین‌کننده</Badge> : null}
        {side.has_external_party ? <Badge variant="secondary">طرف حساب خارجی</Badge> : null}
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">ارجاع‌های کسب‌وکاری</dt>
          <dd className="font-medium">{toFaDigits(side.reference_count)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">تاریخ ایجاد</dt>
          <dd>{new Date(side.created_at).toLocaleDateString("fa-IR")}</dd>
        </div>
      </dl>

      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">شناسه‌ها</div>
        {side.identifiers.length === 0 ? (
          <div className="text-sm text-muted-foreground">-</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {side.identifiers.map((i) => (
              <li key={`${i.kind}-${i.value_normalized}`} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{IDENTIFIER_LABEL[i.kind] ?? i.kind}:</span>
                <span dir="ltr">{i.value_raw}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  ({i.value_normalized})
                </span>
                <span className="text-xs text-muted-foreground">
                  {STATUS_LABEL[i.status] ?? i.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">نام‌های دیگر</div>
        {side.aliases.length === 0 ? (
          <div className="text-sm text-muted-foreground">-</div>
        ) : (
          <ul className="text-sm">
            {side.aliases.map((a) => (
              <li key={a.alias}>{a.alias}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">زمینه‌ها</div>
        {side.contexts.length === 0 ? (
          <div className="text-sm text-muted-foreground">-</div>
        ) : (
          <ul className="text-sm">
            {side.contexts.map((ctx, idx) => (
              <li key={`${ctx.context_kind}-${ctx.ref_id ?? idx}`}>
                {ctx.context_kind}
                {ctx.ref_table ? ` · ${ctx.ref_table}` : ""}
                {ctx.ended_at ? " (پایان‌یافته)" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
