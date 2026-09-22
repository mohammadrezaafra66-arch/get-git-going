import { useMemo, useState } from "react";
import { Phone, StickyNote, Inbox } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DossierInteraction } from "@/lib/sales-desk";
import {
  listActivitiesForDeal,
  type SalesActivityRow,
} from "@/lib/sales-desk/activities";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import {
  OutcomeButtons,
  salesInteractionStatusLabel,
} from "./OutcomeButtons";
import { ActivityDoneControls } from "./ActivityDoneControls";
import { ActivityForm } from "./ActivityForm";

const KIND_META: Record<string, { label: string; Icon: typeof Phone }> = {
  request: { label: "درخواست", Icon: Inbox },
  call: { label: "تماس", Icon: Phone },
  note: { label: "یادداشت", Icon: StickyNote },
};

type Props = {
  items: DossierInteraction[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onStatusUpdated?: () => void;
  showOutcomes?: boolean;
  /** When set, also load deal-linked activities with done controls. */
  dealId?: string | null;
  personId?: string | null;
  personName?: string | null;
  customerId?: string | null;
  showActivityForm?: boolean;
};

/**
 * تایم‌لاین تعاملات فروش (درخواست / تماس / یادداشت) + کنترل انجام فعالیت.
 */
export function InteractionTimeline({
  items,
  loading,
  error,
  emptyMessage = "هنوز تعاملی ثبت نشده است.",
  onStatusUpdated,
  showOutcomes = true,
  dealId = null,
  personId = null,
  personName = null,
  customerId = null,
  showActivityForm = false,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [formReset, setFormReset] = useState(0);

  const activitiesQ = useQuery({
    queryKey: ["sales-desk", "deal-activities", dealId],
    enabled: !!dealId,
    queryFn: () => listActivitiesForDeal(dealId!),
    staleTime: 15_000,
  });

  const activityById = useMemo(() => {
    const m = new Map<string, SalesActivityRow>();
    for (const a of activitiesQ.data ?? []) m.set(a.id, a);
    return m;
  }, [activitiesQ.data]);

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">تاریخچه تعاملات</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showActivityForm && personId ? (
          <div>
            {!showForm ? (
              <button
                type="button"
                className="text-sm text-primary underline-offset-2 hover:underline"
                onClick={() => setShowForm(true)}
              >
                + ثبت فعالیت
              </button>
            ) : (
              <ActivityForm
                personId={personId}
                personName={personName}
                customerId={customerId}
                dealId={dealId}
                compact
                resetKey={formReset}
                onCreated={() => {
                  onStatusUpdated?.();
                  void activitiesQ.refetch();
                }}
              />
            )}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : items.length === 0 && (activitiesQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((row) => {
              const meta = KIND_META[row.kind] ?? {
                label: row.kind,
                Icon: StickyNote,
              };
              const Icon = meta.Icon;
              const activity = activityById.get(row.id);
              return (
                <li
                  key={row.id}
                  className="rounded-md border border-border/60 bg-muted/10 p-3"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="secondary" className="text-[10px]">
                      {activity?.activity_type?.title ?? meta.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {activity?.done_at
                        ? "انجام شده"
                        : activity
                          ? "انجام نشده"
                          : salesInteractionStatusLabel(row.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTimeFa(row.created_at)}
                    </span>
                  </div>
                  {row.title ? (
                    <p className="text-sm font-medium">{row.title}</p>
                  ) : null}
                  {row.body ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">
                      {row.body}
                    </p>
                  ) : null}
                  {row.next_follow_up_at ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      پیگیری: {formatDateTimeFa(row.next_follow_up_at)}
                    </p>
                  ) : null}
                  {activity ? (
                    <ActivityDoneControls
                      activity={activity}
                      onUpdated={() => {
                        onStatusUpdated?.();
                        void activitiesQ.refetch();
                      }}
                      onCreateAnother={() => {
                        setShowForm(true);
                        setFormReset((n) => n + 1);
                      }}
                    />
                  ) : showOutcomes && row.status === "open" ? (
                    <div className="mt-2">
                      <OutcomeButtons
                        interactionId={row.id}
                        currentStatus={row.status}
                        onUpdated={() => onStatusUpdated?.()}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
