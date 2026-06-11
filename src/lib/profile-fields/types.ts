export type ProfileFieldType =
  | "text"
  | "number"
  | "select"
  | "multiselect"
  | "time"
  | "days"
  | "textarea"
  | "date";

export interface ProfileFieldOption {
  value: string;
  label: string;
}

export interface ProfileFieldDefinition {
  id: string;
  name: string;
  label: string;
  field_type: ProfileFieldType;
  options: ProfileFieldOption[];
  is_required: boolean;
  is_active: boolean;
  show_on_register: boolean;
  sort_order: number;
  help_text: string | null;
}

export const WEEK_DAYS: ProfileFieldOption[] = [
  { value: "sat", label: "شنبه" },
  { value: "sun", label: "یک‌شنبه" },
  { value: "mon", label: "دوشنبه" },
  { value: "tue", label: "سه‌شنبه" },
  { value: "wed", label: "چهارشنبه" },
  { value: "thu", label: "پنج‌شنبه" },
  { value: "fri", label: "جمعه" },
];