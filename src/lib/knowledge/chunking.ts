/**
 * Persian-aware text chunking for retrieval.
 *
 * Nothing like this existed in the codebase, and a naive splitter is actively
 * wrong for Persian:
 *
 *  - ZWNJ (U+200C, نیم‌فاصله) is an INVISIBLE character that lives INSIDE
 *    words: «پیش‌فاکتور» is one word joined by ZWNJ. A splitter that treats it
 *    as whitespace produces «پیش» and «فاکتور» — two fragments that mean
 *    something else. Here ZWNJ is explicitly a word-JOINING character.
 *
 *  - Persian sentences end in «.» but also «؟» and «!», and clauses are
 *    separated by «؛» and «،». Splitting only on ASCII "." misses most
 *    boundaries in a Persian document.
 *
 *  - Persian and Arabic-Indic digits (۰-۹ / ٠-٩) are ordinary characters and
 *    must never be a split point.
 *
 * The splitter never cuts inside a word: it prefers a paragraph break, then a
 * sentence end, then a clause break, then a plain space — and only if a single
 * "word" genuinely exceeds the chunk size does it hard-cut, which for real text
 * means a URL or a long identifier, not a Persian word.
 */

export interface Chunk {
  chunk_index: number;
  content: string;
  token_estimate: number;
}

export interface ChunkOptions {
  /** Target characters per chunk. */
  size?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlap?: number;
}

export const DEFAULT_CHUNK_SIZE = 900;
export const DEFAULT_CHUNK_OVERLAP = 150;

const ZWNJ = "‌";

/** Sentence terminators: ASCII plus Persian question mark and full stop. */
const SENTENCE_END = /[.!?؟۔]/;
/** Clause separators: Persian comma and semicolon, plus ASCII. */
const CLAUSE_END = /[،؛,;:]/;

/**
 * Normalises without destroying meaning.
 *
 * Deliberately does NOT strip ZWNJ (it is part of the word) and does NOT
 * convert Persian digits to ASCII — a document quoting an account number
 * should keep the digits it was written with.
 */
export function normalizePersian(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      // Arabic yeh/kaf -> Persian yeh/kaf. Users type both; retrieval should not
      // care which keyboard produced the document.
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      // Collapse runs of horizontal whitespace (ASCII space, tab, NBSP, the
      // Arabic-script space) into one plain space. The class is 'whitespace
      // except line breaks'; ZWNJ is not whitespace in JS, so it survives —
      // which is the whole point.
      .replace(/[^\S\r\n]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * True when the text is the known corruption pattern: runs of `?` where
 * Persian should be. Documents like this must be SKIPPED rather than indexed —
 * embedding «????? ????» produces a vector that matches nothing meaningfully
 * and pollutes every future search.
 */
export function isCorruptedText(text: string): boolean {
  if (!text) return true;
  if (/\?{4,}/.test(text)) return true;
  const q = (text.match(/\?/g) || []).length;
  // A genuine Persian document is not one-fifth question marks.
  return text.length > 0 && q / text.length > 0.2;
}

/** Rough token estimate. Persian averages fewer characters per token than English. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.2));
}

/**
 * Finds the best index at or before `limit` to break `text`, preferring the
 * strongest boundary available. Returns -1 when no safe boundary exists.
 */
function findBreak(text: string, limit: number): number {
  const window = text.slice(0, limit);

  const para = window.lastIndexOf("\n\n");
  if (para > limit * 0.4) return para + 2;

  for (let i = window.length - 1; i > limit * 0.4; i--) {
    // A boundary only counts when what FOLLOWS is whitespace — otherwise the
    // "." in a decimal number or an abbreviation would split a token.
    if (SENTENCE_END.test(window[i]) && /\s/.test(text[i + 1] ?? " ")) return i + 1;
  }

  const nl = window.lastIndexOf("\n");
  if (nl > limit * 0.4) return nl + 1;

  for (let i = window.length - 1; i > limit * 0.4; i--) {
    if (CLAUSE_END.test(window[i]) && /\s/.test(text[i + 1] ?? " ")) return i + 1;
  }

  // Last resort before a hard cut: a real space. Never a ZWNJ — that is
  // inside a word.
  for (let i = window.length - 1; i > limit * 0.3; i--) {
    if (window[i] === " " && text[i] !== ZWNJ) return i;
  }

  return -1;
}

/**
 * Moves `from` forward to the start of the next whole word, so an overlap
 * window never begins mid-word. ZWNJ is skipped over rather than treated as a
 * boundary, because it sits inside words. Gives up (returns `from`) if no word
 * start appears before `ceiling`, which would otherwise lose text.
 */
function snapToWordStart(text: string, from: number, ceiling: number): number {
  for (let i = from; i < ceiling; i++) {
    const ch = text[i];
    if ((ch === " " || ch === "\n") && text[i + 1] && text[i + 1] !== ZWNJ) {
      return i + 1;
    }
  }
  return from;
}

/** Trims a boundary so it never starts or ends mid-word at a ZWNJ. */
function trimEdges(s: string): string {
  let out = s;
  while (out.startsWith(ZWNJ)) out = out.slice(1);
  while (out.endsWith(ZWNJ)) out = out.slice(0, -1);
  return out.trim();
}

export function chunkPersianText(raw: string, options: ChunkOptions = {}): Chunk[] {
  const size = options.size ?? DEFAULT_CHUNK_SIZE;
  const overlap = Math.min(options.overlap ?? DEFAULT_CHUNK_OVERLAP, Math.floor(size / 2));

  const text = normalizePersian(raw);
  if (!text) return [];

  const chunks: Chunk[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.slice(cursor);

    if (remaining.length <= size) {
      const content = trimEdges(remaining);
      if (content) {
        chunks.push({
          chunk_index: chunks.length,
          content,
          token_estimate: estimateTokens(content),
        });
      }
      break;
    }

    let breakAt = findBreak(remaining, size);
    // No boundary at all within the window means one unbroken run longer than
    // a chunk — a URL or an identifier, not a Persian word. Hard-cut it.
    if (breakAt <= 0) breakAt = size;

    const content = trimEdges(remaining.slice(0, breakAt));
    if (content) {
      chunks.push({
        chunk_index: chunks.length,
        content,
        token_estimate: estimateTokens(content),
      });
    }

    // Step forward by at least one character so a pathological input cannot
    // loop forever.
    const advance = Math.max(1, breakAt - overlap);
    // The overlap offset lands at an arbitrary character, which would start the
    // next chunk mid-word ("...ت. تا وقتی"). Snap forward to the next real word
    // start so the repeated context is readable text rather than a fragment.
    cursor += snapToWordStart(remaining, advance, breakAt);
  }

  return chunks;
}
