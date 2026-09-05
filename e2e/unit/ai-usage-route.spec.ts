/**
 * O-2 — `fallback_enabled = false` must mean what it says.
 *
 * Run:
 *   npx playwright test e2e/unit/ai-usage-route.spec.ts --config=e2e/unit/playwright.unit.config.ts
 *
 * THE DEFECT THIS PINS.
 * `applyUsageRoute` returned early whenever `provider_id` was NULL:
 *
 *     if (!route.provider_id) return providers;   // fallback_enabled never read
 *
 * So a route saying "use exactly one provider and never fall back" (fallback off)
 * but naming no provider did not refuse — it handed back EVERY candidate, in
 * ascending priority order, and the caller sent the request to whichever provider
 * happened to sit at priority 1. That is how receipt images reached
 * api.openai.com while `receipt_ocr.vision` read `fallback_enabled = false`: the
 * column was correct and unread.
 *
 * A NULL provider_id with fallback OFF is not an under-specified route that should
 * be widened to everything. It is a route whose single permitted destination is
 * missing, which is the same situation as a pinned provider that has been filtered
 * out — and that case ALREADY refuses (`if (!selected) return route.fallback_enabled
 * ? providers : []`). The early return made the two disagree. These tests pin them
 * into agreement.
 *
 * WHAT MUST NOT CHANGE.
 * Seven of the eight live routes have a NULL provider_id with fallback ON, and they
 * are the normal "no preference, use the priority order" configuration. Those must
 * keep returning every candidate, untouched and in order. The cases below cover
 * that explicitly, because a fix that closed the leak by refusing every NULL route
 * would take chat, embeddings and the knowledge base down with it.
 */
import { expect, test } from "@playwright/test";
import { applyUsageRoute, type UsageRouteRow } from "../../src/lib/ai/usage-route";

/** Stands in for the priority-ordered candidate list `listProvidersFor` builds. */
const OPENAI = { id: "0fbe576a-9ef3-475b-92e7-fabd981a7d5d" }; // priority 1  — cloud, keyed
const OLLAMA = { id: "d30816a9-8ff0-4d0e-8f25-0661f8cbea61" }; // priority 10 — LAN
const CANDIDATES = [OPENAI, OLLAMA]; // ascending priority, exactly as the caller orders them

function route(over: Partial<UsageRouteRow>): UsageRouteRow {
  return {
    service_key: "receipt_ocr.vision",
    capability: "vision",
    provider_id: null,
    is_enabled: true,
    fallback_enabled: true,
    ...over,
  };
}

test.describe("applyUsageRoute", () => {
  // ---------------------------------------------------------------- the defect
  test("NULL provider_id + fallback OFF refuses instead of falling through to every provider", () => {
    const result = applyUsageRoute(
      CANDIDATES,
      route({ provider_id: null, fallback_enabled: false }),
    );

    expect(
      result,
      "a route that names no provider and forbids fallback must refuse. Returning the " +
        "candidate list sends the request to whatever sits at priority 1 — for " +
        "receipt_ocr.vision that was api.openai.com, with a live key and a bank slip.",
    ).toEqual([]);
  });

  test("NULL provider_id + fallback OFF refuses even when only the local provider is a candidate", () => {
    // The refusal must not depend on a cloud provider being present. It is the route
    // that is unsatisfiable, not the catalogue that is dangerous.
    expect(applyUsageRoute([OLLAMA], route({ provider_id: null, fallback_enabled: false }))).toEqual(
      [],
    );
  });

  test("NULL provider_id + fallback OFF agrees with a pinned-but-missing provider", () => {
    // Both describe the same state: fallback is forbidden and there is no permitted
    // destination. Before the fix these two disagreed — one refused, one returned all.
    const missingPin = applyUsageRoute(
      CANDIDATES,
      route({ provider_id: "11111111-1111-1111-1111-111111111111", fallback_enabled: false }),
    );
    const nullPin = applyUsageRoute(
      CANDIDATES,
      route({ provider_id: null, fallback_enabled: false }),
    );
    expect(nullPin).toEqual(missingPin);
  });

  // ------------------------------------------------- the seven routes that must not move
  test("NULL provider_id + fallback ON is UNCHANGED — every candidate, in priority order", () => {
    const result = applyUsageRoute(
      CANDIDATES,
      route({ service_key: "knowledge_ask.chat", capability: "chat", fallback_enabled: true }),
    );
    expect(result).toEqual(CANDIDATES);
    expect(result[0].id, "priority order must survive").toBe(OPENAI.id);
  });

  test("NULL provider_id + fallback ON with one candidate still returns it", () => {
    expect(applyUsageRoute([OLLAMA], route({ fallback_enabled: true }))).toEqual([OLLAMA]);
  });

  test("NULL provider_id + fallback ON over an empty catalogue returns empty, not a throw", () => {
    expect(applyUsageRoute([], route({ fallback_enabled: true }))).toEqual([]);
  });

  // ------------------------------------------------------------- pre-existing behaviour
  test("no route at all returns every candidate untouched", () => {
    expect(applyUsageRoute(CANDIDATES, null)).toEqual(CANDIDATES);
  });

  test("a disabled route refuses regardless of fallback", () => {
    expect(applyUsageRoute(CANDIDATES, route({ is_enabled: false, fallback_enabled: true }))).toEqual(
      [],
    );
    expect(
      applyUsageRoute(CANDIDATES, route({ is_enabled: false, fallback_enabled: false })),
    ).toEqual([]);
  });

  test("a pinned provider with fallback OFF yields exactly that provider", () => {
    expect(
      applyUsageRoute(CANDIDATES, route({ provider_id: OLLAMA.id, fallback_enabled: false })),
    ).toEqual([OLLAMA]);
  });

  test("a pinned provider with fallback ON leads, and the rest follow in priority order", () => {
    expect(
      applyUsageRoute(CANDIDATES, route({ provider_id: OLLAMA.id, fallback_enabled: true })),
    ).toEqual([OLLAMA, OPENAI]);
  });

  test("a pinned-but-missing provider with fallback ON falls back to every candidate", () => {
    expect(
      applyUsageRoute(
        CANDIDATES,
        route({ provider_id: "11111111-1111-1111-1111-111111111111", fallback_enabled: true }),
      ),
    ).toEqual(CANDIDATES);
  });

  test("a pinned-but-missing provider with fallback OFF refuses", () => {
    expect(
      applyUsageRoute(
        CANDIDATES,
        route({ provider_id: "11111111-1111-1111-1111-111111111111", fallback_enabled: false }),
      ),
    ).toEqual([]);
  });
});
