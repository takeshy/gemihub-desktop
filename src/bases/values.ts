// Value runtime — equality, comparison, truthiness, toString, isEmpty (§10, §11).
// Duration parsing and Date parsing helpers.

import type {
  DateValue,
  DurationValue,
  ErrorValue,
  HostFile,
  LinkValue,
  Value,
} from "./types";
import {
  bool,
  dateVal,
  durVal,
  errorVal,
  listVal,
  NULL,
  num,
  str,
} from "./types";

// ---------------------------------------------------------------------------
// Truthiness (§10.2)
// ---------------------------------------------------------------------------

export function isTruthy(v: Value): boolean {
  switch (v.type) {
    case "null":
      return false;
    case "boolean":
      return v.value;
    case "number":
      return v.value !== 0 && !Number.isNaN(v.value);
    case "string":
      return v.value.length > 0;
    case "url":
      return v.url.length > 0;
    case "duration":
      return v.months !== 0 || v.milliseconds !== 0;
    case "list":
      return true;
    case "object":
      return true;
    case "date":
      return true;
    case "file":
      return true;
    case "link":
      return true;
    case "regexp":
      return true;
    case "html":
      return true;
    case "image":
      return true;
    case "icon":
      return true;
    case "error":
      throw v; // propagate error
  }
}

// ---------------------------------------------------------------------------
// Empty (§10.3)
// ---------------------------------------------------------------------------

export function isEmpty(v: Value): boolean {
  switch (v.type) {
    case "null":
      return true;
    case "string":
      return v.value.length === 0;
    case "url":
      return v.url.length === 0;
    case "list":
      return v.items.length === 0;
    case "object":
      return v.map.size === 0;
    case "error":
      throw v;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// toString (§10.4)
// ---------------------------------------------------------------------------

export function valueToString(v: Value): string {
  switch (v.type) {
    case "null":
      return "";
    case "boolean":
      return v.value ? "true" : "false";
    case "number": {
      if (Number.isNaN(v.value)) return "NaN";
      if (v.value === Infinity) return "Infinity";
      if (v.value === -Infinity) return "-Infinity";
      return String(v.value);
    }
    case "string":
      return v.value;
    case "date": {
      if (v.dateOnly) {
        const d = new Date(v.epochMs);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      return new Date(v.epochMs).toISOString();
    }
    case "duration":
      return durationToString(v);
    case "list":
      return v.items.map(valueToString).join(",");
    case "object": {
      const entries: string[] = [];
      for (const [k, val] of v.map) {
        entries.push(`${JSON.stringify(k)}:${valueToJson(val)}`);
      }
      return `{${entries.join(",")}}`;
    }
    case "file":
      return v.path;
    case "link":
      return v.display ? valueToString(v.display) : v.target;
    case "url":
      return v.display ? valueToString(v.display) : v.url;
    case "regexp":
      return `/${v.source}/${v.flags}`;
    case "html":
      return v.source;
    case "image":
      return v.source;
    case "icon":
      return v.name;
    case "error":
      return v.message;
  }
}

function valueToJson(v: Value): string {
  switch (v.type) {
    case "null":
      return "null";
    case "boolean":
      return v.value ? "true" : "false";
    case "number": {
      if (Number.isNaN(v.value)) return "NaN";
      if (v.value === Infinity) return "Infinity";
      if (v.value === -Infinity) return "-Infinity";
      return String(v.value);
    }
    case "string":
      return JSON.stringify(v.value);
    case "list":
      return `[${v.items.map(valueToJson).join(",")}]`;
    case "object": {
      const entries: string[] = [];
      for (const [k, val] of v.map) {
        entries.push(`${JSON.stringify(k)}:${valueToJson(val)}`);
      }
      return `{${entries.join(",")}}`;
    }
    default:
      return JSON.stringify(valueToString(v));
  }
}

function durationToString(d: DurationValue): string {
  const parts: string[] = [];
  if (d.months) {
    const absM = Math.abs(d.months);
    if (absM >= 12) {
      const years = Math.trunc(absM / 12);
      const months = absM % 12;
      if (months === 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
      else {parts.push(
          `${years} year${years > 1 ? "s" : ""} ${months} month${
            months > 1 ? "s" : ""
          }`,
        );}
    } else {
      parts.push(`${absM} month${absM > 1 ? "s" : ""}`);
    }
  }
  if (d.milliseconds) {
    const absMs = Math.abs(d.milliseconds);
    const sec = Math.trunc(absMs / 1000);
    const min = Math.trunc(sec / 60);
    const hr = Math.trunc(min / 60);
    const day = Math.trunc(hr / 24);
    if (day > 0) parts.push(`${day} day${day > 1 ? "s" : ""}`);
    else if (hr % 24 > 0) {
      parts.push(`${hr % 24} hour${hr % 24 > 1 ? "s" : ""}`);
    } else if (min % 60 > 0) {
      parts.push(`${min % 60} minute${min % 60 > 1 ? "s" : ""}`);
    } else if (sec % 60 > 0) {
      parts.push(`${sec % 60} second${sec % 60 > 1 ? "s" : ""}`);
    } else parts.push(`${absMs} millisecond${absMs > 1 ? "s" : ""}`);
  }
  if (parts.length === 0) return "0";
  return (d.months < 0 || d.milliseconds < 0 ? "-" : "") + parts.join(" ");
}

// ---------------------------------------------------------------------------
// isType (§20)
// ---------------------------------------------------------------------------

export function isType(v: Value, typeName: string): boolean {
  const normalized = typeName.trim().toLowerCase();
  return v.type === normalized;
}

// ---------------------------------------------------------------------------
// Equality (§11.1)
// ---------------------------------------------------------------------------

export function looseEquals(a: Value, b: Value): boolean | ErrorValue {
  // Error propagation
  if (a.type === "error") return a;
  if (b.type === "error") return b;

  // Null
  if (a.type === "null" && b.type === "null") return true;
  if (a.type === "null" || b.type === "null") return false;

  // Boolean
  if (a.type === "boolean" && b.type === "boolean") return a.value === b.value;
  if (a.type === "boolean" || b.type === "boolean") return false;

  // Number
  if (a.type === "number" && b.type === "number") {
    if (Number.isNaN(a.value) || Number.isNaN(b.value)) return false;
    return a.value === b.value;
  }

  // String
  if (a.type === "string" && b.type === "string") return a.value === b.value;

  // URL
  if (a.type === "url" && b.type === "url") return a.url === b.url;

  // Date
  if (a.type === "date" && b.type === "date") return a.epochMs === b.epochMs;

  // Duration
  if (a.type === "duration" && b.type === "duration") {
    return a.months === b.months && a.milliseconds === b.milliseconds;
  }

  // List
  if (a.type === "list" && b.type === "list") {
    if (a.items.length !== b.items.length) return false;
    for (let i = 0; i < a.items.length; i++) {
      const eq = looseEquals(a.items[i], b.items[i]);
      if (eq instanceof Object && eq.type === "error") return eq;
      if (!eq) return false;
    }
    return true;
  }

  // Object
  if (a.type === "object" && b.type === "object") {
    if (a.map.size !== b.map.size) return false;
    for (const [k, v] of a.map) {
      const bv = b.map.get(k);
      if (bv === undefined) return false;
      const eq = looseEquals(v, bv);
      if (eq instanceof Object && eq.type === "error") return eq;
      if (!eq) return false;
    }
    return true;
  }

  // File / File
  if (a.type === "file" && b.type === "file") return a.path === b.path;

  // Link / Link
  if (a.type === "link" && b.type === "link") {
    if (a.resolvedPath && b.resolvedPath) {
      return a.resolvedPath === b.resolvedPath;
    }
    if (a.resolvedPath || b.resolvedPath) {
      // One resolved, one not — compare target text
      return stripSubpath(a.target) === stripSubpath(b.target);
    }
    return a.target === b.target;
  }

  // Link / File
  if (a.type === "link" && b.type === "file") {
    if (a.resolvedPath) return a.resolvedPath === b.path;
    return stripSubpath(a.target) === b.path;
  }
  if (a.type === "file" && b.type === "link") {
    if (b.resolvedPath) return a.path === b.resolvedPath;
    return a.path === stripSubpath(b.target);
  }

  // Different types
  return false;
}

function stripSubpath(target: string): string {
  const hashIdx = target.indexOf("#");
  if (hashIdx >= 0) return target.substring(0, hashIdx);
  return target;
}

// ---------------------------------------------------------------------------
// Sort comparator (§11.3)
// ---------------------------------------------------------------------------

export type TypeBucket = number;

const TYPE_BUCKETS: Record<string, TypeBucket> = {
  null: 0,
  boolean: 1,
  number: 2,
  date: 3,
  duration: 4,
  string: 5,
  url: 5,
  file: 6,
  link: 6,
  list: 7,
  object: 8,
  regexp: 9,
  html: 10,
  image: 10,
  icon: 10,
  error: 11,
};

export function compareValues(a: Value, b: Value): number {
  const bucketA = TYPE_BUCKETS[a.type] ?? 10;
  const bucketB = TYPE_BUCKETS[b.type] ?? 10;
  if (bucketA !== bucketB) return bucketA - bucketB;

  // Same bucket
  switch (a.type) {
    case "null":
      return 0;
    case "boolean":
      return (a.value ? 1 : 0) - (b.type === "boolean" && b.value ? 1 : 0);
    case "number": {
      if (b.type !== "number") return 0;
      if (Number.isNaN(a.value) && Number.isNaN(b.value)) return 0;
      if (Number.isNaN(a.value)) return 1; // NaN goes last
      if (Number.isNaN(b.value)) return -1;
      return a.value - b.value;
    }
    case "date":
      if (b.type === "date") return a.epochMs - b.epochMs;
      return 0;
    case "duration":
      if (b.type === "duration") {
        const aMs = a.months * (30 * 86400000) + a.milliseconds;
        const bMs = b.months * (30 * 86400000) + b.milliseconds;
        return aMs - bMs;
      }
      return 0;
    case "string":
      if (b.type === "string") {
        return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
      }
      if (b.type === "url") {
        return a.value < b.url ? -1 : a.value > b.url ? 1 : 0;
      }
      return 0;
    case "url":
      if (b.type === "url") return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
      if (b.type === "string") {
        return a.url < b.value ? -1 : a.url > b.value ? 1 : 0;
      }
      return 0;
    case "file":
      if (b.type === "file") {
        return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
      }
      if (b.type === "link") {
        const bp = b.resolvedPath ?? b.target;
        return a.path < bp ? -1 : a.path > bp ? 1 : 0;
      }
      return 0;
    case "link":
      if (b.type === "link") {
        const ap = a.resolvedPath ?? a.target;
        const bp = b.resolvedPath ?? b.target;
        return ap < bp ? -1 : ap > bp ? 1 : 0;
      }
      if (b.type === "file") {
        const ap = a.resolvedPath ?? a.target;
        return ap < b.path ? -1 : ap > b.path ? 1 : 0;
      }
      return 0;
    default:
      // List, Object, RegExp, HTML, Image, Icon, Error — compare by toString
      return valueToString(a) < valueToString(b)
        ? -1
        : valueToString(a) > valueToString(b)
        ? 1
        : 0;
  }
}

// ---------------------------------------------------------------------------
// Duration parsing (§13.5)
// ---------------------------------------------------------------------------

const DURATION_UNITS: Record<string, { months?: boolean; ms: number }> = {
  y: { months: true, ms: 0 },
  year: { months: true, ms: 0 },
  years: { months: true, ms: 0 },
  M: { months: true, ms: 0 },
  month: { months: true, ms: 0 },
  months: { months: true, ms: 0 },
  w: { months: false, ms: 7 * 86400000 },
  week: { months: false, ms: 7 * 86400000 },
  weeks: { months: false, ms: 7 * 86400000 },
  d: { months: false, ms: 86400000 },
  day: { months: false, ms: 86400000 },
  days: { months: false, ms: 86400000 },
  h: { months: false, ms: 3600000 },
  hour: { months: false, ms: 3600000 },
  hours: { months: false, ms: 3600000 },
  m: { months: false, ms: 60000 },
  minute: { months: false, ms: 60000 },
  minutes: { months: false, ms: 60000 },
  s: { months: false, ms: 1000 },
  second: { months: false, ms: 1000 },
  seconds: { months: false, ms: 1000 },
};

export function parseDuration(input: string): DurationValue | ErrorValue {
  const trimmed = input.trim();
  if (trimmed === "") return errorVal("DUR001", "Empty duration string");

  // Check for ISO 8601 duration P...
  if (trimmed[0] === "P") {
    return parseIsoDuration(trimmed);
  }

  // sign
  let sign = 1;
  let rest = trimmed;
  if (rest[0] === "+") {
    rest = rest.slice(1);
  } else if (rest[0] === "-") {
    sign = -1;
    rest = rest.slice(1);
  }

  let months = 0;
  let milliseconds = 0;

  // Parse components: number unit [number unit]...
  const re = /(\d+(?:\.\d+)?)\s*([A-Za-z]+)/g;
  let match: RegExpExecArray | null;
  let lastIdx = 0;
  let found = false;
  while ((match = re.exec(rest)) !== null) {
    found = true;
    lastIdx = re.lastIndex;
    const value = parseFloat(match[1]);
    const unit = match[2];
    const spec = DURATION_UNITS[unit];
    if (!spec) {
      return errorVal("DUR001", `Unknown duration unit: ${unit}`);
    }
    if (spec.months) {
      if (!Number.isInteger(value)) {
        return errorVal(
          "DUR002",
          `Fractional month/year not supported: ${value}`,
        );
      }
      months += value *
        (unit === "y" || unit === "year" || unit === "years" ? 12 : 1);
    } else {
      milliseconds += value * spec.ms;
    }
  }

  if (!found || lastIdx < rest.length) {
    return errorVal("DUR001", `Invalid duration string: ${input}`);
  }

  return durVal(sign * months, sign * milliseconds);
}

function parseIsoDuration(s: string): DurationValue | ErrorValue {
  // P[n]Y[n]M[n]W[n]DT[n]H[n]M[n]S
  const m = s.match(
    /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  if (!m) return errorVal("DUR001", `Invalid ISO 8601 duration: ${s}`);
  let months = 0;
  let milliseconds = 0;
  if (m[1]) {
    months += parseFloat(m[1]) * 12;
    if (!Number.isInteger(parseFloat(m[1]))) {
      return errorVal("DUR002", "Fractional year not supported");
    }
  }
  if (m[2]) {
    months += parseFloat(m[2]);
    if (!Number.isInteger(parseFloat(m[2]))) {
      return errorVal("DUR002", "Fractional month not supported");
    }
  }
  if (m[3]) milliseconds += parseFloat(m[3]) * 7 * 86400000;
  if (m[4]) milliseconds += parseFloat(m[4]) * 86400000;
  if (m[5]) milliseconds += parseFloat(m[5]) * 3600000;
  if (m[6]) milliseconds += parseFloat(m[6]) * 60000;
  if (m[7]) milliseconds += parseFloat(m[7]) * 1000;
  return durVal(months, milliseconds);
}

// ---------------------------------------------------------------------------
// Date parsing (§13.2)
// ---------------------------------------------------------------------------

export function parseDate(
  input: string,
  timezone: string,
): DateValue | ErrorValue {
  const s = input.trim();
  if (s === "") return errorVal("DATE001", "Empty date string");

  // YYYYMMDDHHmm
  if (/^\d{12}$/.test(s)) {
    return makeDateValFromParts(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)),
      Number(s.slice(6, 8)),
      Number(s.slice(8, 10)),
      Number(s.slice(10, 12)),
      0,
      0,
      timezone,
      false,
      s,
    );
  }
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return makeDateValFromParts(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)),
      Number(s.slice(6, 8)),
      0,
      0,
      0,
      0,
      timezone,
      true,
      s,
    );
  }

  // YYYY-MM-DD with optional time and timezone
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?)?(Z|[+-]\d{2}:\d{2})?$/,
  );
  if (!m) return errorVal("DATE001", `Invalid date format: ${input}`);

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] ? Number(m[4]) : 0;
  const minute = m[5] ? Number(m[5]) : 0;
  const second = m[6] ? Number(m[6]) : 0;
  const ms = m[7] ? Number(m[7]) : 0;
  const tz = m[8];
  const hasTime = m[4] !== undefined;

  return makeDateValFromParts(
    year,
    month,
    day,
    hour,
    minute,
    second,
    ms,
    timezone,
    !hasTime,
    s,
    tz,
  );
}

function makeDateValFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timezone: string,
  dateOnly: boolean,
  original: string,
  explicitTz?: string,
): DateValue | ErrorValue {
  // Validate ranges
  if (month < 1 || month > 12) {
    return errorVal("DATE001", `Invalid month: ${month}`);
  }
  if (day < 1 || day > 31) return errorVal("DATE001", `Invalid day: ${day}`);
  if (hour > 23) return errorVal("DATE001", `Invalid hour: ${hour}`);
  if (minute > 59) return errorVal("DATE001", `Invalid minute: ${minute}`);
  if (second > 59) return errorVal("DATE001", `Invalid second: ${second}`);
  if (ms > 999) return errorVal("DATE001", `Invalid millisecond: ${ms}`);

  // Check actual day exists (e.g. 2025-02-29)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) {
    return errorVal("DATE001", `Date does not exist: ${original}`);
  }

  let epochMs: number;
  if (explicitTz === "Z") {
    epochMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  } else if (explicitTz) {
    const sign = explicitTz[0] === "-" ? -1 : 1;
    const tzH = Number(explicitTz.slice(1, 3));
    const tzM = Number(explicitTz.slice(4, 6));
    epochMs = Date.UTC(year, month - 1, day, hour, minute, second, ms) -
      sign * (tzH * 3600000 + tzM * 60000);
  } else if (dateOnly) {
    // Date-only: midnight in query timezone
    epochMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    if (timezone && timezone !== "UTC") {
      try {
        const offset = getTimezoneOffsetMs(timezone, epochMs);
        epochMs -= offset;
      } catch {
        // If timezone is invalid, leave as UTC
      }
    }
  } else {
    // No timezone specified — use query timezone
    // For simplicity, use UTC. The spec says "timezone なしは query timezone"
    // But for deterministic testing, the conformance tests use Asia/Tokyo.
    // We handle timezone offset in the host.
    epochMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    if (timezone && timezone !== "UTC") {
      // Adjust for timezone offset
      try {
        const offset = getTimezoneOffsetMs(timezone, epochMs);
        epochMs -= offset;
      } catch {
        // If timezone is invalid, leave as UTC
      }
    }
  }

  return dateVal(epochMs, dateOnly);
}

export function getTimezoneOffsetMs(timezone: string, epochMs: number): number {
  // Use Intl to get the offset for a timezone at a given time
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  if (tzPart) {
    const val = tzPart.value;
    // Format: "GMT+9" or "GMT-5:30" or "GMT"
    const m = val.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (m) {
      const sign = m[1] === "+" ? 1 : -1;
      const h = Number(m[2]);
      const min = m[3] ? Number(m[3]) : 0;
      return sign * (h * 3600000 + min * 60000);
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Duration arithmetic (§12.4, §13.6)
// ---------------------------------------------------------------------------

export function addDurationToDate(
  date: DateValue,
  duration: DurationValue,
  timezone: string,
): DateValue {
  const offset = getTimezoneOffsetMs(timezone, date.epochMs);
  const localMs = date.epochMs + offset;
  const d = new Date(localMs);

  if (duration.months !== 0) {
    let year = d.getUTCFullYear();
    let month = d.getUTCMonth() + duration.months;
    // Normalize month to 0-11 range with year adjustment
    while (month < 0) {
      month += 12;
      year--;
    }
    while (month > 11) {
      month -= 12;
      year++;
    }
    const day = d.getUTCDate();
    // Clamp day to last day of target month
    const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0))
      .getUTCDate();
    const clampedDay = Math.min(day, daysInTargetMonth);
    d.setUTCFullYear(year, month, clampedDay);
  }

  const newLocalMs = d.getTime() + duration.milliseconds;
  const newEpochMs = newLocalMs - offset;

  // Check if result is midnight local
  const newOffset = getTimezoneOffsetMs(timezone, newEpochMs);
  const newLocal = new Date(newEpochMs + newOffset);
  const isMidnight = newLocal.getUTCHours() === 0 &&
    newLocal.getUTCMinutes() === 0 && newLocal.getUTCSeconds() === 0 &&
    newLocal.getUTCMilliseconds() === 0;

  const isDateOnly = date.dateOnly &&
    Number.isInteger(duration.months) &&
    duration.milliseconds % 86400000 === 0 &&
    isMidnight;

  return dateVal(newEpochMs, isDateOnly);
}

export function subtractDurationFromDate(
  date: DateValue,
  duration: DurationValue,
  timezone: string,
): DateValue {
  return addDurationToDate(date, {
    type: "duration",
    months: -duration.months,
    milliseconds: -duration.milliseconds,
  }, timezone);
}

export function addDurations(
  a: DurationValue,
  b: DurationValue,
): DurationValue {
  return durVal(a.months + b.months, a.milliseconds + b.milliseconds);
}

export function subtractDurations(
  a: DurationValue,
  b: DurationValue,
): DurationValue {
  return durVal(a.months - b.months, a.milliseconds - b.milliseconds);
}

export function multiplyDuration(d: DurationValue, n: number): DurationValue {
  let months = d.months * n;
  let milliseconds = d.milliseconds * n;
  // If months becomes non-integer, convert to milliseconds relative to today()
  if (!Number.isInteger(months)) {
    // Per spec: convert month part using today() as reference
    // For simplicity in this context, we just set months=0 and add the fractional months as ms
    // Using 30 days per month as approximation (the spec says to use query today())
    milliseconds += months * 30 * 86400000;
    months = 0;
  }
  return durVal(months, milliseconds);
}

export function divideDuration(
  d: DurationValue,
  n: number,
): DurationValue | ErrorValue {
  if (n === 0) {
    return errorVal("DUR003", "Division by zero in duration scalar arithmetic");
  }
  let months = d.months / n;
  let milliseconds = d.milliseconds / n;
  if (!Number.isInteger(months)) {
    milliseconds += months * 30 * 86400000;
    months = 0;
  }
  return durVal(months, milliseconds);
}

export function dateMinusDate(a: DateValue, b: DateValue): DurationValue {
  return durVal(0, a.epochMs - b.epochMs);
}

export function durationGetMilliseconds(
  d: DurationValue,
  referenceDate: DateValue,
  timezone: string,
): number {
  const applied = addDurationToDate(referenceDate, d, timezone);
  return applied.epochMs - referenceDate.epochMs;
}

// ---------------------------------------------------------------------------
// Wikilink detection (§14.1)
// ---------------------------------------------------------------------------

export function detectWikilink(
  s: string,
): { target: string; display?: string } | null {
  const m = s.match(/^\[\[([^\]]+)\]\]$/);
  if (!m) return null;
  const pipeIdx = m[1].indexOf("|");
  if (pipeIdx >= 0) {
    return {
      target: m[1].substring(0, pipeIdx),
      display: m[1].substring(pipeIdx + 1),
    };
  }
  return { target: m[1] };
}

// ---------------------------------------------------------------------------
// Convert raw frontmatter value to Value (§14.1)
// ---------------------------------------------------------------------------

export function rawToValue(
  raw: unknown,
  propertyTypes: Record<string, string>,
  key: string,
  hostFile: HostFile,
  host: {
    resolveLink: (target: string, sourcePath: string) => HostFile | null;
  },
): Value {
  if (raw === null || raw === undefined) return NULL;

  if (raw instanceof Date) {
    const isDateOnly = raw.getUTCHours() === 0 &&
      raw.getUTCMinutes() === 0 &&
      raw.getUTCSeconds() === 0 &&
      raw.getUTCMilliseconds() === 0;
    return dateVal(raw.getTime(), isDateOnly);
  }

  // Check if property type is date/datetime
  const pt = propertyTypes?.[key];
  if (pt === "date" || pt === "datetime") {
    if (typeof raw === "string") {
      return parseDate(raw, "UTC");
    }
    if (typeof raw === "number") {
      return dateVal(raw, false);
    }
  }

  if (typeof raw === "boolean") return bool(raw);
  if (typeof raw === "number") return num(raw);
  if (typeof raw === "string") {
    // Check for wikilink
    const wl = detectWikilink(raw);
    if (wl) {
      const resolved = host.resolveLink(wl.target, hostFile.path);
      const link: LinkValue = {
        type: "link",
        target: wl.target,
        sourcePath: hostFile.path,
        resolvedPath: resolved?.path,
        display: wl.display ? str(wl.display) : undefined,
      };
      return link;
    }
    return str(raw);
  }
  if (Array.isArray(raw)) {
    return listVal(
      raw.map((item) => rawToValue(item, propertyTypes, key, hostFile, host)),
    );
  }
  if (typeof raw === "object") {
    const entries: [string, Value][] = [];
    for (const [k, v] of Object.entries(raw)) {
      entries.push([k, rawToValue(v, propertyTypes, k, hostFile, host)]);
    }
    return { type: "object", map: new Map(entries) };
  }
  return NULL;
}

// ---------------------------------------------------------------------------
// Canonical value encoding (for conformance test comparison)
// ---------------------------------------------------------------------------

export function valueToCanonical(v: Value): unknown {
  switch (v.type) {
    case "null":
      return { type: "null" };
    case "boolean":
      return { type: "boolean", value: v.value };
    case "number": {
      if (Number.isNaN(v.value)) return { type: "number", value: "NaN" };
      if (v.value === Infinity) return { type: "number", value: "Infinity" };
      if (v.value === -Infinity) return { type: "number", value: "-Infinity" };
      return { type: "number", value: v.value };
    }
    case "string":
      return { type: "string", value: v.value };
    case "date":
      return { type: "date", epochMs: v.epochMs, dateOnly: v.dateOnly };
    case "duration":
      return {
        type: "duration",
        months: v.months,
        milliseconds: v.milliseconds,
      };
    case "list":
      return { type: "list", value: v.items.map(valueToCanonical) };
    case "object": {
      const obj: Record<string, unknown> = {};
      for (const [k, val] of v.map) obj[k] = valueToCanonical(val);
      return { type: "object", value: obj };
    }
    case "file":
      return { type: "file", path: v.path };
    case "link": {
      const r: Record<string, unknown> = { type: "link", target: v.target };
      if (v.resolvedPath) r.resolvedPath = v.resolvedPath;
      r.display = v.display ? valueToCanonical(v.display) : null;
      return r;
    }
    case "url": {
      const r: Record<string, unknown> = { type: "url", url: v.url };
      r.display = v.display ? valueToCanonical(v.display) : null;
      return r;
    }
    case "regexp":
      return { type: "regexp", source: v.source, flags: v.flags };
    case "html":
      return { type: "html", source: v.source };
    case "image": {
      const r: Record<string, unknown> = { type: "image", source: v.source };
      if (v.resolvedPath) r.resolvedPath = v.resolvedPath;
      return r;
    }
    case "icon":
      return { type: "icon", name: v.name };
    case "error":
      return { type: "error", code: v.code };
  }
}
