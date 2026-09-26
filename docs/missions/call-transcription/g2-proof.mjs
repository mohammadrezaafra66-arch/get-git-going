/**
 * G2 live proof: RLS row counts via Kong, idempotency, anon deny, no cross-link.
 * Run from worktree: node docs/missions/call-transcription/g2-proof.mjs
 * Prints no secrets.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const envPath = [
  process.env.AFRAKALA_LAN_ENV,
  path.join(process.cwd(), "deploy/lan/.env.lan"),
  "D:/AfraKalaTest/app/deploy/lan/.env.lan",
].find((p) => p && fs.existsSync(p));
if (!envPath) {
  console.error("NO_ENV_LAN");
  process.exit(2);
}
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const REST = `http://192.168.170.8:${env.SUPABASE_API_PORT}/rest/v1`;
const TAG = `g2ct_${Date.now()}`;

function sql(text) {
  const tmp = path.join(process.cwd(), "docs/missions/call-transcription/_g2_tmp.sql");
  fs.writeFileSync(tmp, text, "utf8");
  execFileSync("docker", ["cp", tmp, "afrakala-lan-db:/tmp/_g2_tmp.sql"]);
  const out = execFileSync(
    "docker",
    [
      "exec",
      "-e",
      "PGPASSWORD",
      "afrakala-lan-db",
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "afrakala",
      "-v",
      "ON_ERROR_STOP=1",
      "-A",
      "-t",
      "-f",
      "/tmp/_g2_tmp.sql",
    ],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD } },
  );
  fs.unlinkSync(tmp);
  return out.trim();
}

function mintJwt(sub, role = "authenticated") {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      sub,
      role,
      aud: role,
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

async function restCount(jwt, extra = "") {
  const url = `${REST}/call_transcript_sessions?select=id&recording_filename=like.${TAG}*${extra}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
      Prefer: "count=exact",
    },
  });
  const text = await res.text();
  let rows = [];
  try {
    rows = JSON.parse(text);
  } catch {
    rows = [];
  }
  const cr = res.headers.get("content-range") ?? "";
  const n = Array.isArray(rows) ? rows.length : 0;
  return { status: res.status, n, contentRange: cr, snippet: text.slice(0, 160) };
}

async function restRpc(jwt) {
  const res = await fetch(`${REST}/rpc/link_pending_transcript_sessions`, {
    method: "POST",
    headers: {
      apikey: env.ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const text = await res.text();
  return { status: res.status, snippet: text.slice(0, 240) };
}

const ids = Object.fromEntries(
  sql(`
    SELECT ur.role || '=' || u.id::text
      FROM auth.users u
      JOIN public.user_roles ur ON ur.user_id = u.id
     WHERE u.email IN (
       'test.admin@afrakala.local',
       'test.manager@afrakala.local',
       'test.sales@afrakala.local',
       'test.accountant@afrakala.local',
       'test.viewer@afrakala.local'
     );
  `)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split("=")),
);

if (!ids.sales || !ids.accountant || !ids.admin || !ids.manager || !ids.viewer) {
  console.error("MISSING_TEST_USERS", Object.keys(ids));
  process.exit(2);
}

const t0 = new Date("2026-09-26T12:00:00.000Z");
const t1 = new Date(t0.getTime() + 40_000);
const mid = new Date(t0.getTime() + 20_000);

sql(`
BEGIN;
INSERT INTO public.call_transcript_sessions
  (recording_filename, recording_uniqueid, uniqueid, employee_id, extension, status)
VALUES
  ('${TAG}_sales.wav', '${TAG}_s', '${TAG}_s', '${ids.sales}', '403', 'final'),
  ('${TAG}_acct.wav', '${TAG}_a', '${TAG}_a', '${ids.accountant}', '402', 'final'),
  ('${TAG}_other.wav', '${TAG}_o', '${TAG}_o', '${ids.manager}', '412', 'final');

INSERT INTO public.call_transcript_segments (session_id, kind, segment_seq, text)
SELECT id, 'final', 0, 'hello'
  FROM public.call_transcript_sessions
 WHERE recording_filename = '${TAG}_sales.wav';

INSERT INTO public.call_logs
  (employee_id, direction, duration_seconds, started_at, ended_at, external_id, source, metadata, extension)
VALUES
  ('${ids.sales}', 'inbound', 30, '${t0.toISOString()}', '${t0.toISOString()}', '${TAG}_c1', 'g2_fixture',
   '{"recording_files":[],"leg_uniqueids":[]}'::jsonb, '403'),
  ('${ids.sales}', 'inbound', 30, '${t1.toISOString()}', '${t1.toISOString()}', '${TAG}_c2', 'g2_fixture',
   '{"recording_files":[],"leg_uniqueids":[]}'::jsonb, '403');

INSERT INTO public.call_transcript_sessions
  (recording_filename, recording_uniqueid, uniqueid, extension, started_at, status)
VALUES
  ('${TAG}_cross.wav', '${TAG}_cross', '${TAG}_cross', '403', '${mid.toISOString()}', 'unlinked');
COMMIT;
`);

const sales = await restCount(mintJwt(ids.sales));
const acct = await restCount(mintJwt(ids.accountant));
const viewer = await restCount(mintJwt(ids.viewer));
const manager = await restCount(mintJwt(ids.manager));
const admin = await restCount(mintJwt(ids.admin));
const anon = await restCount(env.ANON_KEY);

const beforeDup = sql(`
  SELECT COUNT(*) FROM public.call_transcript_segments s
   JOIN public.call_transcript_sessions x ON x.id = s.session_id
  WHERE x.recording_filename = '${TAG}_sales.wav' AND s.kind='final' AND s.segment_seq=0;
`);
sql(`
INSERT INTO public.call_transcript_segments (session_id, kind, segment_seq, text)
SELECT id, 'final', 0, 'hello-dup'
  FROM public.call_transcript_sessions
 WHERE recording_filename = '${TAG}_sales.wav'
ON CONFLICT (session_id, segment_seq, kind) DO NOTHING;
`);
const afterDup = sql(`
  SELECT COUNT(*) FROM public.call_transcript_segments s
   JOIN public.call_transcript_sessions x ON x.id = s.session_id
  WHERE x.recording_filename = '${TAG}_sales.wav' AND s.kind='final' AND s.segment_seq=0;
`);

const linked = sql(`SELECT public.link_pending_transcript_sessions();`);
const cross = sql(`
  SELECT call_log_id IS NULL
    FROM public.call_transcript_sessions
   WHERE recording_filename = '${TAG}_cross.wav';
`);

const anonRpc = await restRpc(env.ANON_KEY);
const authRpc = await restRpc(mintJwt(ids.sales));

console.log(
  JSON.stringify(
    {
      tag: TAG,
      rls: {
        sales: sales.n,
        accountant: acct.n,
        viewer: viewer.n,
        manager: manager.n,
        admin: admin.n,
        anon_status: anon.status,
        anon_n: anon.n,
      },
      expect: {
        sales: 1,
        accountant: 1,
        viewer: 0,
        manager_ge: 3,
        admin_ge: 3,
        anon_n: 0,
      },
      idempotency: { beforeDup, afterDup },
      crossLinkUnlinked: cross,
      linkFnUpdated: linked,
      anonRpc: { status: anonRpc.status, snippet: anonRpc.snippet },
      salesRpc: { status: authRpc.status, snippet: authRpc.snippet },
    },
    null,
    2,
  ),
);

const pass =
  sales.n === 1 &&
  acct.n === 1 &&
  viewer.n === 0 &&
  manager.n >= 3 &&
  admin.n >= 3 &&
  anon.n === 0 &&
  beforeDup === "1" &&
  afterDup === "1" &&
  cross === "t" &&
  anonRpc.status >= 400 &&
  authRpc.status >= 400;

sql(`
DELETE FROM public.call_transcript_sessions WHERE recording_filename LIKE '${TAG}%';
DELETE FROM public.call_logs WHERE source = 'g2_fixture' AND external_id LIKE '${TAG}%';
`);

if (!pass) {
  console.error("G2_PROOF_FAIL");
  process.exit(1);
}
console.log("G2_PROOF_PASS");
process.exit(0);
