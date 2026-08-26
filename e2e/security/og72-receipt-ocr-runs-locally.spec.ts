/**
 * Phase 7 / migrations 397 + 401 — receipt OCR must run on the LOCAL vision model, and must be
 * the PRIMARY path rather than a fallback.
 *
 * WHY THIS GATE IS BEHAVIOURAL AND NOT STRUCTURAL.
 * Migration 397 pinned `receipt_ocr.vision` to the local provider and turned cloud fallback off.
 * Every column read exactly as intended — and receipt OCR was **switched off entirely**, because
 * `listProvidersFor()` filters on `capabilities` BEFORE the route is applied:
 *
 *     const providers = rows.map(toProvider)
 *       .filter((p) => p.capabilities.includes(capability));   // ollama removed here
 *     return applyUsageRoute(providers, await getUsageRoute(usageKey, capability));
 *
 * The ollama row declared `{chat,embeddings}`. The filter dropped it, `applyUsageRoute` could
 * not find its pinned provider, and with fallback off it returned `[]` — which
 * `runWithFailover` reports as `no_provider` and the OCR function surfaces as
 * `{disabled: true, reason: 'ocr_disabled'}`. A perfectly configured pin resolved to nothing.
 *
 * So asserting that `'vision'` appears in a column would have PASSED throughout that failure.
 * This gate instead reproduces the resolution the way the code computes it, and then proves the
 * result by making a real vision call to whatever provider that resolution actually selects.
 *
 * WHAT EACH HALF PROVES:
 *   1. The capability filter — the pinned provider must SURVIVE it. This is the exact step that
 *      failed, and it is invisible to a column check.
 *   2. Exactly ONE candidate remains, and it is the local one. With fallback off, a second
 *      candidate would mean the resolution is ambiguous; zero would mean OCR is disabled.
 *   3. NO INTERNET REQUIRED — the resolved provider's host must be a private/loopback address.
 *      A cloud host here would mean a banking slip leaves the network.
 *   4. A REAL vision call to the resolved provider, with a real slip image, reading a real
 *      amount off it. Nothing else proves the destination actually serves vision.
 *
 * THE FIXTURE IS A REAL PERSIAN SLIP, WITH PERSIAN DIGITS.
 * An earlier draft used a Latin-script image, which would have proved only that the endpoint
 * accepts `images[]` and returns 200 — not that it can read the thing this feature exists for.
 * `e2e/fixtures/sample-persian-slip.png` is rendered through Chromium (which shapes Persian
 * correctly; Pillow on this machine cannot — no raqm, no arabic_reshaper) using the repo's own
 * local Vazirmatn font, and its amount and date are written in PERSIAN digits — ۱,۲۵۰,۰۰۰ and
 * ۱۴۰۵/۰۶/۰۴ — because `docs/ocr/requirements.md` acceptance item 3 requires exactly that case.
 * Measured 2026-08-26: `qwen3.6:latest` returns {"amount":"1250000","date":"1405/06/04"},
 * converting Persian numerals to western ones unprompted.
 *
 * Honest ceiling: one synthetic slip is not a measurement of accuracy across real bank paper
 * from different banks. That belongs to the acceptance list in `docs/ocr/requirements.md`, with
 * real slips, not to a gate that has to be deterministic. What this proves is that the path
 * reaches a local model which reads Persian amounts and dates correctly.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";

interface Resolved {
  name: string;
  kind: string;
  baseUrl: string;
  visionModel: string;
}

/**
 * Reproduce `listProvidersFor('vision')` + `applyUsageRoute(...)` against the live catalogue:
 * active AND declaring the capability (the filter), then restricted to the pinned provider when
 * a route exists and fallback is off.
 */
function resolveVisionProviders(): Resolved[] {
  return dbRows(`
    with candidates as (
      select p.id, p.name, p.kind, p.base_url, p.vision_model, p.priority
        from public.ai_providers p
       where p.is_active
         and 'vision' = any (p.capabilities)      -- the filter that silently removed ollama
    ), route as (
      select r.provider_id, r.is_enabled, r.fallback_enabled
        from public.ai_usage_routes r
       where r.service_key = 'receipt_ocr.vision' and r.capability = 'vision'
    )
    select c.name || '|' || c.kind || '|' || c.base_url || '|' || coalesce(c.vision_model,'')
      from candidates c
      left join route rt on true
     where rt.provider_id is null                       -- no route: every candidate
        or (rt.is_enabled and c.id = rt.provider_id)     -- pinned candidate survives the filter
        or (rt.is_enabled and not exists (select 1 from candidates x, route y where x.id = y.provider_id)
            and rt.fallback_enabled)                     -- pin lost, fallback allowed
     order by c.priority
  `).map((line) => {
    const [name, kind, baseUrl, visionModel] = line.split("|");
    return { name, kind, baseUrl, visionModel };
  });
}

test("the pinned provider SURVIVES the capability filter — the step that silently disabled OCR", () => {
  const pinnedSurvives = dbRows(`
    select p.name
      from public.ai_usage_routes r
      join public.ai_providers p on p.id = r.provider_id
     where r.service_key = 'receipt_ocr.vision' and r.capability = 'vision' and r.is_enabled
       and p.is_active and 'vision' = any (p.capabilities)
  `);
  expect(
    pinnedSurvives.length,
    "receipt_ocr.vision is pinned to a provider that does NOT declare the vision capability — " +
      "applyUsageRoute would return an empty list and OCR would be silently disabled",
  ).toBe(1);
});

test("resolution yields exactly ONE provider, and it is LOCAL", () => {
  const resolved = resolveVisionProviders();
  expect(
    resolved.length,
    `vision resolution produced ${resolved.length} providers: ${resolved.map((r) => r.name).join(", ")}`,
  ).toBe(1);
  expect(resolved[0].kind, "receipt OCR must resolve to the local ollama provider").toBe("ollama");
  expect(resolved[0].visionModel, "the local provider has no vision model set").not.toBe("");
});

test("⛔ no internet required — the resolved host is a private address, not a cloud service", () => {
  const [resolved] = resolveVisionProviders();
  expect(resolved, "nothing resolved at all").toBeTruthy();

  const host = new URL(resolved.baseUrl).hostname;
  // RFC1918 / loopback / .local only. A public hostname here means a banking slip — which
  // `docs/ocr/requirements.md` says may carry an account number, a name and a signature —
  // leaves the network on every scan.
  const isPrivate =
    /^127\./.test(host) ||
    host === "localhost" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /\.local$/.test(host);
  expect(isPrivate, `receipt OCR would send the slip to ${host}, which is not a private host`).toBe(
    true,
  );
});

test("a REAL vision call reads the AMOUNT and DATE off a Persian slip", async () => {
  // The cold load of a vision model on this host was measured at ~77s, so the default 30s
  // timeout would fail for reasons that have nothing to do with correctness.
  test.setTimeout(240_000);

  const [resolved] = resolveVisionProviders();
  expect(resolved, "nothing resolved at all").toBeTruthy();

  // `__dirname` does not exist here — this project is ESM, and referencing it throws
  // ReferenceError rather than resolving to anything. Playwright runs from the config
  // directory, which is the repo root, so fixtures are addressed from there.
  const dir = path.resolve(process.cwd(), "e2e/fixtures");
  const image = readFileSync(path.join(dir, "sample-persian-slip.png"));
  const expected = JSON.parse(
    readFileSync(path.join(dir, "sample-persian-slip.expected.json"), "utf8"),
  ) as { amountDigits: string; dateDigits: string };

  const base = resolved.baseUrl.replace(/\/+$/, "");
  // Same wire shape aiVision() uses for kind === 'ollama': POST /api/generate with images[].
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolved.visionModel,
      prompt:
        "This is a Persian bank transfer receipt. Extract the amount (مبلغ) and the date (تاریخ). " +
        'Reply ONLY as JSON: {"amount":"<digits only, western numerals>","date":"<as printed>"}',
      images: [image.toString("base64")],
      stream: false,
      think: false,
      options: { temperature: 0 },
    }),
  });

  expect(res.status, `the local vision endpoint refused the call (${res.status})`).toBe(200);
  const body = (await res.json()) as { response?: string; error?: string };
  expect(body.error ?? null, "the local model returned an error").toBeNull();

  const raw = body.response ?? "";
  // Compared as DIGITS ONLY, in both directions: the model may answer with Persian or western
  // numerals, with or without separators, and none of that is what is under test. Normalising
  // both sides is the difference between asserting comprehension and asserting punctuation.
  const toWestern = (t: string) =>
    t.replace(/[۰-۹٠-٩]/g, (d) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d) >= 0 ? "۰۱۲۳۴۵۶۷۸۹".indexOf(d) : "٠١٢٣٤٥٦٧٨٩".indexOf(d)),
    );
  const digits = toWestern(raw).replace(/[^\d]/g, "");

  expect(
    digits,
    `the local model did not read the AMOUNT off the Persian slip; it replied: ${JSON.stringify(raw.slice(0, 200))}`,
  ).toContain(expected.amountDigits);

  expect(
    digits,
    `the local model did not read the DATE off the Persian slip; it replied: ${JSON.stringify(raw.slice(0, 200))}`,
  ).toContain(expected.dateDigits);
});
