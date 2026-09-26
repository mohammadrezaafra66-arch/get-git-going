/**
 * C-4 · خواندن CDR مرکز تلفن ایزابل (MariaDB) — فقط سمت سرور.
 *
 * چرا این ماژول در Node است و نه در پایگاه‌داده: افزونهٔ `mysql_fdw` روی این
 * نصب Postgres در دسترس نیست (`pg_available_extensions` آن را ندارد)، پس هیچ
 * مسیر Postgres→MySQL وجود ندارد.
 *
 * همهٔ اعداد زیر روی همین نصب اندازه‌گیری شده‌اند (۲۰۲۶-۰۹-۰۷)، نه از مستندات:
 *   • جدول `cdr` در پایگاه `asteriskcdrdb` — ۱٬۸۶۵٬۲۴۸ ردیف.
 *   • `calldate` ساعت دیواریِ محلیِ تهران است، نه UTC:
 *     `@@system_time_zone = +0330`، `NOW()`=12:11:06 در برابر `UTC_TIMESTAMP()`=08:41:06.
 *   • `uniqueid` نه کلید ردیف است و نه کلید تماس — یک مقدار تا ۴۳۵ ردیف دیده شد.
 *     کلید تماس `linkedid` است (تصمیم مالک D-56a).
 *   • `dcontext` به‌تنهایی جهت را نمی‌دهد: `from-internal` در ۳۰ روز
 *     ۶۵٬۲۶۱ ردیف ورودی دارد در برابر ۵٬۴۱۳ ردیف خروجی. جهت از جای «داخلی»
 *     در `src`/`dst`/`dstchannel` درمی‌آید، نه از نام context.
 */
import mysql from "mysql2/promise";
import { collectRecordingMeta } from "./transcript-filename";

const TEHRAN_TZ = "Asia/Tehran" as const;

/** داخلی کارشناس یا صف: ۳ تا ۴ رقم. مقادیر ۳-۴ رقمی همیشه از normalize_identifier خالی برمی‌گردند. */
const EXTENSION_RE = /^[0-9]{3,4}$/;
/** صف‌های اندازه‌گیری‌شدهٔ این مرکز: 6001، 6002، 6003، 6006. */
const QUEUE_RE = /^60[0-9]{1,2}$/;
/** داخلیِ کارشناس در نام کانال: `SIP/445-000060c1` یا `Local/445@from-queue-...`. */
const CHANNEL_EXT_RE = /^(?:SIP|PJSIP|IAX2)\/([0-9]{3,4})-/;
const LOCAL_CHANNEL_EXT_RE = /^Local\/([0-9]{3,4})@/;

/** D-56c — «بی‌پاسخ» فقط این دو. CONGESTION و FAILED خرابی خط‌اند و به کسی نسبت داده نمی‌شوند. */
const MISSED_DISPOSITIONS = new Set(["NO ANSWER", "BUSY"]);
/** اولویت انتخاب disposition نمایندهٔ یک تماس، از مقادیر واقعیِ همین نصب. */
const DISPOSITION_PRIORITY = ["ANSWERED", "NO ANSWER", "BUSY", "CONGESTION", "FAILED"] as const;

export type IssabelConnectionConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export type CdrLeg = {
  calldate: string;
  src: string;
  dst: string;
  dcontext: string;
  channel: string;
  dstchannel: string;
  disposition: string;
  duration: number;
  billsec: number;
  uniqueid: string;
  linkedid: string;
  sequence: number;
  recordingfile: string;
};

export type GroupedCall = {
  linkedId: string;
  startedAtUtc: Date;
  endedAtUtc: Date;
  direction: "inbound" | "outbound" | "internal";
  durationSeconds: number;
  disposition: string;
  isMissed: boolean;
  isInternal: boolean;
  /** داخلیِ کارشناسی که تماس به او نسبت داده می‌شود؛ null یعنی قابل نسبت‌دادن نیست. */
  extension: string | null;
  /** شمارهٔ خام سمت مشتری، همان‌طور که سوییچ نوشته (بدون دست‌کاری). */
  customerNumberRaw: string | null;
  /** همان شماره با پیشوند شماره‌گیری برداشته‌شده، اگر پیشوند داشت. */
  customerNumberStripped: string | null;
  legCount: number;
  dcontexts: string[];
  queue: string | null;
  recordingFiles: string[];
  legUniqueids: string[];
};

/**
 * پیکربندی اتصال از متغیرهای محیطی. هیچ مقداری هاردکد نمی‌شود و هیچ‌کدام
 * پیشوند `VITE_` ندارند — این‌ها راز سمت سرورند و نباید به مرورگر برسند.
 */
export function readIssabelConfig(): { ok: true; config: IssabelConnectionConfig } | { ok: false; missing: string[] } {
  const host = process.env.ISSABEL_CDR_HOST;
  const user = process.env.ISSABEL_CDR_USER;
  const password = process.env.ISSABEL_CDR_PASSWORD;
  const database = process.env.ISSABEL_CDR_DB;

  const missing: string[] = [];
  if (!host) missing.push("ISSABEL_CDR_HOST");
  if (!user) missing.push("ISSABEL_CDR_USER");
  if (!password) missing.push("ISSABEL_CDR_PASSWORD");
  if (!database) missing.push("ISSABEL_CDR_DB");
  if (missing.length > 0) return { ok: false, missing };

  const port = Number(process.env.ISSABEL_CDR_PORT ?? "3306");
  return {
    ok: true,
    config: {
      host: host as string,
      user: user as string,
      password: password as string,
      database: database as string,
      port: Number.isFinite(port) && port > 0 ? port : 3306,
    },
  };
}

/** اختلاف دقیقه‌ایِ ساعت تهران با UTC در یک لحظهٔ مشخص (از پایگاه tz خود Node، نه عدد ثابت). */
function tehranOffsetMinutes(instant: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = new Map(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(parts.get("year")),
    Number(parts.get("month")) - 1,
    Number(parts.get("day")),
    Number(parts.get("hour")) === 24 ? 0 : Number(parts.get("hour")),
    Number(parts.get("minute")),
    Number(parts.get("second")),
  );
  return (asIfUtc - instant.getTime()) / 60000;
}

/** «YYYY-MM-DD HH:MM:SS» به وقت تهران → لحظهٔ UTC. */
export function tehranWallClockToUtc(wallClock: string): Date {
  const naive = Date.parse(`${wallClock.trim().replace(" ", "T")}Z`);
  if (Number.isNaN(naive)) throw new Error(`زمان CDR قابل خواندن نیست: ${wallClock}`);
  let utcMs = naive - tehranOffsetMinutes(new Date(naive)) * 60000;
  utcMs = naive - tehranOffsetMinutes(new Date(utcMs)) * 60000;
  return new Date(utcMs);
}

/** لحظهٔ UTC → «YYYY-MM-DD HH:MM:SS» به وقت تهران، برای گذاشتن در شرط WHERE روی calldate. */
export function utcToTehranWallClock(instant: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TEHRAN_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = new Map(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const hour = parts.get("hour") === "24" ? "00" : parts.get("hour");
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")} ${hour}:${parts.get("minute")}:${parts.get("second")}`;
}

function isExtension(value: string): boolean {
  return EXTENSION_RE.test(value);
}

function agentExtensionOfLeg(leg: CdrLeg): string | null {
  const fromDstChannel = CHANNEL_EXT_RE.exec(leg.dstchannel) ?? LOCAL_CHANNEL_EXT_RE.exec(leg.dstchannel);
  if (fromDstChannel && !QUEUE_RE.test(fromDstChannel[1])) return fromDstChannel[1];
  if (isExtension(leg.dst) && !QUEUE_RE.test(leg.dst)) return leg.dst;
  return null;
}

function agentExtensionOfChannel(leg: CdrLeg): string | null {
  const m = CHANNEL_EXT_RE.exec(leg.channel);
  if (m && !QUEUE_RE.test(m[1])) return m[1];
  if (isExtension(leg.src) && !QUEUE_RE.test(leg.src)) return leg.src;
  return null;
}

/**
 * شکل‌های موبایل ایران که `normalize_identifier('mobile_e164', …)` می‌پذیرد —
 * اندازه‌گیری‌شده روی تابع زندهٔ پایگاه‌داده، نه برداشت از مستندات.
 */
const VALID_MOBILE_RE = /^(?:09[0-9]{9}|9[0-9]{9}|989[0-9]{9}|00989[0-9]{9})$/;

/**
 * برداشتن پیشوند شماره‌گیری خط بیرون — **مشروط، نه بی‌قید**.
 *
 * پیشوند از ردیف تنظیمات می‌آید (`issabel_outbound_dial_prefix`)، نه از داخل
 * این regex، تا اگر ادمین مرکز تلفن پیشوند را عوض کرد کد دست نخورد.
 *
 * شرط «باقی‌مانده باید یک موبایل معتبر باشد» خودش محافظ است: یک
 * `replace(/^9/, '')` بی‌قید هر `dst` ی را که به‌درستی با ۹ شروع می‌شود خراب
 * می‌کرد. اگر باقی‌مانده موبایل معتبر نبود `null` برمی‌گردد و شمارهٔ خام
 * دست‌نخورده به تطبیق می‌رود.
 */
export function stripDialPrefix(raw: string, prefix: string): string | null {
  if (!prefix || !raw.startsWith(prefix)) return null;
  const rest = raw.slice(prefix.length);
  return VALID_MOBILE_RE.test(rest) ? rest : null;
}

/**
 * تبدیل ردیف‌های خام یک `linkedid` به یک تماس واحد — تصمیم مالک D-56a.
 * کل گفت‌وگو، با هر تعداد زنگ در صف و هر تعداد انتقال، یک ردیف است.
 */
export function groupLegsIntoCall(legs: CdrLeg[], dialPrefix: string): GroupedCall | null {
  if (legs.length === 0) return null;
  const ordered = [...legs].sort((a, b) => a.sequence - b.sequence);
  const origin = ordered[0];

  const originSrcIsExt = isExtension(origin.src);
  const originDstIsExt = isExtension(origin.dst);

  let direction: GroupedCall["direction"];
  let customerNumberRaw: string | null;
  if (originSrcIsExt && originDstIsExt) {
    direction = "internal";
    customerNumberRaw = null;
  } else if (originSrcIsExt) {
    direction = "outbound";
    customerNumberRaw = origin.dst || null;
  } else {
    // یا داخلی در dst است (تماس ورودی که به صف/داخلی رسید)، یا هیچ‌کدام
    // (تماس ورودی که فقط به ترانک/اعلان رسید) — هر دو ورودی‌اند.
    direction = "inbound";
    customerNumberRaw = origin.src || null;
  }

  const answered = ordered.filter((l) => l.disposition === "ANSWERED");
  const durationSeconds = answered.reduce((max, l) => Math.max(max, l.billsec), 0);

  // داخلیِ مسئول تماس.
  let extension: string | null = null;
  if (direction === "outbound" || direction === "internal") {
    extension = agentExtensionOfChannel(origin);
  } else if (answered.length > 0) {
    // بلندترین پایِ پاسخ‌داده‌شده، همان کسی است که واقعاً حرف زد.
    const best = [...answered].sort((a, b) => b.billsec - a.billsec);
    for (const leg of best) {
      const ext = agentExtensionOfLeg(leg);
      if (ext) {
        extension = ext;
        break;
      }
    }
  } else {
    // بی‌پاسخ: فقط وقتی قابل نسبت‌دادن است که دقیقاً یک داخلی زنگ خورده باشد.
    // تماس صفی که روی ۱۵ داخلی زنگ خورده به هیچ‌کس نسبت داده نمی‌شود — D-56a.
    const candidates = new Set<string>();
    for (const leg of ordered) {
      const ext = agentExtensionOfLeg(leg);
      if (ext) candidates.add(ext);
    }
    extension = candidates.size === 1 ? [...candidates][0] : null;
  }

  const dispositions = new Set(ordered.map((l) => l.disposition));
  const disposition = DISPOSITION_PRIORITY.find((d) => dispositions.has(d)) ?? origin.disposition;

  const isMissed = answered.length === 0 && ordered.some((l) => MISSED_DISPOSITIONS.has(l.disposition));

  const startedAtUtc = tehranWallClockToUtc(origin.calldate);
  const endedAtUtc = ordered.reduce((latest, leg) => {
    const end = new Date(tehranWallClockToUtc(leg.calldate).getTime() + Math.max(0, leg.duration) * 1000);
    return end > latest ? end : latest;
  }, startedAtUtc);

  const queue = ordered.map((l) => l.dst).find((d) => QUEUE_RE.test(d)) ?? null;

  const { recordingFiles, legUniqueids } = collectRecordingMeta(ordered);

  return {
    linkedId: origin.linkedid,
    startedAtUtc,
    endedAtUtc,
    direction,
    durationSeconds,
    disposition,
    isMissed,
    // مقدار ۳-۴ رقمی همیشه از normalize_identifier('mobile_e164', …) خالی برمی‌گردد
    // (اندازه‌گیری‌شده روی 413 و 6002 و 101)، پس این شرط همان شرط بریف است.
    isInternal: originSrcIsExt && originDstIsExt,
    extension,
    customerNumberRaw,
    customerNumberStripped: customerNumberRaw ? stripDialPrefix(customerNumberRaw, dialPrefix) : null,
    legCount: ordered.length,
    dcontexts: [...new Set(ordered.map((l) => l.dcontext))],
    queue,
    recordingFiles,
    legUniqueids,
  };
}

export type FetchCallsOptions = {
  sinceUtc: Date;
  untilUtc: Date;
  maxCalls: number;
  pageSize: number;
  dialPrefix: string;
};

export type FetchCallsResult = {
  calls: GroupedCall[];
  cdrRowsRead: number;
  reachedCap: boolean;
};

/**
 * خواندن صفحه‌به‌صفحهٔ تماس‌ها. هیچ‌وقت کل جدول اسکن نمی‌شود:
 * بازهٔ زمانی همیشه بسته است، هر صفحه حداکثر `pageSize` تماس می‌آورد، و
 * `maxCalls` یک سقف سخت روی کل اجراست تا یک اجرای بدون‌ناظر (cron)
 * نتواند ۱٫۸۶ میلیون ردیف را یکجا بکشد.
 */
export async function fetchIssabelCalls(
  config: IssabelConnectionConfig,
  options: FetchCallsOptions,
): Promise<FetchCallsResult> {
  const sinceLocal = utcToTehranWallClock(options.sinceUtc);
  const untilLocal = utcToTehranWallClock(options.untilUtc);

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: 15000,
    dateStrings: true,
    // فقط خواندن — این ماژول هیچ‌جا INSERT/UPDATE/DELETE نمی‌زند.
    multipleStatements: false,
  });

  try {
    const calls: GroupedCall[] = [];
    let cdrRowsRead = 0;
    let offset = 0;
    let reachedCap = false;

    for (;;) {
      const remaining = options.maxCalls - calls.length;
      if (remaining <= 0) {
        reachedCap = true;
        break;
      }
      const limit = Math.min(options.pageSize, remaining);

      // گام ۱ — فقط شناسهٔ تماس‌های این صفحه. ستون calldate ایندکس دارد.
      const [idRows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT linkedid, MIN(calldate) AS first_leg
           FROM cdr
          WHERE calldate >= ? AND calldate < ?
          GROUP BY linkedid
          ORDER BY first_leg, linkedid
          LIMIT ? OFFSET ?`,
        [sinceLocal, untilLocal, limit, offset],
      );
      if (idRows.length === 0) break;

      const linkedIds = idRows.map((r) => String(r.linkedid));

      // گام ۲ — همهٔ پاهای این تماس‌ها، حتی پاهایی که خارج از بازه افتاده‌اند،
      // تا تماسی که روی مرز بازه نشسته نصفه گروه‌بندی نشود.
      const [legRows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT calldate, src, dst, dcontext, channel, dstchannel, disposition,
                duration, billsec, uniqueid, linkedid, sequence, recordingfile
           FROM cdr
          WHERE linkedid IN (?)
          ORDER BY linkedid, sequence`,
        [linkedIds],
      );
      cdrRowsRead += legRows.length;

      const byLinkedId = new Map<string, CdrLeg[]>();
      for (const row of legRows) {
        const leg: CdrLeg = {
          calldate: String(row.calldate),
          src: String(row.src ?? ""),
          dst: String(row.dst ?? ""),
          dcontext: String(row.dcontext ?? ""),
          channel: String(row.channel ?? ""),
          dstchannel: String(row.dstchannel ?? ""),
          disposition: String(row.disposition ?? ""),
          duration: Number(row.duration ?? 0),
          billsec: Number(row.billsec ?? 0),
          uniqueid: String(row.uniqueid ?? ""),
          linkedid: String(row.linkedid ?? ""),
          sequence: Number(row.sequence ?? 0),
          recordingfile: String(row.recordingfile ?? ""),
        };
        const bucket = byLinkedId.get(leg.linkedid);
        if (bucket) bucket.push(leg);
        else byLinkedId.set(leg.linkedid, [leg]);
      }

      for (const linkedId of linkedIds) {
        const legs = byLinkedId.get(linkedId);
        if (!legs) continue;
        const call = groupLegsIntoCall(legs, options.dialPrefix);
        if (call) calls.push(call);
      }

      offset += idRows.length;
      if (idRows.length < limit) break;
      if (calls.length >= options.maxCalls) {
        reachedCap = true;
        break;
      }
    }

    return { calls, cdrRowsRead, reachedCap };
  } finally {
    await connection.end();
  }
}
