const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export const ROLE_FA: Record<string, string> = {
  admin: "مدیر سیستم",
  manager: "مدیر",
  sales: "کارشناس فروش",
  accountant: "حسابدار",
  viewer: "بازدیدکننده",
  purchase_specialist: "کارشناس خرید",
  site: "سایت",
};

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "admin", label: ROLE_FA.admin },
  { value: "manager", label: ROLE_FA.manager },
  { value: "sales", label: ROLE_FA.sales },
  { value: "accountant", label: ROLE_FA.accountant },
  { value: "viewer", label: ROLE_FA.viewer },
  { value: "purchase_specialist", label: ROLE_FA.purchase_specialist },
  { value: "site", label: ROLE_FA.site },
];

export const PENALTY_FOR_FA: Record<string, string> = {
  uploader: "آپلودکننده",
  reviewer: "تأییدکننده",
  both: "هر دو",
};

export const PENALTY_FOR_OPTIONS: { value: "uploader" | "reviewer" | "both"; label: string }[] = [
  { value: "uploader", label: PENALTY_FOR_FA.uploader },
  { value: "reviewer", label: PENALTY_FOR_FA.reviewer },
  { value: "both", label: PENALTY_FOR_FA.both },
];

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_FA[role] ?? role;
}

/** تبدیل دقیقه به برچسب خوانا فارسی. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return `${toPersianDigits(0)} دقیقه`;
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${toPersianDigits(hours)} ساعت`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${toPersianDigits(hours)} ساعت و ${toPersianDigits(rem)} دقیقه`;
  }
  return `${toPersianDigits(minutes)} دقیقه`;
}