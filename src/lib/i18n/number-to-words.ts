/**
 * Persian number-to-words, for writing an amount out in letters on financial
 * documents ("شرح مبلغ به حروف").
 *
 * Self-hosted on purpose: no external dependency, matching how the rest of the
 * i18n helpers in this folder work.
 *
 * Only whole numbers are spelled out. Amounts in this system are tomans and
 * are always rounded before display, so a fractional part would be noise on a
 * document whose whole point is to remove ambiguity about the figure.
 */

const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];

const TEENS = [
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];

const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];

const HUNDREDS = [
  "",
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];

/** Group names, ascending. Index i covers 1000^i. */
const SCALES = ["", "هزار", "میلیون", "میلیارد", "هزار میلیارد", "میلیون میلیارد"];

const JOIN = " و ";

/** Spell a group of 1..999. Never called with 0. */
function spellTriple(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;

  if (h > 0) parts.push(HUNDREDS[h]);

  if (rest >= 10 && rest <= 19) {
    parts.push(TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }

  return parts.join(JOIN);
}

/**
 * Spell a number in Persian words.
 *
 * @example numberToPersianWords(1401)    // "یک هزار و چهارصد و یک"
 * @example numberToPersianWords(-250000) // "منفی دویست و پنجاه هزار"
 */
export function numberToPersianWords(value: number): string {
  if (!Number.isFinite(value)) return "";

  let n = Math.round(Math.abs(value));
  const negative = value < 0 && n !== 0;

  if (n === 0) return "صفر";

  // Split into 1000-groups, least significant first.
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  if (groups.length > SCALES.length) return "";

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const scale = SCALES[i];
    parts.push(scale ? `${spellTriple(g)} ${scale}` : spellTriple(g));
  }

  const words = parts.join(JOIN);
  return negative ? `منفی ${words}` : words;
}

/**
 * Amount in words with its currency, ready to drop onto a document.
 *
 * @example toPersianAmountWords(1500) // "یک هزار و پانصد تومان"
 */
export function toPersianAmountWords(value: number, currency = "تومان"): string {
  const words = numberToPersianWords(value);
  return words ? `${words} ${currency}` : "";
}
