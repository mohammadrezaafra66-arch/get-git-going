/**
 * Path B bait heuristics — read-only fetch of a seller page.
 * Strong signals only; failures become manual_review evidence, not auto-report.
 */

export type BaitSignal =
  | "no_checkout"
  | "phone_only"
  | "whatsapp_only"
  | "china_delivery"
  | "call_for_price"
  | "fetch_failed";

export type BaitCheckResult = {
  signals: BaitSignal[];
  strong: boolean;
  sellerDomain: string | null;
  httpStatus: number | null;
  snippet?: string;
};

const STRONG: BaitSignal[] = [
  "no_checkout",
  "phone_only",
  "whatsapp_only",
  "china_delivery",
  "call_for_price",
];

const BAIT_PATTERNS: Array<{ signal: BaitSignal; re: RegExp }> = [
  { signal: "whatsapp_only", re: /whatsapp|واتس\s*اپ|واتساپ/i },
  { signal: "phone_only", re: /تماس\s*بگیرید|فقط\s*تلفن|call\s*us|tel:/i },
  { signal: "china_delivery", re: /تحویل\s*چین|ارسال\s*از\s*چین|china\s*warehouse|فوب\s*چین/i },
  { signal: "call_for_price", re: /قیمت\s*نهایی|هماهنگی\s*تلفنی|call\s*for\s*price/i },
];

const CHECKOUT_HINT =
  /add[\s_-]?to[\s_-]?cart|سبد\s*خرید|افزودن\s*به\s*سبد|درگاه\s*پرداخت|زرین[\s_-]?پال|nextpay|idpay|checkout|پرداخت\s*آنلاین/i;

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_CHARS = 120_000;

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function checkSellerPageForBait(
  url: string | null | undefined,
): Promise<BaitCheckResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { signals: ["fetch_failed"], strong: false, sellerDomain: null, httpStatus: null };
  }

  const sellerDomain = extractDomain(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AfraKalaTorobOps/1.0 (+internal-bait-check; read-only)",
      },
    });
    const text = (await res.text()).slice(0, MAX_BODY_CHARS);
    const signals: BaitSignal[] = [];

    for (const { signal, re } of BAIT_PATTERNS) {
      if (re.test(text)) signals.push(signal);
    }

    const hasCheckout = CHECKOUT_HINT.test(text);
    const hasContactHeavy =
      signals.includes("whatsapp_only") ||
      signals.includes("phone_only") ||
      signals.includes("call_for_price");
    if (!hasCheckout && hasContactHeavy) {
      signals.push("no_checkout");
    }

    const unique = Array.from(new Set(signals));
    const strong = unique.some((s) => STRONG.includes(s));

    return {
      signals: unique,
      strong,
      sellerDomain: extractDomain(res.url) ?? sellerDomain,
      httpStatus: res.status,
      snippet: text.slice(0, 200).replace(/\s+/g, " "),
    };
  } catch {
    return {
      signals: ["fetch_failed"],
      strong: false,
      sellerDomain,
      httpStatus: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Large undercut without seller-page proof → manual_review threshold (percent). */
export const LARGE_UNDERCUT_PERCENT = 15;
