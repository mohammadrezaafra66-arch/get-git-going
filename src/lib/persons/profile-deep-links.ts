/**
 * Phase 5 — context deep-link resolution for the person dossier.
 * Client-side only; RLS decides whether a target row is visible.
 */

import type { PersonContextKind } from "./context-links.schemas";

export type DeepLinkState =
  | "valid"
  | "ended"
  | "missing_ref"
  | "no_route"
  | "unavailable";

export type ResolvedDeepLink = {
  linkId: string;
  contextKind: PersonContextKind;
  contextLabel: string;
  state: DeepLinkState;
  title: string | null;
  href: string | null;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
};

export const CONTEXT_KIND_LABEL_FA: Record<PersonContextKind, string> = {
  customer: "مشتری",
  supplier: "تأمین‌کننده",
  driver: "راننده",
  sender: "فرستنده",
  receiver: "گیرنده",
  referrer: "معرف",
  marketer: "بازاریاب",
  representative: "نماینده",
  complainant: "شاکی",
  returner: "عودت‌دهنده",
  staff_link: "کارمند",
  credit_party: "طرف اعتبار",
  accounting_party: "طرف حساب خارجی",
  delivery_party: "طرف تحویل",
  purchase_owner: "مالک خرید",
  sales_expert: "کارشناس فروش",
  warehouse_owner: "مسئول انبار",
  other: "سایر",
};

/** Routes that exist today for the four primary context kinds. */
export function routeForContext(
  kind: PersonContextKind,
  refId: string | null,
): { href: string; needsAdminUsers?: boolean } | null {
  switch (kind) {
    case "customer":
      return refId ? { href: `/sales/customers/${refId}/edit` } : null;
    case "supplier":
      return refId ? { href: `/suppliers/${refId}` } : null;
    case "staff_link":
      return refId ? { href: `/users/${refId}`, needsAdminUsers: true } : null;
    case "accounting_party":
      // List-only surface; no /$id detail route yet.
      return { href: "/accounting/external-parties" };
    default:
      return null;
  }
}
