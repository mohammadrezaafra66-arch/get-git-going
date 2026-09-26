export const DEAL_FILTER_FIELDS = [
  { id: "probability", label: "احتمال موفقیت", type: "number" },
  { id: "author", label: "ایجاد کننده", type: "user" },
  { id: "updated_at", label: "تاریخ آخرین ویرایش", type: "date" },
  { id: "expected_close_on", label: "تاریخ احتمالی بسته شدن معامله", type: "date" },
  { id: "register_time", label: "تاریخ ثبت", type: "date" },
  { id: "lost_at", label: "تاریخ شکست خوردن", type: "date" },
  { id: "won_at", label: "تاریخ موفق شدن", type: "date" },
  { id: "stage_entered_at", label: "تاریخ وارد شدن به کاریز", type: "date" },
  { id: "lost_reason_note", label: "توضیح دلیل شکست", type: "text" },
  { id: "body", label: "توضیحات", type: "text" },
  { id: "lost_reason_id", label: "دلیل شکست", type: "text" },
  { id: "acquaintance_id", label: "شیوه آشنایی", type: "text" },
  { id: "title", label: "عنوان", type: "text" },
  { id: "estimated_amount", label: "قیمت", type: "number" },
  { id: "pipeline_id", label: "کاریز", type: "text" },
  { id: "stage_id", label: "مرحله کاریز", type: "text" },
  { id: "salesperson_id", label: "مسئول", type: "user" },
  { id: "introducer_person_id", label: "معرف معامله", type: "text" },
  { id: "currency", label: "نوع ارز", type: "text" },
  { id: "paid", label: "وضعیت پرداخت معامله", type: "text" },
  { id: "status", label: "وضعیت معامله", type: "text" },
  { id: "products", label: "محصولات درخواستی", type: "text" },
  { id: "author_id", label: "ایجاد کننده معامله", type: "user" },
  { id: "related_user", label: "کاربر مرتبط معامله", type: "user" },
] as const;

export const DATE_OPS = [
  { id: "eq", label: "برابر باشد با" },
  { id: "neq", label: "برابر نباشد با" },
  { id: "gt", label: "بعد از" },
  { id: "gte", label: "مساوی یا بعد از" },
  { id: "lt", label: "قبل از" },
  { id: "lte", label: "مساوی یا قبل از" },
] as const;

export const TEXT_OPS = [
  { id: "eq", label: "برابر باشد با" },
  { id: "neq", label: "برابر نباشد با" },
] as const;

export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";

export type DealFilterClause = {
  id: string;
  field: string;
  op: FilterOp;
  value: string;
  conj: "and" | "or";
};

export function newClause(field = "title", op: FilterOp = "eq"): DealFilterClause {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, field, op, value: "", conj: "and" };
}

function cmp(a: string | number | null | undefined, op: FilterOp, b: string): boolean {
  if (a == null || a === "") return false;
  const as = String(a);
  if (op === "eq") return as === b;
  if (op === "neq") return as !== b;
  if (op === "gt") return as > b;
  if (op === "gte") return as >= b;
  if (op === "lt") return as < b;
  if (op === "lte") return as <= b;
  return false;
}

export function rowMatchesClauses(
  row: Record<string, unknown>,
  clauses: DealFilterClause[],
  relatedUserIds?: string[],
): boolean {
  if (clauses.length === 0) return true;
  let acc = true;
  let started = false;
  for (const c of clauses) {
    const raw =
      c.field === "related_user"
        ? relatedUserIds?.includes(c.value)
          ? c.value
          : null
        : (row[c.field] as string | number | null | undefined);
    const hit = c.field === "related_user" ? relatedUserIds?.includes(c.value) === (c.op !== "neq") : cmp(raw, c.op, c.value);
    if (!started) {
      acc = hit;
      started = true;
      continue;
    }
    acc = c.conj === "or" ? acc || hit : acc && hit;
  }
  return acc;
}
