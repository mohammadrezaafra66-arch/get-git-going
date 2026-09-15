import { Phone, StickyNote, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DossierInteraction } from "@/lib/sales-desk";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import { OutcomeButtons } from "./OutcomeButtons";

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
};

/**
 * تایم‌لاین تعاملات فروش (درخواست / تماس / یادداشت).
 */
export function InteractionTimeline({
  items,
  loading,
  error,
  emptyMessage = "هنوز تعاملی ثبت نشده است.",
  onStatusUpdated,
  showOutcomes = true,
}: Props) {
  return (
    <Card dir="rtl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">تاریخچه تعاملات</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((row) => {
              const meta = KIND_META[row.kind] ?? {
                label: row.kind,
                Icon: StickyNote,
              };
              const Icon = meta.Icon;
              return (
                <li
                  key={row.id}
                  className="rounded-md border border-border/60 bg-muted/10 p-3"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="secondary" className="text-[10px]">
                      {meta.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {row.status}
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
                  {showOutcomes && row.status === "open" ? (
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
