export type DynamicColumnDataType =
  | "text" | "number" | "boolean" | "date" | "datetime" | "phone" | "tag" | "status";

export const DYNAMIC_COLUMN_DATA_TYPES: DynamicColumnDataType[] = [
  "text", "number", "boolean", "date", "datetime", "phone", "tag", "status",
];

export const DYNAMIC_COLUMN_DATA_TYPE_LABELS: Record<DynamicColumnDataType, string> = {
  text: "متن",
  number: "عدد",
  boolean: "بله/خیر",
  date: "تاریخ",
  datetime: "تاریخ و ساعت",
  phone: "شماره تماس",
  tag: "برچسب",
  status: "وضعیت",
};

export const DYNAMIC_TABLE_ROWS_PAGE_SIZE = 20;

export const SLUG_REGEX = /^[a-z0-9-]+$/;
export const COLUMN_KEY_REGEX = /^[a-z0-9_]+$/;
