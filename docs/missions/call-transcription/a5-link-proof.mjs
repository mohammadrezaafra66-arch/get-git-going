/**
 * A5: 100% live + final linking on fixtures, with counts.
 * Live: ring uniqueid / linkedid. Final: recording_files / leg_uniqueids.
 * Also the C3 40s same-extension pair must not cross-link.
 */
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

const TAG = `a5ct_${Date.now()}`;

function sql(text) {
  const tmp = path.join(process.cwd(), "docs/missions/call-transcription/_a5_tmp.sql");
  fs.writeFileSync(tmp, text, "utf8");
  execFileSync("docker", ["cp", tmp, "afrakala-lan-db:/tmp/_a5_tmp.sql"]);
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
      "/tmp/_a5_tmp.sql",
    ],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD } },
  );
  fs.unlinkSync(tmp);
  return out.trim();
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

const t0 = new Date("2026-09-26T14:00:00.000Z");
const t1 = new Date(t0.getTime() + 40_000);

sql(`
BEGIN;
INSERT INTO public.call_ring_events
  (linkedid, uniqueid, extension, employee_id, direction, event_at)
VALUES
  ('${TAG}_L1', '${TAG}_U1', '403', '${ids.sales}', 'inbound', '${t0.toISOString()}'),
  ('${TAG}_L2', '${TAG}_U2', '412', '${ids.manager}', 'inbound', '${t0.toISOString()}'),
  ('${TAG}_L3', '${TAG}_U3', '403', '${ids.sales}', 'inbound', '${t1.toISOString()}');

INSERT INTO public.call_transcript_sessions
  (recording_filename, recording_uniqueid, uniqueid, extension, started_at, status)
VALUES
  ('${TAG}_live1.wav', '${TAG}_U1', '${TAG}_U1', '403', '${t0.toISOString()}', 'live'),
  ('${TAG}_live2.wav', '${TAG}_U2', '${TAG}_U2', '412', '${t0.toISOString()}', 'live');

INSERT INTO public.call_logs
  (employee_id, direction, duration_seconds, started_at, ended_at, external_id, source, metadata, extension)
VALUES
  ('${ids.sales}', 'inbound', 30, '${t0.toISOString()}', '${t0.toISOString()}', '${TAG}_L1', 'a5_fixture',
   '{"recording_files":["${TAG}_fin1.wav"],"leg_uniqueids":["${TAG}_U1"]}'::jsonb, '403'),
  ('${ids.manager}', 'inbound', 30, '${t0.toISOString()}', '${t0.toISOString()}', '${TAG}_L2', 'a5_fixture',
   '{"recording_files":["${TAG}_fin2.wav"],"leg_uniqueids":["${TAG}_U2"]}'::jsonb, '412'),
  ('${ids.sales}', 'inbound', 30, '${t1.toISOString()}', '${t1.toISOString()}', '${TAG}_L3', 'a5_fixture',
   '{"recording_files":[],"leg_uniqueids":[]}'::jsonb, '403');

INSERT INTO public.call_transcript_sessions
  (recording_filename, recording_uniqueid, uniqueid, extension, started_at, status)
VALUES
  ('${TAG}_fin1.wav', '${TAG}_U1', '${TAG}_U1', '403', '${t0.toISOString()}', 'pending_final'),
  ('${TAG}_fin2.wav', '${TAG}_U2', '${TAG}_U2', '412', '${t0.toISOString()}', 'pending_final'),
  ('${TAG}_cross.wav', '${TAG}_CROSS', '${TAG}_CROSS', '403',
   '${new Date(t0.getTime() + 20_000).toISOString()}', 'unlinked');
COMMIT;
`);

const live1 = sql(`SELECT public.link_transcript_session_live(id) FROM public.call_transcript_sessions WHERE recording_filename='${TAG}_live1.wav';`);
const live2 = sql(`SELECT public.link_transcript_session_live(id) FROM public.call_transcript_sessions WHERE recording_filename='${TAG}_live2.wav';`);
const pending = sql(`SELECT public.link_pending_transcript_sessions();`);

const liveCounts = sql(`
SELECT
  SUM(CASE WHEN recording_filename='${TAG}_live1.wav' AND ring_event_id IS NOT NULL AND employee_id='${ids.sales}' THEN 1 ELSE 0 END)::text
  || ' ' ||
  SUM(CASE WHEN recording_filename='${TAG}_live2.wav' AND ring_event_id IS NOT NULL AND employee_id='${ids.manager}' THEN 1 ELSE 0 END)::text
  FROM public.call_transcript_sessions
 WHERE recording_filename LIKE '${TAG}_live%';
`);

const finalCounts = sql(`
SELECT
  SUM(CASE WHEN recording_filename='${TAG}_fin1.wav' AND call_log_id IS NOT NULL AND link_method='recording_file' THEN 1 ELSE 0 END)::text
  || ' ' ||
  SUM(CASE WHEN recording_filename='${TAG}_fin2.wav' AND call_log_id IS NOT NULL AND link_method='recording_file' THEN 1 ELSE 0 END)::text
  || ' ' ||
  SUM(CASE WHEN recording_filename='${TAG}_cross.wav' AND call_log_id IS NULL THEN 1 ELSE 0 END)::text
  FROM public.call_transcript_sessions
 WHERE recording_filename LIKE '${TAG}_%';
`);

const [liveOk1, liveOk2] = liveCounts.split(" ");
const [finOk1, finOk2, crossOk] = finalCounts.split(" ");

const live_n = Number(liveOk1) + Number(liveOk2);
const final_n = Number(finOk1) + Number(finOk2);
const live_total = 2;
const final_total = 2;

const report = {
  tag: TAG,
  live: { linked: live_n, total: live_total, methods: "uniqueid", live1, live2 },
  final: { linked: final_n, total: final_total, methods: "recording_file", pending },
  cross_40s_unlinked: crossOk === "1",
  counts: { liveCounts, finalCounts },
};

const pass = live_n === live_total && final_n === final_total && crossOk === "1";
report.pass = pass;
console.log(JSON.stringify(report, null, 2));

sql(`
DELETE FROM public.call_transcript_sessions WHERE recording_filename LIKE '${TAG}%';
DELETE FROM public.call_logs WHERE source = 'a5_fixture' AND external_id LIKE '${TAG}%';
DELETE FROM public.call_ring_events WHERE uniqueid LIKE '${TAG}%' OR linkedid LIKE '${TAG}%';
`);

if (!pass) {
  console.error("A5_FAIL");
  process.exit(1);
}
console.log("A5_PASS live=2/2 final=2/2 cross_unlinked=1");
process.exit(0);
