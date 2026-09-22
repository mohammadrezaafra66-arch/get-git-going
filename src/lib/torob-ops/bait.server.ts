/**
 * Path A bait heuristics — read-only fetch of a seller/product page.
 * Strong signals only; failures become manual_review evidence, not auto-report.
 */

export type BaitSignal =
  | "no_checkout"
  | "phone_only"
  | "whatsapp_only"
  | "china_delivery"
  | "call_for_price"
  | "phone_extracted"
  | "fetch_failed";

export type BaitCheckResult = {
  signals: BaitSignal[];
  strong: boolean;
  sellerDomain: string | null;
  httpStatus: number | null;
  phones: string[];
  enriched: boolean;
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

const IR_PHONE_RE = /(?:\+98|0098|0)?9\d{9}/g;

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_CHARS = 120_000;

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function extractPhones(text: string): string[] {
  const raw = text.match(IR_PHONE_RE) ?? [];
  const norm = raw.map((p) => p.replace(/\D/g, "").replace(/^98/, "0").replace(/^0098/, "0"));
  return Array.from(new Set(norm.filter((p) => p.length >= 10))).slice(0, 8);
}

/** Follow redirects once more from a candidate seller deep-link if present in HTML. */
function extractSellerCandidateUrl(html: string, baseUrl: string): string | null {
  const patterns = [
    /href=["'](https?:\/\/[^"']+)["'][^>]*>\s*مشاهده\s*فروشگاه/i,
    /href=["'](https?:\/\/[^"']+)["'][^>]*>\s*سایت\s*فروشنده/i,
    /"seller_url"\s*:\s*"(https?:\\\/\\\/[^"]+)"/i,
    /"shop_url"\s*:\s*"(https?:\\\/\\\/[^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    const cleaned = m[1].replace(/\\\//g, "/");
    try {
      const abs = new URL(cleaned, baseUrl).toString();
      if (/^https?:\/\//i.test(abs)) return abs;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function fetchHtml(url: string): Promise<{ status: number; finalUrl: string; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AfraKalaTorobOps/2.0 (+path-a-enrich; read-only)",
      },
    });
    const text = (await res.text()).slice(0, MAX_BODY_CHARS);
    return { status: res.status, finalUrl: res.url, text };
  } finally {
    clearTimeout(timer);
  }
}

function analyzeHtml(text: string, finalUrl: string, fallbackDomain: string | null): BaitCheckResult {
  const signals: BaitSignal[] = [];
  for (const { signal, re } of BAIT_PATTERNS) {
    if (re.test(text)) signals.push(signal);
  }
  const phones = extractPhones(text);
  if (phones.length > 0) signals.push("phone_extracted");

  const hasCheckout = CHECKOUT_HINT.test(text);
  const hasContactHeavy =
    signals.includes("whatsapp_only") ||
    signals.includes("phone_only") ||
    signals.includes("call_for_price");
  if (!hasCheckout && hasContactHeavy) signals.push("no_checkout");

  const unique = Array.from(new Set(signals));
  const strong = unique.some((s) => STRONG.includes(s));

  return {
    signals: unique,
    strong,
    sellerDomain: extractDomain(finalUrl) ?? fallbackDomain,
    httpStatus: 200,
    phones,
    enriched: true,
    snippet: text.slice(0, 240).replace(/\s+/g, " "),
  };
}

export async function checkSellerPageForBait(
  url: string | null | undefined,
): Promise<BaitCheckResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      signals: ["fetch_failed"],
      strong: false,
      sellerDomain: null,
      httpStatus: null,
      phones: [],
      enriched: false,
    };
  }

  const sellerDomain = extractDomain(url);
  try {
    const primary = await fetchHtml(url);
    let result = analyzeHtml(primary.text, primary.finalUrl, sellerDomain);
    result = { ...result, httpStatus: primary.status };

    const sellerUrl = extractSellerCandidateUrl(primary.text, primary.finalUrl);
    if (sellerUrl && extractDomain(sellerUrl) !== result.sellerDomain) {
      try {
        const secondary = await fetchHtml(sellerUrl);
        const enriched = analyzeHtml(secondary.text, secondary.finalUrl, result.sellerDomain);
        result = {
          signals: Array.from(new Set([...result.signals, ...enriched.signals])),
          strong: result.strong || enriched.strong,
          sellerDomain: enriched.sellerDomain ?? result.sellerDomain,
          httpStatus: secondary.status,
          phones: Array.from(new Set([...result.phones, ...enriched.phones])).slice(0, 8),
          enriched: true,
          snippet: enriched.snippet ?? result.snippet,
        };
      } catch {
        /* keep primary */
      }
    }

    return result;
  } catch {
    return {
      signals: ["fetch_failed"],
      strong: false,
      sellerDomain,
      httpStatus: null,
      phones: [],
      enriched: false,
    };
  }
}

/** Large undercut without seller-page proof → manual_review threshold (percent). */
export const LARGE_UNDERCUT_PERCENT = 15;
