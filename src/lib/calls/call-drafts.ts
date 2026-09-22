/**
 * Per-call note drafts keyed by B1 call-card key (localStorage, 24h TTL).
 */

export const CALL_DRAFT_STORAGE_KEY = "afrakala-call-note-drafts-v1";
export const CALL_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type CallNoteDraft = {
  kind: "call" | "note";
  body: string;
  title: string;
  followUpDate: string | null;
  followUpTime: string;
  /** Linked deal (request) interaction id from «افزودن معامله» */
  dealId?: string | null;
  updatedAt: number;
};

type DraftMap = Record<string, CallNoteDraft>;

function readMap(): DraftMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(CALL_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DraftMap;
    if (!parsed || typeof parsed !== "object") return {};
    return pruneExpired(parsed);
  } catch {
    return {};
  }
}

function writeMap(map: DraftMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CALL_DRAFT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function pruneExpired(map: DraftMap, now = Date.now()): DraftMap {
  const next: DraftMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (!v || typeof v.updatedAt !== "number") continue;
    if (now - v.updatedAt > CALL_DRAFT_TTL_MS) continue;
    next[k] = v;
  }
  return next;
}

export function loadCallDraft(draftKey: string): CallNoteDraft | null {
  const map = readMap();
  return map[draftKey] ?? null;
}

export function saveCallDraft(
  draftKey: string,
  draft: Omit<CallNoteDraft, "updatedAt"> & { updatedAt?: number },
): void {
  const map = readMap();
  map[draftKey] = {
    kind: draft.kind,
    body: draft.body,
    title: draft.title,
    followUpDate: draft.followUpDate,
    followUpTime: draft.followUpTime,
    dealId: draft.dealId ?? null,
    updatedAt: draft.updatedAt ?? Date.now(),
  };
  writeMap(map);
}

export function clearCallDraft(draftKey: string): void {
  const map = readMap();
  if (!(draftKey in map)) return;
  delete map[draftKey];
  writeMap(map);
}

export function listCallDraftKeys(): string[] {
  return Object.keys(readMap());
}

export const EMPTY_CALL_NOTE_DRAFT: Omit<CallNoteDraft, "updatedAt"> = {
  kind: "call",
  body: "",
  title: "",
  followUpDate: null,
  followUpTime: "09:00",
  dealId: null,
};
