/** DD-DEAL-052 Search-Deal.Criteria.Sort 0–10 */
export const DEAL_SORT_OPTIONS = [
  { id: 0, label: "تاریخ ثبت" },
  { id: 1, label: "عنوان" },
  { id: 2, label: "مبلغ" },
  { id: 3, label: "احتمال موفقیت" },
  { id: 4, label: "مسئول" },
  { id: 5, label: "کاریز" },
  { id: 6, label: "مرحله کاریز" },
  { id: 7, label: "تاریخ آخرین فعالیت" },
  { id: 8, label: "تاریخ موفق شدن" },
  { id: 9, label: "تاریخ احتمالی بستن معامله" },
  { id: 10, label: "زمان فعالیت بعدی" },
] as const;

export type DealSortId = (typeof DEAL_SORT_OPTIONS)[number]["id"];
