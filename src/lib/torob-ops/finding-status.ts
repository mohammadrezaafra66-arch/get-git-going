import type { FindingStatus } from "./types";

const REVIEW: FindingStatus[] = [
  "cheaper_competitor",
  "suspected_bait",
  "manual_review",
  "confirmed_bait",
  "legitimate_competitor",
  "cancelled",
];

const EDGES: Array<[FindingStatus, FindingStatus]> = [
  ...REVIEW.flatMap((from) => REVIEW.map((to) => [from, to] as [FindingStatus, FindingStatus])),
  ["confirmed_bait", "queued_for_report"],
  ["queued_for_report", "reporting"],
  ["queued_for_report", "cancelled"],
  ["reporting", "reported"],
  ["reporting", "report_failed"],
  ["report_failed", "queued_for_report"],
  ["report_failed", "cancelled"],
  ["reported", "cancelled"],
];

const ALLOWED = new Set(EDGES.map(([a, b]) => `${a}>${b}`));

export function isAllowedFindingStatusTransition(
  from: FindingStatus,
  to: FindingStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED.has(`${from}>${to}`);
}
