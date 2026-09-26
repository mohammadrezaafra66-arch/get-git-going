import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { withOpsSession } from "@/lib/torob-ops/client-session";
import { SCAN_STATUS_LABELS_FA, type ScanRunStatus } from "@/lib/torob-ops/types";
import {
  torobOpsCancelScan,
  torobOpsCreateScan,
  torobOpsListLabels,
  torobOpsListRuns,
} from "@/lib/torob-ops/functions";
import { formatDateFa, toFaDigits } from "@/lib/i18n/formatters";
import { TorobOpsGate } from "./TorobOpsGate";

function RunsInner() {
  const qc = useQueryClient();
  const listRunsFn = useServerFn(torobOpsListRuns);
  const listLabelsFn = useServerFn(torobOpsListLabels);
  const createFn = useServerFn(torobOpsCreateScan);
  const cancelFn = useServerFn(torobOpsCancelScan);

  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [runBaitChecks, setRunBaitChecks] = useState(true);

  const labelsQ = useQuery({
    queryKey: ["torob-ops-labels"],
    queryFn: () => listLabelsFn({ data: withOpsSession() }),
  });

  const runsQ = useQuery({
    queryKey: ["torob-ops-runs"],
    queryFn: () => listRunsFn({ data: withOpsSession({ limit: 50 }) }),
    refetchInterval: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: withOpsSession({
          labelIds: selectedLabels,
          notes: notes.trim() || undefined,
          runBaitChecks,
        }),
      }),
    onSuccess: (res) => {
      toast.success(
        `اسکن تمام شد — ${toFaDigits(String(res.findingsTotal))} یافته از ${toFaDigits(String(res.productsTotal))} محصول`,
      );
      qc.invalidateQueries({ queryKey: ["torob-ops-runs"] });
      qc.invalidateQueries({ queryKey: ["torob-ops-dashboard"] });
      qc.invalidateQueries({ queryKey: ["torob-ops-findings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMut = useMutation({
    mutationFn: (runId: string) => cancelFn({ data: withOpsSession({ runId }) }),
    onSuccess: () => {
      toast.message("اسکن لغو شد.");
      qc.invalidateQueries({ queryKey: ["torob-ops-runs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const labelTitle = useMemo(() => {
    const map = new Map(
      (labelsQ.data ?? []).map((l: { id: string; title: string }) => [l.id, l.title]),
    );
    return (ids: string[]) =>
      ids.length === 0 ? "همه برچسب‌ها" : ids.map((id) => map.get(id) ?? id.slice(0, 8)).join("، ");
  }, [labelsQ.data]);

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="دستورهای اسکن ترب"
        description="اسکن دکمه و اسکن خودکار بعد از چرخهٔ چشم. اگر یافته صفر باشد دلیل رد هر محصول اینجاست."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">اسکن جدید</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>برچسب‌ها (خالی = همهٔ محصولات برچسب‌دار با لینک ترب)</Label>
            <div className="flex max-h-40 flex-wrap gap-3 overflow-y-auto rounded border p-3">
              {(labelsQ.data ?? []).map((l: { id: string; title: string }) => {
                const checked = selectedLabels.includes(l.id);
                return (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setSelectedLabels((prev) =>
                          v ? [...prev, l.id] : prev.filter((x) => x !== l.id),
                        );
                      }}
                    />
                    {l.title}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scan-notes">یادداشت</Label>
            <Textarea
              id="scan-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={runBaitChecks}
              onCheckedChange={(v) => setRunBaitChecks(Boolean(v))}
            />
            بررسی سبک طعمه (حداکثر ۲ صفحه در هر اسکن)
          </label>
          <Button type="button" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? "در حال اسکن…" : "شروع اسکن"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(runsQ.data ?? []).map(
          (run: {
            id: string;
            status: ScanRunStatus;
            label_ids: string[];
            products_total: number;
            findings_total: number;
            created_at: string;
            error_message: string | null;
            skip_reasons?: Array<{ reason?: string; product_id?: string }>;
          }) => (
            <Card key={run.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {SCAN_STATUS_LABELS_FA[run.status] ?? run.status}
                    </Badge>
                    <span className="text-muted-foreground">{formatDateFa(run.created_at)}</span>
                  </div>
                  <div>برچسب: {labelTitle(run.label_ids ?? [])}</div>
                  <div>
                    محصول: {toFaDigits(String(run.products_total))} — یافته:{" "}
                    {toFaDigits(String(run.findings_total))}
                  </div>
                  {run.error_message ? (
                    <div className="text-destructive">{run.error_message}</div>
                  ) : null}
                  {run.findings_total === 0 ? (
                    <div className="text-muted-foreground">
                      یافته‌ای نبود.
                      {(run.skip_reasons ?? []).length > 0
                        ? ` دلایل: ${(run.skip_reasons ?? [])
                            .map((s) => s.reason)
                            .filter(Boolean)
                            .slice(0, 8)
                            .join("، ")}`
                        : " دلیل رد ثبت نشده."}
                    </div>
                  ) : (run.skip_reasons ?? []).length > 0 ? (
                    <div className="text-muted-foreground">
                      ردشده: {toFaDigits(String(run.skip_reasons?.length ?? 0))}
                    </div>
                  ) : null}
                </div>
                {run.status === "queued" || run.status === "running" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={cancelMut.isPending}
                    onClick={() => cancelMut.mutate(run.id)}
                  >
                    لغو
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}

export function TorobOpsRunsPage() {
  return (
    <TorobOpsGate>
      <RunsInner />
    </TorobOpsGate>
  );
}
