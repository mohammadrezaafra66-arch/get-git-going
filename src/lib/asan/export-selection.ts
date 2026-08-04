/**
 * ASAN M4.2 — what the accountant has ticked, kept as a pure model.
 *
 * The requirement is "every row ticked by default, and unticking survives paging and page-size
 * changes". Storing the *selected* ids would break that: a row the user has never seen would
 * have to be added to the set the moment it scrolls into view, and any bug there silently drops
 * documents from the export. Storing the **excluded** ids makes "everything is selected" the
 * zero state, so a row that was never touched is selected by construction.
 *
 * A blocked row is never exported regardless of its tick state. The tick is the accountant's
 * intent; blocked is the system's verdict, and the verdict wins.
 *
 * These functions are pure so the phase test can assert the semantics without a browser, which
 * is where the two select-all controls are easy to conflate: "this page" and "all N matching"
 * are different operations and the brief is explicit that they must not be merged.
 */

export interface ExportSelection {
  /** Ids the user has explicitly unticked. Everything not here is ticked. */
  excluded: ReadonlySet<string>;
}

export const EMPTY_SELECTION: ExportSelection = { excluded: new Set<string>() };

export function isTicked(selection: ExportSelection, id: string): boolean {
  return !selection.excluded.has(id);
}

export function toggle(selection: ExportSelection, id: string): ExportSelection {
  const next = new Set(selection.excluded);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { excluded: next };
}

/** Tick every row on the page currently displayed — and only those. */
export function tickPage(selection: ExportSelection, pageIds: string[]): ExportSelection {
  const next = new Set(selection.excluded);
  for (const id of pageIds) next.delete(id);
  return { excluded: next };
}

/** Untick every row on the page currently displayed — and only those. */
export function untickPage(selection: ExportSelection, pageIds: string[]): ExportSelection {
  const next = new Set(selection.excluded);
  for (const id of pageIds) next.add(id);
  return { excluded: next };
}

/** Tick all N matching rows, including the ones on other pages. */
export function tickAllMatching(): ExportSelection {
  return { excluded: new Set<string>() };
}

/** Untick all N matching rows, including the ones on other pages. */
export function untickAllMatching(allIds: string[]): ExportSelection {
  return { excluded: new Set(allIds) };
}

export function countTicked(allIds: string[], selection: ExportSelection): number {
  return allIds.reduce((n, id) => (isTicked(selection, id) ? n + 1 : n), 0);
}

export interface PageView<T> {
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}

/** Clamped pagination: a page-size change can leave `page` past the end. */
export function paginate<T>(items: T[], page: number, pageSize: number): PageView<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const clamped = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (clamped - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: clamped,
    pageCount,
    pageSize: size,
    total: items.length,
  };
}

export interface ExportableSplit<T> {
  /** Ticked and not blocked — these go into the file. */
  exportable: T[];
  /** Blocked, whatever the tick says. Shown in the preview with a reason. */
  blocked: T[];
  /** Deliberately unticked by the accountant. */
  skipped: T[];
}

/** The single place that decides what a download actually contains. */
export function splitForExport<T extends { sourceId: string; blockedReason: string | null }>(
  docs: T[],
  selection: ExportSelection,
): ExportableSplit<T> {
  const exportable: T[] = [];
  const blocked: T[] = [];
  const skipped: T[] = [];
  for (const d of docs) {
    if (d.blockedReason) blocked.push(d);
    else if (isTicked(selection, d.sourceId)) exportable.push(d);
    else skipped.push(d);
  }
  return { exportable, blocked, skipped };
}
