import { formatJalaliDateTimeTehran, isIsoDateValue } from "@/lib/deals/format";

export type DealHistoryRow = {
  id: string;
  event: string;
  field_name: string | null;
  from_value: string | null;
  to_value: string | null;
  actor_id: string | null;
  created_at: string;
};

const FIELD_FA: Record<string, string> = {
  title: "عنوان",
  body: "متن درخواست",
  owner: "مسئول",
  amount: "مبلغ",
  introducer: "معرف",
  company: "شرکت",
  expected_close: "تاریخ احتمالی بستن معامله",
  register_time: "تاریخ معامله",
  won_at: "تاریخ موفق شدن",
  tag: "برچسب",
  acquaintance: "شیوه آشنایی",
  status: "وضعیت",
  stage: "مرحله کاریز",
  pipeline: "کاریز",
};

function fieldFa(name: string | null, event: string): string {
  if (name && FIELD_FA[name]) return FIELD_FA[name];
  if (event === "status") return "وضعیت";
  if (event === "stage") return "مرحله کاریز";
  if (event === "pipeline") return "کاریز";
  if (event === "delete") return "حذف";
  if (event === "restore") return "بازیابی";
  return name || event;
}

export function formatDealHistorySentence(
  row: DealHistoryRow,
  names: Record<string, string>,
  dealTitle: string,
): string {
  const actor = (row.actor_id && names[row.actor_id]) || "کاربر";
  const title = dealTitle.trim() || "بدون عنوان";
  const when = formatJalaliDateTimeTehran(row.created_at);
  if (row.event === "create") {
    return `${actor} معامله با عنوان ${title} را ایجاد کرد`;
  }
  if (row.event === "status" || row.field_name === "status") {
    if (row.to_value === "won") return `${actor} معامله با عنوان ${title} را موفق کرد`;
    if (row.to_value === "lost") return `${actor} معامله با عنوان ${title} را ناموفق کرد`;
    if (row.to_value === "open") return `${actor} معامله با عنوان ${title} را به جاری برگرداند`;
  }
  const field = fieldFa(row.field_name, row.event);
  const before = resolveVal(row.from_value, names);
  const after = resolveVal(row.to_value, names);
  if (row.event === "delete") {
    return `${actor} معامله با عنوان ${title} را ویرایش کرد — حذف — ${before} ← ${after} — ${when}`;
  }
  if (row.event === "restore") {
    return `${actor} معامله با عنوان ${title} را ویرایش کرد — بازیابی — ${before} ← ${after} — ${when}`;
  }
  return `${actor} معامله با عنوان ${title} را ویرایش کرد — ${field} — ${before} ← ${after} — ${when}`;
}

function resolveVal(v: string | null, names: Record<string, string>): string {
  if (v == null || v === "") return "—";
  if (names[v]) return names[v];
  if (v === "open") return "جاری";
  if (v === "won") return "موفق";
  if (v === "lost") return "ناموفق";
  if (isIsoDateValue(v)) return formatJalaliDateTimeTehran(v);
  return v;
}
