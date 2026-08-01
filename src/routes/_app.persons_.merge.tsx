import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Loader2, Merge, ShieldAlert, UserX } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toFaDigits } from "@/lib/i18n/formatters";

// Phase 8.1 (Decision 4) — the review page for suspected duplicate persons.
//
// Guard: admin/manager via requireAnyRole. Phase 6.7 proved a hand-rolled
// `ensureAuthReady()` check bounces authenticated users to /login on every
// server-rendered navigation, so this route reuses the shared guard.
export const Route = createFileRoute("/_app/persons_/merge")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: PersonMergePage,
});

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

function PersonMergePage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["person-merge-candidates"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("person_merge_candidates_overview");
      if (error) throw error;
      return (data ?? []) as unknown as Candidate[];
    },
  });

  const candidates = data ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/persons">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت به اشخاص
          </Link>
        </Button>
      </div>

      <PageHeader
        title="بررسی اشخاص تکراری"
        description="جفت‌هایی که سیستم به تکراری‌بودن آن‌ها مشکوک است. برندهٔ ادغام را انتخاب کنید یا اعلام کنید این‌ها یک نفر نیستند."
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          بارگذاری صف ادغام با خطا مواجه شد. لطفاً دوباره تلاش کنید.
        </div>
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            هیچ جفت مشکوکی در انتظار بررسی نیست.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {candidates.map((c) => (
            <CandidateCard
              key={c.candidate_id}
              candidate={c}
              onResolved={() =>
                queryClient.invalidateQueries({ queryKey: ["person-merge-candidates"] })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  onResolved,
}: {
  candidate: Candidate;
  onResolved: () => void;
}) {
  // Default the winner to the side with more business references — the record a
  // reviewer almost always wants to keep. It stays a deliberate choice, not an
  // automatic one: nothing happens until they press the button.
  const [winner, setWinner] = useState<"a" | "b">(
    candidate.b.reference_count > candidate.a.reference_count ? "b" : "a",
  );
  const [reason, setReason] = useState("");
  const [dismissReason, setDismissReason] = useState("");

  const blocked = candidate.blocked_reason !== null;
  const winnerSide = winner === "a" ? candidate.a : candidate.b;
  const loserSide = winner === "a" ? candidate.b : candidate.a;

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

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">
          {candidate.a.display_name} ↔ {candidate.b.display_name}
        </CardTitle>
        {candidate.detail ? (
          <p className="text-sm text-muted-foreground">{candidate.detail}</p>
        ) : null}
      </CardHeader>

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
        ) : null}

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
          />
          <SidePanel
            side={candidate.b}
            value="b"
            selected={winner === "b"}
            disabled={blocked || busy}
            radioId={`winner-b-${candidate.candidate_id}`}
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
    </Card>
  );
}

function SidePanel({
  side,
  value,
  selected,
  disabled,
  radioId,
}: {
  side: CandidateSide;
  value: "a" | "b";
  selected: boolean;
  disabled: boolean;
  radioId: string;
}) {
  return (
    <div
      className={`space-y-3 rounded-md border p-4 ${
        selected && !disabled ? "border-primary bg-primary/5" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value={value} id={radioId} disabled={disabled} />
        <Label htmlFor={radioId} className="cursor-pointer font-medium">
          این را نگه دار
        </Label>
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
          <div className="text-sm text-muted-foreground">—</div>
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
          <div className="text-sm text-muted-foreground">—</div>
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
          <div className="text-sm text-muted-foreground">—</div>
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
