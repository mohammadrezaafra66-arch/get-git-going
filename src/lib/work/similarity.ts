/**
 * Token normalize + Jaccard for Calm Mind merge similarity.
 * DB RPC work_scan_merge_suggestions is title-only; this helper includes
 * title + body + intake_summary for optional TS enrichment.
 */

import { WORK_MERGE_SIMILARITY_THRESHOLD } from "./types";

/** Lowercase, split on whitespace/punct, drop tokens shorter than 2 chars. */
export function normalizeWorkTokens(text: string | null | undefined): string[] {
  const raw = String(text ?? "")
    .toLowerCase()
    .split(/[\s\p{P}\p{S}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return Array.from(new Set(raw));
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  if (union === 0) return 0;
  return Math.round((inter / union) * 10000) / 10000;
}

export function workItemSimilarityText(parts: {
  title?: string | null;
  body?: string | null;
  intake_summary?: string | null;
}): string {
  return [parts.title, parts.body, parts.intake_summary]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function scoreWorkItems(
  left: { title?: string | null; body?: string | null; intake_summary?: string | null },
  right: { title?: string | null; body?: string | null; intake_summary?: string | null },
): number {
  return jaccardSimilarity(
    normalizeWorkTokens(workItemSimilarityText(left)),
    normalizeWorkTokens(workItemSimilarityText(right)),
  );
}

export function meetsMergeThreshold(score: number): boolean {
  return score >= WORK_MERGE_SIMILARITY_THRESHOLD;
}
