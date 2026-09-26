import { formatDealNumber } from "./format";

export const CLOSED_DEAL_DELETE_HINT = "برای حذف معامله ابتدا آن را به جاری برگردانید";

export type BulkCounts = { ok: number; closed: number; denied: number };

export function emptyBulkCounts(): BulkCounts {
  return { ok: 0, closed: 0, denied: 0 };
}

export function addBulkCounts(a: BulkCounts, b: BulkCounts): BulkCounts {
  return { ok: a.ok + b.ok, closed: a.closed + b.closed, denied: a.denied + b.denied };
}

export function isClosedDealRefusal(msg: string): boolean {
  return /جاری برگردانید|بسته بودن/.test(msg);
}

export function classifyBulkRefusal(msg: string): "closed" | "denied" {
  return isClosedDealRefusal(msg) ? "closed" : "denied";
}

export function formatBulkMutationSummary(input: {
  ok: number;
  closed?: number;
  denied?: number;
  okVerb: "حذف شد" | "تغییر کرد";
}): string {
  const closed = input.closed ?? 0;
  const denied = input.denied ?? 0;
  const refusedVerb = input.okVerb === "حذف شد" ? "حذف نشد" : "تغییر نکرد";
  const parts = [`${formatDealNumber(input.ok)} معامله ${input.okVerb}`];
  if (closed > 0) {
    parts.push(
      `${formatDealNumber(closed)} معامله به دلیل بسته بودن ${refusedVerb} (ابتدا به جاری برگردانید)`,
    );
  }
  if (denied > 0) {
    parts.push(`${formatDealNumber(denied)} معامله به دلیل نداشتن دسترسی تغییر نکرد`);
  }
  return parts.join("؛ ");
}
