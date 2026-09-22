/**
 * Deploy web from worktree per EXECUTION-PROMPT §8.8 — safety check then up.
 * Writes evidence to docs/missions/salesdesk-9-fixes/evidence/FIX/finish-deploy.txt
 */
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LAN = "D:\\AfraKalaTest\\app\\deploy\\lan";
const WT = "D:\\AfraKalaTest\\wt-salesdesk-9-fixes";
const O = join(
  WT,
  "docs\\missions\\salesdesk-9-fixes\\compose.worktree.override.yml",
);
const EVID = join(WT, "docs\\missions\\salesdesk-9-fixes\\evidence\\FIX");

const head = execFileSync("git", ["-C", WT, "rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();
const buildTime = new Date().toISOString().replace(/\.\d+Z$/, "");

function compose(args, outFile) {
  const r = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      ".env.lan",
      "-f",
      "docker-compose.yml",
      ...args,
    ],
    {
      cwd: LAN,
      encoding: "utf8",
      env: {
        ...process.env,
        DISABLE_LOVABLE_MCP: "1",
        GIT_SHA: head,
        BUILD_TIME: buildTime,
      },
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const text = (r.stdout || "") + (r.stderr || "");
  if (outFile) writeFileSync(outFile, text, "utf8");
  if (r.status !== 0) {
    console.error(text.slice(-2000));
    process.exit(r.status || 1);
  }
  return text;
}

const baseCfg = compose(["config"], join(EVID, "compose-base-finish.yml"));
const resCfg = compose(
  ["-f", O, "config"],
  join(EVID, "compose-resolved-finish.yml"),
);

// Safety: only web.build.context may differ — crude check: other service image names
function serviceKeys(yml) {
  // pull top-level service names from `docker compose config` YAML is heavy;
  // compare md5 of config with web section stripped via regex on "web:"
  return yml;
}

// Simple safety: ensure db/rest/kong image lines identical
function extractNonWeb(yml) {
  const lines = yml.split(/\r?\n/);
  const out = [];
  let skip = false;
  let depth = 0;
  for (const line of lines) {
    if (/^  web:/.test(line)) {
      skip = true;
      depth = 2;
      continue;
    }
    if (skip) {
      if (/^  \w/.test(line) && !/^  web:/.test(line)) skip = false;
      else continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

const baseNon = extractNonWeb(baseCfg);
const resNon = extractNonWeb(resCfg);
if (baseNon !== resNon) {
  writeFileSync(
    join(EVID, "finish-deploy-safety-fail.txt"),
    "NON_WEB_DIFF\n",
    "utf8",
  );
  console.error("HARD STOP: non-web services would change");
  process.exit(2);
}
console.log("compose safety PASS");

compose(
  ["-f", O, "up", "-d", "--build", "--no-deps", "web"],
  join(EVID, "finish-deploy-up.txt"),
);

execFileSync("docker", ["restart", "afrakala-lan-rest"], { encoding: "utf8" });

const sha = execFileSync(
  "docker",
  ["exec", "afrakala-lan-web", "printenv", "APP_GIT_SHA"],
  { encoding: "utf8" },
).trim();
console.log("APP_GIT_SHA", sha);
console.log("HEAD", head);
writeFileSync(
  join(EVID, "finish-deploy.txt"),
  `HEAD=${head}\nAPP_GIT_SHA=${sha}\nMATCH=${sha === head}\nsafety=PASS\n`,
  "utf8",
);
if (sha !== head) process.exit(3);

