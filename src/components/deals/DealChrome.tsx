import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const SOON = "به‌زودی";

export function soonToast() {
  toast.message(SOON);
}

export const VISIBILITY_LABELS = [
  "فقط مسئول",
  "مسئول و هم گروهی ها",
  "مسئول ،هم گروهی ها و زیر گروه ها",
  "همه افراد شرکت",
] as const;

export function DealViewTabs(props: { active: "kanban" | "list" | "forecast" }) {
  const item = (to: string, label: string, key: typeof props.active) => (
    <Link
      to={to}
      className={`rounded-md px-3 py-1.5 text-sm ${
        props.active === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex flex-wrap items-center gap-1" dir="rtl" aria-label="نماهای معامله">
      {item("/deal", "کاریز", "kanban")}
      {item("/deal/filter", "لیست", "list")}
      {item("/deal/forecast", "پیش‌بینی", "forecast")}
    </nav>
  );
}

export function MessengerSoonButtons() {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="sm" variant="ghost" onClick={soonToast} title="واتس اپ">
        واتس اپ
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={soonToast} title="تلگرام">
        تلگرام
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={soonToast} title="پیامک">
        پیامک
      </Button>
    </div>
  );
}

export function DealPageHeader(props: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" dir="rtl">
      <div>
        <p className="text-xs text-muted-foreground">معاملات</p>
        <h1 className="text-xl font-semibold leading-7">{props.title}</h1>
      </div>
      {props.children}
    </div>
  );
}

export function DealStatusPill(props: { status: string; deleted?: string | null }) {
  const key = props.deleted ? "deleted" : props.status;
  const label =
    key === "deleted" ? "حذف شده" : key === "open" ? "جاری" : key === "won" ? "موفق" : key === "lost" ? "ناموفق" : props.status;
  const tone =
    key === "won" ? "deal-status-won" : key === "lost" || key === "deleted" ? "deal-status-lost" : "deal-status-open";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs leading-6 ${tone}`}>{label}</span>
  );
}

export function HealthCircle(props: { circle: "red" | "yellow" | "none" | string | null }) {
  if (!props.circle || props.circle === "none") return null;
  const color = props.circle === "red" ? "bg-destructive" : "bg-amber-500";
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
      title={props.circle === "red" ? "فاسد" : "راکد"}
      aria-label={props.circle === "red" ? "فاسد" : "راکد"}
    />
  );
}
