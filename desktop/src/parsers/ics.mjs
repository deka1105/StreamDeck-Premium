// iCalendar (RFC 5545) parsing for agendas: VEVENTs with time zones, all-day
// events, recurrence (RRULE with FREQ/INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY),
// EXDATE and per-instance overrides (RECURRENCE-ID). Dependency-free.

// Outlook publishes Windows zone names; map the common ones to IANA.
const WINDOWS_ZONES = {
  "Pacific Standard Time": "America/Los_Angeles",
  "Mountain Standard Time": "America/Denver",
  "Central Standard Time": "America/Chicago",
  "Eastern Standard Time": "America/New_York",
  "Atlantic Standard Time": "America/Halifax",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "E. Europe Standard Time": "Europe/Bucharest",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney",
  UTC: "UTC",
};

function validZone(tz) {
  if (!tz) return null;
  const z = WINDOWS_ZONES[tz] ?? tz.replace(/^\/[^/]+\//, ""); // strip "/mozilla.org/…/" style prefixes
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return z;
  } catch {
    return null;
  }
}

/** Offset (ms) of `zone` from UTC at instant `t`. */
function zoneOffset(t, zone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** Wall-clock time in `zone` → UTC ms. */
export function zonedToUtc(y, mo, d, h, mi, s, zone) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let t = guess - zoneOffset(guess, zone);
  t = guess - zoneOffset(t, zone); // second pass fixes DST edges
  return t;
}

/** Parse an ICS date/time value. Returns {t (ms), allDay}. */
export function parseDate(value, params = {}) {
  const v = String(value ?? "").trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h || params.VALUE === "DATE") return { t: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
  if (z) return { t: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  const zone = validZone(params.TZID);
  if (zone) return { t: zonedToUtc(+y, +mo - 1, +d, +h, +mi, +s, zone), allDay: false };
  return { t: new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime(), allDay: false }; // floating: host's local time
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const ms = (((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 24 + +(m[4] ?? 0)) * 60 + +(m[5] ?? 0)) * 60_000 + +(m[6] ?? 0) * 1000;
  return m[1] === "-" ? -ms : ms;
}

function unescapeText(s) {
  return String(s ?? "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

/** Split into properties: [{name, params, value}] per component. */
function lines(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "") // unfold
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(":");
      if (i < 0) return null;
      const [name, ...ps] = line.slice(0, i).split(";");
      const params = Object.fromEntries(ps.map((p) => p.split("=")).map(([k, v]) => [k.toUpperCase(), (v ?? "").replace(/^"|"$/g, "")]));
      return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
    })
    .filter(Boolean);
}

/** Raw VEVENTs from an ICS document. */
export function parseEvents(text) {
  const events = [];
  let cur = null;
  let depth = 0;
  for (const p of lines(text)) {
    if (p.name === "BEGIN" && p.value.toUpperCase() === "VEVENT") {
      cur = { exdates: [] };
      depth = 0;
      continue;
    }
    if (!cur) continue;
    if (p.name === "BEGIN") depth++;
    else if (p.name === "END" && p.value.toUpperCase() === "VEVENT") {
      if (cur.start) events.push(cur);
      cur = null;
    } else if (p.name === "END") depth--;
    else if (depth > 0) continue; // inside VALARM etc.
    else if (p.name === "SUMMARY") cur.title = unescapeText(p.value);
    else if (p.name === "LOCATION") cur.location = unescapeText(p.value);
    else if (p.name === "UID") cur.uid = p.value;
    else if (p.name === "STATUS") cur.status = p.value.toUpperCase();
    else if (p.name === "DTSTART") cur.start = parseDate(p.value, p.params);
    else if (p.name === "DTEND") cur.end = parseDate(p.value, p.params);
    else if (p.name === "DURATION") cur.duration = parseDuration(p.value);
    else if (p.name === "RRULE") cur.rrule = Object.fromEntries(p.value.split(";").map((kv) => kv.split("=")).map(([k, v]) => [k.toUpperCase(), v]));
    else if (p.name === "EXDATE") for (const v of p.value.split(",")) cur.exdates.push(parseDate(v, p.params)?.t);
    else if (p.name === "RECURRENCE-ID") cur.recurrenceId = parseDate(p.value, p.params)?.t;
  }
  return events;
}

const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Occurrence start times of `ev` that start before `to` (and end after `from`). */
export function occurrences(ev, from, to, max = 500) {
  const start = ev.start.t;
  const dur = ev.end ? ev.end.t - start : ev.duration ?? (ev.start.allDay ? 86400_000 : 0);
  if (!ev.rrule) return start < to && start + Math.max(dur, 1) > from ? [start] : [];
  const r = ev.rrule;
  const freq = r.FREQ;
  const interval = Math.max(1, +(r.INTERVAL ?? 1));
  const count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? parseDate(r.UNTIL)?.t ?? Infinity : Infinity;
  const byday = r.BYDAY ? r.BYDAY.split(",").map((x) => {
    const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x);
    return m ? { n: m[1] ? +m[1] : 0, day: DAYS[m[2]] } : null;
  }).filter(Boolean) : null;
  const bymonthday = r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number) : null;
  const s0 = new Date(start);
  const tod = [s0.getHours(), s0.getMinutes(), s0.getSeconds()];
  const out = [];
  let emitted = 0;
  const consider = (t) => {
    if (t < start || t > until || emitted >= count) return false;
    emitted++;
    if (t < to && t + Math.max(dur, 1) > from) out.push(t);
    return true;
  };
  const at = (y, m, d) => new Date(y, m, d, ...tod).getTime();
  for (let i = 0; i < max && emitted < count; i++) {
    const step = i * interval;
    let cands = [];
    if (freq === "DAILY") cands = [at(s0.getFullYear(), s0.getMonth(), s0.getDate() + step)];
    else if (freq === "WEEKLY") {
      const weekStart = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() - s0.getDay() + step * 7);
      const days = byday ? byday.map((b) => b.day) : [s0.getDay()];
      cands = days.sort((a, b) => a - b).map((d) => at(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + d));
    } else if (freq === "MONTHLY") {
      const y = s0.getFullYear();
      const m = s0.getMonth() + step;
      const dim = new Date(y, m + 1, 0).getDate();
      if (byday) {
        for (const b of byday) {
          const all = [];
          for (let d = 1; d <= dim; d++) if (new Date(y, m, d).getDay() === b.day) all.push(d);
          const picks = b.n ? [b.n > 0 ? all[b.n - 1] : all[all.length + b.n]] : all;
          for (const d of picks) if (d) cands.push(at(y, m, d));
        }
      } else {
        for (const d of bymonthday ?? [s0.getDate()]) {
          const dd = d < 0 ? dim + d + 1 : d;
          if (dd >= 1 && dd <= dim) cands.push(at(y, m, dd));
        }
      }
      cands.sort((a, b) => a - b);
    } else if (freq === "YEARLY") {
      const y = s0.getFullYear() + step;
      if (new Date(y, s0.getMonth(), s0.getDate()).getMonth() === s0.getMonth()) cands = [at(y, s0.getMonth(), s0.getDate())];
    } else break;
    if (!cands.length && cands[0] === undefined && freq !== "YEARLY") continue;
    if (cands.some((t) => t > until) && cands.every((t) => t > until)) break;
    if (cands.length && cands[0] >= to) break;
    for (const t of cands) consider(t);
  }
  return out;
}

/**
 * Agenda items between `from` and `to` from one or more ICS documents:
 * [{title, start, end, allDay, location, uid}] sorted by start.
 */
export function agenda(texts, from, to) {
  const all = (Array.isArray(texts) ? texts : [texts]).flatMap(parseEvents);
  const overrides = new Map();
  for (const ev of all) if (ev.recurrenceId) overrides.set(`${ev.uid}@${ev.recurrenceId}`, ev);
  const out = [];
  for (const ev of all) {
    if (ev.recurrenceId || ev.status === "CANCELLED") continue;
    const dur = ev.end ? ev.end.t - ev.start.t : ev.duration ?? (ev.start.allDay ? 86400_000 : 0);
    const ex = new Set(ev.exdates.filter(Boolean));
    for (const t of occurrences(ev, from, to)) {
      if (ex.has(t)) continue;
      const o = overrides.get(`${ev.uid}@${t}`);
      if (o) {
        if (o.status === "CANCELLED") continue;
        const od = o.end ? o.end.t - o.start.t : dur;
        if (o.start.t < to && o.start.t + Math.max(od, 1) > from) out.push({ title: o.title ?? ev.title ?? "", start: o.start.t, end: o.start.t + od, allDay: o.start.allDay, location: o.location ?? ev.location ?? "", uid: ev.uid });
        continue;
      }
      out.push({ title: ev.title ?? "", start: t, end: t + dur, allDay: ev.start.allDay, location: ev.location ?? "", uid: ev.uid });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
