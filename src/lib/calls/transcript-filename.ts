/** Parse Issabel MixMonitor names: ARG1-ARG2-FROMEXTEN-YYYYMMDD-HHMMSS-UNIQUEID.wav */

export const SKIP_RECORDING_PREFIXES = new Set(["internal"]);

export type ParsedRecordingName = {
  basename: string;
  prefix: string;
  extension: string | null;
  queue: string | null;
  timestr: string;
  recordingUniqueid: string;
  startedAtUtc: Date;
};

const DATE_RE = /^\d{8}$/;
const TIME_RE = /^\d{6}$/;
const ALLOWED_PREFIX = new Set(["exten", "out", "q"]);

export function recordingBasename(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) return null;
  const base = trimmed.split("/").pop() ?? "";
  return base.length > 0 ? base : null;
}

export function parseIssabelRecordingName(filename: string): ParsedRecordingName | null {
  const basename = recordingBasename(filename);
  if (!basename) return null;
  const lower = basename.toLowerCase();
  if (lower.endsWith(".gsm")) return null;
  if (!lower.endsWith(".wav")) return null;

  const stem = basename.slice(0, -4);
  const tokens = stem.split("-");
  if (tokens.length < 6) return null;

  const timeTok = tokens[tokens.length - 2] ?? "";
  const dateTok = tokens[tokens.length - 3] ?? "";
  if (!DATE_RE.test(dateTok) || !TIME_RE.test(timeTok)) return null;

  const prefix = (tokens[0] ?? "").toLowerCase();
  if (SKIP_RECORDING_PREFIXES.has(prefix) || !ALLOWED_PREFIX.has(prefix)) return null;

  const uniqueid = tokens[tokens.length - 1] ?? "";
  if (!uniqueid) return null;

  let extension: string | null = null;
  let queue: string | null = null;
  if (prefix === "exten") {
    extension = tokens[1] ?? null;
  } else if (prefix === "out") {
    extension = tokens[2] ?? null;
  } else if (prefix === "q") {
    queue = tokens[1] ?? null;
  }

  const wall = `${dateTok.slice(0, 4)}-${dateTok.slice(4, 6)}-${dateTok.slice(6, 8)} ${timeTok.slice(0, 2)}:${timeTok.slice(2, 4)}:${timeTok.slice(4, 6)}`;
  // Avoid circular import: Tehran offset +03:30 year-round (Iran, no DST).
  const naiveUtc = Date.parse(wall.replace(" ", "T") + "Z");
  if (Number.isNaN(naiveUtc)) return null;
  const startedAtUtc = new Date(naiveUtc - 3.5 * 3600 * 1000);

  return {
    basename,
    prefix,
    extension,
    queue,
    timestr: `${dateTok}-${timeTok}`,
    recordingUniqueid: uniqueid,
    startedAtUtc,
  };
}

export function collectRecordingMeta(
  legs: { recordingfile?: string; uniqueid?: string }[],
): { recordingFiles: string[]; legUniqueids: string[] } {
  const recordingFiles = [
    ...new Set(
      legs
        .map((l) => recordingBasename(l.recordingfile))
        .filter((n): n is string => Boolean(n)),
    ),
  ];
  const legUniqueids = [...new Set(legs.map((l) => l.uniqueid ?? "").filter(Boolean))];
  return { recordingFiles, legUniqueids };
}
