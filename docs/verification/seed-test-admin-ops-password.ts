import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const REST = `http://127.0.0.1:${env.SUPABASE_API_PORT || "9000"}/rest/v1`;
const SERVICE = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY!;
const uid = "05098088-2849-43f4-8eb5-7c473c3832ec";
const salt = randomBytes(16);
const hash = scryptSync("e2e-path-a-module-pass", salt, 64, { N: 16384, r: 8, p: 1 });
const password_hash = `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;

await fetch(`${REST}/torob_ops_credentials?user_id=eq.${uid}`, {
  method: "DELETE",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
});
const res = await fetch(`${REST}/torob_ops_credentials`, {
  method: "POST",
  headers: {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({
    user_id: uid,
    password_hash,
    is_active: true,
    created_by: uid,
  }),
});
console.log(res.status, await res.text());
