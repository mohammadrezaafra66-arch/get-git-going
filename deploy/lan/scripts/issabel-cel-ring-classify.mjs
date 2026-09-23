/**
 * Pure CEL row classifiers for live ring popup.
 * Used by issabel-cel-ring-poller.mjs and offline replay tests.
 */

/** Queue member ring: Local/412@from-queue-...;1 */
export function isQueueMemberStart(row) {
  if (row.eventtype !== "CHAN_START") return false;
  if ((row.context || "") !== "from-queue") return false;
  return /^(?:Local)\/(\d{2,6})@from-queue-[^;]+;1$/.test(row.channame || "");
}

export function extensionFromQueueChannel(channame) {
  const m = (channame || "").match(/^Local\/(\d{2,6})@from-queue-/);
  return m ? m[1] : null;
}

/** Outbound: SIP/412 dials an external number (exten length >= 5). */
export function parseOutbound(row) {
  if (row.eventtype !== "CHAN_START") return null;
  if ((row.context || "") !== "from-internal") return null;
  const ch = row.channame || "";
  const m = ch.match(/^(?:SIP|PJSIP)\/(\d{2,6})-/);
  if (!m) return null;
  const dest = (row.exten || "").trim();
  if (!dest || dest.length < 5 || dest === "s" || dest === "h") return null;
  if (/^\d{2,4}$/.test(dest)) return null;
  return { extension: m[1], destNumber: dest };
}

/**
 * Direct inbound: trunk → IVR/DID → Dial(SIP/412).
 * Signal: CHAN_START on SIP|PJSIP/{ext} in from-internal while linkedid
 * already has a from-trunk caller. Skips outbound dials (exten length >= 5).
 */
export function parseDirectInbound(row, callersByLinkedid) {
  if (row.eventtype !== "CHAN_START") return null;
  if ((row.context || "") !== "from-internal") return null;
  if (parseOutbound(row)) return null;

  const ch = row.channame || "";
  const m = ch.match(/^(?:SIP|PJSIP)\/(\d{2,6})-/);
  if (!m) return null;

  const extension = m[1];
  const linkedid = row.linkedid || "";
  if (!linkedid) return null;

  const caller = callersByLinkedid?.get?.(linkedid);
  const callerNumber = caller?.number || null;
  if (!callerNumber || callerNumber.length < 5) return null;
  if (/^\d{2,4}$/.test(callerNumber)) return null;

  return { extension, callerNumber };
}

export function rememberTrunkCaller(row, callers, now = Date.now()) {
  if (row.eventtype !== "CHAN_START") return false;
  if ((row.context || "") !== "from-trunk") return false;
  const num = (row.cid_num || row.cid_ani || "").trim();
  if (!row.linkedid || !num || num.length < 5) return false;
  callers.set(row.linkedid, { number: num, at: now });
  return true;
}
