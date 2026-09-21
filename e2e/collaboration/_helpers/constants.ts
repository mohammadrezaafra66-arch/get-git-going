/** Shared constants for collaboration E2E — RUNID 20260921-2352 */
export const RUNID = "20260921-2352";
export const PREFIX = `E2E-COLLAB-${RUNID}`;

export const APP_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
export const REST_HOST = "http://192.168.170.8:9000";

/** Guard: never point at production. */
if (APP_URL.includes("192.168.170.10") || REST_HOST.includes("192.168.170.10")) {
  throw new Error("STOP: production IP 192.168.170.10 detected in collab E2E config");
}

export const USER_IDS = {
  admin: "05098088-2849-43f4-8eb5-7c473c3832ec",
  manager: "a0a4afe5-c6a1-4ed5-a1e6-a41cc45a046b",
  sales: "ea9b35dd-fd57-4905-9355-50ca8646d4d1",
  sales2: "00ebe9d3-b467-453c-89d6-08bab46335c2",
  accountant: "90c0479f-410d-4fff-9e00-34bbba1cce2b",
  viewer: "20303d30-ab9d-4fc6-be96-ec5db1dcb647",
} as const;

export type CollabRole = keyof typeof USER_IDS;

export const ROLE_EMAIL: Record<CollabRole, string> = {
  admin: "test.admin@afrakala.local",
  manager: "test.manager@afrakala.local",
  sales: "test.sales@afrakala.local",
  sales2: "test.sales2@afrakala.local",
  accountant: "test.accountant@afrakala.local",
  viewer: "test.viewer@afrakala.local",
};

/** Real products discovered via SELECT — never invent. */
export const PRODUCT = {
  sku: "AFK-2026-00001",
  id: "b0ab5def-1fe3-4dc1-9f8e-d8ff2df2eaad",
};

export const PRODUCTS = [
  { sku: "AFK-2026-00001", id: "b0ab5def-1fe3-4dc1-9f8e-d8ff2df2eaad" },
  { sku: "AFK-2026-00002", id: "66ff8f00-04b6-4522-a6f3-0bb70a89270d" },
  { sku: "AFK-2026-00003", id: "dffc51af-2989-4328-b870-de85b579f9fe" },
  { sku: "AFK-2026-00004", id: "d0e62568-b344-4551-8815-e0d4b488ab23" },
  { sku: "AFK-2026-00005", id: "17d1638a-a1d5-4802-bdb0-d356044f7c74" },
];

/** Hub cards expected per app role (source: _app.collaboration.tsx). */
export const HUB_CARDS: Record<string, string[]> = {
  admin: ["پیام‌ها", "فضای خرید", "کارت‌های قرمز من", "رسیدهای تحویل", "اسناد", "امتیازها"],
  manager: ["پیام‌ها", "فضای خرید", "کارت‌های قرمز من", "رسیدهای تحویل", "اسناد", "امتیازها"],
  sales: ["پیام‌ها", "فضای خرید", "کارت‌های قرمز من", "رسیدهای تحویل", "امتیازها"],
  accountant: ["پیام‌ها", "کارت‌های قرمز من", "اسناد", "امتیازها"],
  viewer: ["پیام‌ها", "امتیازها"],
};

export const HUB_ROUTES: Record<string, string> = {
  "پیام‌ها": "/messages",
  "فضای خرید": "/purchase",
  "کارت‌های قرمز من": "/my-penalties",
  "رسیدهای تحویل": "/delivery-receipts",
  "اسناد": "/documents",
  "امتیازها": "/gamification",
};

export function nameOf(kind: string, extra = ""): string {
  const suffix = extra ? `-${extra}` : "";
  return `${PREFIX}-${kind}${suffix}`;
}
