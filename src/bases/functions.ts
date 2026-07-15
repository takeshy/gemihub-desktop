// Global functions and type methods (§19-§28).
// Special forms (if, filter, map, reduce) are handled by the evaluator.

import type {
  DateValue,
  DurationValue,
  ErrorValue,
  EvalContext,
  FileValue,
  HostFile,
  LinkValue,
  ListValue,
  NumberValue,
  ObjectValue,
  RegexpValue,
  StringValue,
  UrlValue,
  Value,
} from "./types";
import {
  bool,
  dateVal,
  errorVal,
  FALSE,
  listVal,
  NULL,
  num,
  str,
  TRUE,
} from "./types";
import {
  compareValues,
  detectWikilink,
  getTimezoneOffsetMs,
  isEmpty,
  isTruthy,
  isType,
  looseEquals,
  parseDate,
  parseDuration,
  valueToString,
} from "./values";

type GlobalFn = (args: Value[], ctx: EvalContext) => Value;
type MethodFn = {
  bivarianceHack(receiver: unknown, args: Value[], ctx: EvalContext): Value;
}["bivarianceHack"];

// ---------------------------------------------------------------------------
// Global functions
// ---------------------------------------------------------------------------

export const globalFunctions: Record<string, GlobalFn> = {
  escapeHTML(args: Value[]): Value {
    const s = args[0];
    if (s.type === "error") return s;
    if (s.type !== "string") {
      return errorVal("TYPE001", "escapeHTML expects a string");
    }
    const escaped = s.value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    return str(escaped);
  },

  date(args: Value[], ctx: EvalContext): Value {
    const input = args[0];
    if (input.type === "error") return input;
    if (input.type === "date") return input;
    if (input.type === "string") {
      return parseDate(input.value, ctx.snapshot.timezone);
    }
    return errorVal("TYPE001", "date() expects a string or date");
  },

  duration(args: Value[], _ctx: EvalContext): Value {
    const input = args[0];
    if (input.type === "error") return input;
    if (input.type === "duration") return input;
    if (input.type === "string") return parseDuration(input.value);
    return errorVal("TYPE001", "duration() expects a string or duration");
  },

  file(args: Value[], ctx: EvalContext): Value {
    const input = args[0];
    if (input.type === "error") return input;
    if (input.type === "null") return NULL;
    if (input.type === "file") return input;
    if (input.type === "link") {
      if (input.resolvedPath) {
        const hf = ctx.host.getFile(input.resolvedPath);
        if (hf) return hostFileToFileValue(hf);
      }
      const resolved = ctx.host.resolveLink(
        stripWikilink(input.target),
        input.sourcePath,
      );
      if (resolved) return hostFileToFileValue(resolved);
      return NULL;
    }
    if (input.type === "url") return NULL;
    if (input.type === "string") {
      const target = stripWikilink(input.value);
      const sourcePath = ctx.rowScope?.file.path ?? "";
      const resolved = ctx.host.resolveLink(target, sourcePath);
      if (resolved) return hostFileToFileValue(resolved);
      return NULL;
    }
    return errorVal("TYPE001", "file() expects a string, file, link, or url");
  },

  html(args: Value[], ctx: EvalContext): Value {
    const input = args[0];
    if (input.type === "error") return input;
    if (input.type !== "string") {
      return errorVal("TYPE001", "html() expects a string");
    }
    const sanitized = ctx.host.sanitizeHtml(input.value);
    return { type: "html", source: sanitized };
  },

  image(args: Value[], ctx: EvalContext): Value {
    const input = args[0];
    if (input.type === "error") return input;
    if (input.type === "string") {
      const source = input.value;
      // Try to resolve as local file
      const wl = detectWikilink(source.replace(/^!/, ""));
      const target = wl ? wl.target : source;
      const sourcePath = ctx.rowScope?.file.path ?? "";
      const resolved = ctx.host.resolveLink(target, sourcePath);
      return { type: "image", source, resolvedPath: resolved?.path };
    }
    if (input.type === "file") {
      return { type: "image", source: input.path, resolvedPath: input.path };
    }
    if (input.type === "link") {
      return {
        type: "image",
        source: input.target,
        resolvedPath: input.resolvedPath,
      };
    }
    if (input.type === "url") return { type: "image", source: input.url };
    return errorVal("TYPE001", "image() expects a string, file, link, or url");
  },

  icon(args: Value[], ctx: EvalContext): Value {
    const input = args[0];
    if (input.type === "error") return input;
    if (input.type !== "string") {
      return errorVal("TYPE001", "icon() expects a string");
    }
    if (!ctx.host.isSupportedIcon(input.value)) {
      return errorVal("RES002", `Unknown icon: ${input.value}`);
    }
    return { type: "icon", name: input.value };
  },

  link(args: Value[], ctx: EvalContext): Value {
    const input = args[0];
    if (input.type === "error") return input;
    const display = args[1];

    if (input.type === "file") {
      const link: LinkValue = {
        type: "link",
        target: input.path,
        sourcePath: input.path,
        resolvedPath: input.path,
        display: display && display.type !== "null" ? display : undefined,
      };
      return link;
    }
    if (input.type === "link") {
      return {
        ...input,
        display: display && display.type !== "null" ? display : undefined,
      };
    }
    if (input.type === "url") {
      return {
        ...input,
        display: display && display.type !== "null" ? display : undefined,
      };
    }
    if (input.type === "string") {
      const s = input.value;
      // External URL?
      if (/^(https?|mailto):/i.test(s)) {
        const url: UrlValue = {
          type: "url",
          url: canonicalizeUrl(s),
          display: display && display.type !== "null" ? display : undefined,
        };
        return url;
      }
      // Internal link
      const wl = detectWikilink(s);
      const target = wl ? wl.target : s;
      const sourcePath = ctx.rowScope?.file.path ?? "";
      const resolved = ctx.host.resolveLink(stripWikilink(target), sourcePath);
      const link: LinkValue = {
        type: "link",
        target,
        sourcePath,
        resolvedPath: resolved?.path,
        display: display && display.type !== "null"
          ? display
          : (wl?.display ? str(wl.display) : undefined),
      };
      return link;
    }
    return errorVal("TYPE001", "link() expects a string, file, link, or url");
  },

  list(args: Value[]): Value {
    const input = args[0];
    if (input.type === "error") return input;
    if (input.type === "list") return listVal([...input.items]);
    if (input.type === "null") return listVal([NULL]);
    return listVal([input]);
  },

  max(args: Value[]): Value {
    for (const a of args) if (a.type === "error") return a;
    for (const a of args) {
      if (a.type !== "number") {
        return errorVal("TYPE001", "max() expects numbers");
      }
    }
    if (args.length === 0) return num(-Infinity);
    for (const a of args) {
      if (a.type === "number" && Number.isNaN(a.value)) return num(NaN);
    }
    return num(Math.max(...args.map((a) => (a as NumberValue).value)));
  },

  min(args: Value[]): Value {
    for (const a of args) if (a.type === "error") return a;
    for (const a of args) {
      if (a.type !== "number") {
        return errorVal("TYPE001", "min() expects numbers");
      }
    }
    if (args.length === 0) return num(Infinity);
    for (const a of args) {
      if (a.type === "number" && Number.isNaN(a.value)) return num(NaN);
    }
    return num(Math.min(...args.map((a) => (a as NumberValue).value)));
  },

  now(args: Value[], ctx: EvalContext): Value {
    return dateVal(ctx.snapshot.nowMs, false);
  },

  number(args: Value[]): Value {
    const input = args[0];
    if (input.type === "error") return input;
    if (input.type === "number") return input;
    if (input.type === "boolean") return num(input.value ? 1 : 0);
    if (input.type === "null") return num(0);
    if (input.type === "date") return num(input.epochMs);
    if (input.type === "string") {
      const trimmed = input.value.trim();
      if (trimmed === "" || /^\s+$/.test(trimmed)) return num(0);
      const n = Number(trimmed);
      if (Number.isNaN(n)) {
        return errorVal(
          "TYPE004",
          `Cannot convert string to number: ${input.value}`,
        );
      }
      return num(n);
    }
    return errorVal("TYPE004", `number() cannot convert ${input.type}`);
  },

  today(args: Value[], ctx: EvalContext): Value {
    const tz = ctx.snapshot.timezone;
    const offset = getTimezoneOffsetMs(tz, ctx.snapshot.nowMs);
    const local = new Date(ctx.snapshot.nowMs + offset);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const day = local.getUTCDate();
    const midnightUtc = Date.UTC(year, month, day, 0, 0, 0, 0);
    const midnightLocal = midnightUtc - offset;
    return dateVal(midnightLocal, true);
  },

  random(args: Value[], ctx: EvalContext): Value {
    const idx = ctx.snapshot.randomIndex;
    const val = ctx.snapshot.randomSequence[idx] ?? Math.random();
    ctx.snapshot.randomIndex = idx + 1;
    return num(val);
  },
};

// ---------------------------------------------------------------------------
// Common methods (available on all types, §20)
// ---------------------------------------------------------------------------

export const commonMethods: Record<string, MethodFn> = {
  isTruthy(receiver: Value): Value {
    if (receiver.type === "error") return receiver;
    try {
      return bool(isTruthy(receiver));
    } catch (e) {
      return e as ErrorValue;
    }
  },

  isType(receiver: Value, args: Value[]): Value {
    if (receiver.type === "error") return receiver;
    const t = args[0];
    if (t.type === "error") return t;
    if (t.type !== "string") {
      return errorVal("TYPE001", "isType expects a string argument");
    }
    return bool(isType(receiver, t.value));
  },

  toString(receiver: Value): Value {
    if (receiver.type === "error") return receiver;
    return str(valueToString(receiver));
  },
};

// Null-safe isEmpty (§20)
export const nullIsEmpty: MethodFn = (receiver: Value): Value => {
  if (receiver.type === "error") return receiver;
  if (receiver.type === "null") return TRUE;
  try {
    return bool(isEmpty(receiver));
  } catch (e) {
    return e as ErrorValue;
  }
};

// ---------------------------------------------------------------------------
// Type-specific methods
// ---------------------------------------------------------------------------

export const typeMethods: Record<string, Record<string, MethodFn>> = {
  // ----- String methods (§22) -----
  string: {
    contains(receiver: StringValue, args: Value[]): Value {
      const sub = args[0];
      if (sub.type === "error") return sub;
      if (sub.type !== "string") {
        return errorVal("TYPE001", "contains expects a string");
      }
      return bool(receiver.value.includes(sub.value));
    },
    containsAll(receiver: StringValue, args: Value[]): Value {
      for (const a of args) {
        if (a.type === "error") return a;
        if (a.type !== "string") {
          return errorVal("TYPE001", "containsAll expects strings");
        }
        if (!receiver.value.includes(a.value)) return FALSE;
      }
      return TRUE;
    },
    containsAny(receiver: StringValue, args: Value[]): Value {
      for (const a of args) {
        if (a.type === "error") return a;
        if (a.type !== "string") {
          return errorVal("TYPE001", "containsAny expects strings");
        }
        if (receiver.value.includes(a.value)) return TRUE;
      }
      return FALSE;
    },
    endsWith(receiver: StringValue, args: Value[]): Value {
      const q = args[0];
      if (q.type === "error") return q;
      if (q.type !== "string") {
        return errorVal("TYPE001", "endsWith expects a string");
      }
      return bool(receiver.value.endsWith(q.value));
    },
    isEmpty(receiver: StringValue): Value {
      return bool(receiver.value.length === 0);
    },
    lower(receiver: StringValue): Value {
      return str(receiver.value.toLowerCase());
    },
    replace(receiver: StringValue, args: Value[]): Value {
      const pattern = args[0];
      const replacement = args[1];
      if (pattern.type === "error") return pattern;
      if (replacement.type === "error") return replacement;
      if (replacement.type !== "string") {
        return errorVal("TYPE001", "replace replacement must be a string");
      }

      if (pattern.type === "string") {
        // Replace all occurrences
        const escaped = pattern.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return str(
          receiver.value.replace(new RegExp(escaped, "g"), replacement.value),
        );
      }
      if (pattern.type === "regexp") {
        pattern.re.lastIndex = 0;
        return str(receiver.value.replace(pattern.re, replacement.value));
      }
      return errorVal("TYPE001", "replace pattern must be a string or regexp");
    },
    repeat(receiver: StringValue, args: Value[]): Value {
      const count = args[0];
      if (count.type === "error") return count;
      if (count.type !== "number") {
        return errorVal("TYPE001", "repeat expects a number");
      }
      if (!Number.isInteger(count.value) || count.value < 0) {
        return errorVal(
          "TYPE005",
          "repeat count must be a non-negative integer",
        );
      }
      try {
        return str(receiver.value.repeat(count.value));
      } catch {
        return errorVal("TYPE005", "repeat count out of range");
      }
    },
    reverse(receiver: StringValue): Value {
      // Code point reversal (§22)
      const chars = [...receiver.value];
      return str(chars.reverse().join(""));
    },
    slice(receiver: StringValue, args: Value[]): Value {
      const start = args[0];
      const end = args[1];
      if (start.type === "error") return start;
      if (start.type !== "number") {
        return errorVal("TYPE001", "slice start must be a number");
      }
      if (end && end.type === "error") return end;
      if (end && end.type !== "number" && end.type !== "null") {
        return errorVal("TYPE001", "slice end must be a number");
      }
      const s = receiver.value;
      const startIdx = start.value < 0
        ? Math.max(0, s.length + start.value)
        : Math.min(start.value, s.length);
      const endIdx = !end || end.type === "null"
        ? s.length
        : end.value < 0
        ? Math.max(0, s.length + end.value)
        : Math.min(end.value, s.length);
      return str(s.slice(startIdx, endIdx));
    },
    split(receiver: StringValue, args: Value[]): Value {
      const sep = args[0];
      const n = args[1];
      if (sep.type === "error") return sep;

      let parts: string[];
      if (sep.type === "string") {
        if (sep.value === "") {
          parts = [...receiver.value];
        } else {
          parts = receiver.value.split(sep.value);
        }
      } else if (sep.type === "regexp") {
        sep.re.lastIndex = 0;
        parts = receiver.value.split(sep.re);
      } else {
        return errorVal(
          "TYPE001",
          "split separator must be a string or regexp",
        );
      }

      if (n) {
        if (n.type === "error") return n;
        if (n.type !== "number") {
          return errorVal("TYPE001", "split limit must be a number");
        }
        if (n.value === 0) return listVal([]);
        if (Number.isInteger(n.value) && n.value > 0) {
          parts = parts.slice(0, n.value);
        }
      }
      return listVal(parts.map((p) => str(p)));
    },
    startsWith(receiver: StringValue, args: Value[]): Value {
      const q = args[0];
      if (q.type === "error") return q;
      if (q.type !== "string") {
        return errorVal("TYPE001", "startsWith expects a string");
      }
      return bool(receiver.value.startsWith(q.value));
    },
    title(receiver: StringValue): Value {
      // Word-by-word titlecase (§22.3)
      return str(receiver.value.replace(/\S+/g, (word) => {
        const cps = [...word];
        if (cps.length === 0) return word;
        cps[0] = cps[0].toUpperCase();
        return cps.join("");
      }));
    },
    trim(receiver: StringValue): Value {
      return str(receiver.value.trim());
    },
  },

  // ----- Number methods (§23) -----
  number: {
    abs(receiver: NumberValue): Value {
      return num(Math.abs(receiver.value));
    },
    ceil(receiver: NumberValue): Value {
      return num(Math.ceil(receiver.value));
    },
    floor(receiver: NumberValue): Value {
      return num(Math.floor(receiver.value));
    },
    isEmpty(): Value {
      return FALSE;
    },
    round(receiver: NumberValue, args: Value[]): Value {
      const digits = args[0];
      const d = !digits || digits.type === "null"
        ? 0
        : (digits as NumberValue).value;
      if (!Number.isInteger(d) || d < 0 || d > 100) {
        return errorVal("TYPE005", "round digits must be 0..100");
      }
      if (d === 0) return num(Math.round(receiver.value));
      const factor = Math.pow(10, d);
      return num(Math.round(receiver.value * factor) / factor);
    },
    toFixed(receiver: NumberValue, args: Value[]): Value {
      const precision = args[0];
      const p = !precision || precision.type === "null"
        ? 0
        : (precision as NumberValue).value;
      if (!Number.isInteger(p) || p < 0 || p > 100) {
        return errorVal("TYPE005", "toFixed precision must be 0..100");
      }
      return str(receiver.value.toFixed(p));
    },
  },

  // ----- Date methods (§21) -----
  date: {
    date(receiver: DateValue, _args: Value[], ctx: EvalContext): Value {
      const tz = ctx.snapshot.timezone;
      const offset = getTimezoneOffsetMs(tz, receiver.epochMs);
      const local = new Date(receiver.epochMs + offset);
      const year = local.getUTCFullYear();
      const month = local.getUTCMonth();
      const day = local.getUTCDate();
      const midnightUtc = Date.UTC(year, month, day, 0, 0, 0, 0);
      const midnightLocal = midnightUtc - offset;
      return dateVal(midnightLocal, true);
    },
    format(receiver: DateValue, args: Value[], ctx: EvalContext): Value {
      const fmt = args[0];
      if (fmt.type === "error") return fmt;
      if (fmt.type !== "string") {
        return errorVal("TYPE001", "format expects a string");
      }
      return str(formatDate(receiver, fmt.value, ctx.snapshot.timezone));
    },
    time(receiver: DateValue, args: Value[], ctx: EvalContext): Value {
      const tz = ctx.snapshot.timezone;
      const offset = getTimezoneOffsetMs(tz, receiver.epochMs);
      const local = new Date(receiver.epochMs + offset);
      const h = String(local.getUTCHours()).padStart(2, "0");
      const m = String(local.getUTCMinutes()).padStart(2, "0");
      const s = String(local.getUTCSeconds()).padStart(2, "0");
      return str(`${h}:${m}:${s}`);
    },
    relative(receiver: DateValue, args: Value[], ctx: EvalContext): Value {
      const now = ctx.snapshot.nowMs;
      const diff = now - receiver.epochMs;
      const absDiff = Math.abs(diff);
      const sign = diff >= 0 ? "in " : "";
      const ago = diff >= 0 ? " ago" : "";
      if (absDiff < 60000) {
        return str(`${Math.round(absDiff / 1000)} seconds${sign || ago}`);
      }
      if (absDiff < 3600000) {
        return str(`${Math.round(absDiff / 60000)} minutes${sign || ago}`);
      }
      if (absDiff < 86400000) {
        return str(`${Math.round(absDiff / 3600000)} hours${sign || ago}`);
      }
      return str(`${Math.round(absDiff / 86400000)} days${sign || ago}`);
    },
    isEmpty(): Value {
      return FALSE;
    },
  },

  // ----- Duration methods -----
  duration: {
    isEmpty(receiver: DurationValue): Value {
      return bool(receiver.months === 0 && receiver.milliseconds === 0);
    },
  },

  // ----- List methods (§24) -----
  list: {
    contains(receiver: ListValue, args: Value[]): Value {
      const target = args[0];
      if (target.type === "error") return target;
      for (const item of receiver.items) {
        const eq = looseEquals(item, target);
        if (eq instanceof Object && eq.type === "error") return eq;
        if (eq) return TRUE;
      }
      return FALSE;
    },
    containsAll(receiver: ListValue, args: Value[]): Value {
      for (const target of args) {
        if (target.type === "error") return target;
        let found = false;
        for (const item of receiver.items) {
          const eq = looseEquals(item, target);
          if (eq instanceof Object && eq.type === "error") return eq;
          if (eq) {
            found = true;
            break;
          }
        }
        if (!found) return FALSE;
      }
      return TRUE;
    },
    containsAny(receiver: ListValue, args: Value[]): Value {
      for (const target of args) {
        if (target.type === "error") return target;
        for (const item of receiver.items) {
          const eq = looseEquals(item, target);
          if (eq instanceof Object && eq.type === "error") return eq;
          if (eq) return TRUE;
        }
      }
      return FALSE;
    },
    flat(receiver: ListValue): Value {
      const result: Value[] = [];
      for (const item of receiver.items) {
        if (item.type === "list") {
          result.push(...item.items);
        } else {
          result.push(item);
        }
      }
      return listVal(result);
    },
    isEmpty(receiver: ListValue): Value {
      return bool(receiver.items.length === 0);
    },
    join(receiver: ListValue, args: Value[]): Value {
      const sep = args[0];
      if (sep.type === "error") return sep;
      if (sep.type !== "string") {
        return errorVal("TYPE001", "join expects a string separator");
      }
      return str(
        receiver.items.map((
          item,
        ) => (item.type === "null" ? "" : valueToString(item))).join(sep.value),
      );
    },
    reverse(receiver: ListValue): Value {
      return listVal([...receiver.items].reverse());
    },
    slice(receiver: ListValue, args: Value[]): Value {
      const start = args[0];
      const end = args[1];
      if (start.type === "error") return start;
      if (start.type !== "number") {
        return errorVal("TYPE001", "slice start must be a number");
      }
      if (end && end.type === "error") return end;
      const len = receiver.items.length;
      const startIdx = start.value < 0
        ? Math.max(0, len + start.value)
        : Math.min(start.value, len);
      const endIdx = !end || end.type === "null"
        ? len
        : (end as NumberValue).value < 0
        ? Math.max(0, len + (end as NumberValue).value)
        : Math.min((end as NumberValue).value, len);
      return listVal(receiver.items.slice(startIdx, endIdx));
    },
    sort(receiver: ListValue): Value {
      const sorted = [...receiver.items].sort(compareValues);
      return listVal(sorted);
    },
    unique(receiver: ListValue): Value {
      const result: Value[] = [];
      for (const item of receiver.items) {
        let found = false;
        for (const existing of result) {
          const eq = looseEquals(item, existing);
          if (eq instanceof Object && eq.type === "error") return eq;
          if (eq) {
            found = true;
            break;
          }
        }
        if (!found) result.push(item);
      }
      return listVal(result);
    },
    mean(receiver: ListValue): Value {
      const numbers = receiver.items.filter((v) =>
        v.type === "number"
      ) as NumberValue[];
      if (numbers.length === 0) return NULL;
      const sum = numbers.reduce((acc, n) => acc + n.value, 0);
      return num(sum / numbers.length);
    },
  },

  // ----- Object methods (§27) -----
  object: {
    isEmpty(receiver: ObjectValue): Value {
      return bool(receiver.map.size === 0);
    },
    keys(receiver: ObjectValue): Value {
      return listVal([...receiver.map.keys()].map((k) => str(k)));
    },
    values(receiver: ObjectValue): Value {
      return listVal([...receiver.map.values()]);
    },
  },

  // ----- Link methods (§25) -----
  link: {
    asFile(receiver: LinkValue, _args: Value[], ctx: EvalContext): Value {
      if (receiver.resolvedPath) {
        const hf = ctx.host.getFile(receiver.resolvedPath);
        if (hf) return hostFileToFileValue(hf);
      }
      const resolved = ctx.host.resolveLink(
        stripWikilink(receiver.target),
        receiver.sourcePath,
      );
      if (resolved) return hostFileToFileValue(resolved);
      return NULL;
    },
    linksTo(receiver: LinkValue, args: Value[], ctx: EvalContext): Value {
      const target = args[0];
      if (target.type === "error") return target;
      if (target.type === "null") return FALSE;

      // Resolve receiver link to file
      let receiverFile: HostFile | null = null;
      if (receiver.resolvedPath) {
        receiverFile = ctx.host.getFile(receiver.resolvedPath);
      }
      if (!receiverFile) {
        receiverFile = ctx.host.resolveLink(
          stripWikilink(receiver.target),
          receiver.sourcePath,
        );
      }
      if (!receiverFile) return FALSE;

      // Resolve target
      let targetFile: HostFile | null = null;
      if (target.type === "file") {
        targetFile = ctx.host.getFile(target.path);
      } else if (target.type === "link") {
        if (target.resolvedPath) {
          targetFile = ctx.host.getFile(target.resolvedPath);
        }
        if (!targetFile) {
          targetFile = ctx.host.resolveLink(
            stripWikilink(target.target),
            target.sourcePath,
          );
        }
      } else if (target.type === "string") {
        targetFile = ctx.host.resolveLink(
          stripWikilink(target.value),
          receiverFile.path,
        );
      }
      if (!targetFile) return FALSE;

      // Check if receiverFile has a link to targetFile
      return bool(hasLinkHelper(receiverFile, targetFile, ctx));
    },
  },

  // ----- File methods (§26) -----
  file: {
    asLink(receiver: FileValue, args: Value[]): Value {
      const display = args[0];
      return {
        type: "link",
        target: receiver.path,
        sourcePath: receiver.path,
        resolvedPath: receiver.path,
        display: display && display.type !== "null" ? display : undefined,
      };
    },
    hasLink(receiver: FileValue, args: Value[], ctx: EvalContext): Value {
      const other = args[0];
      if (other.type === "error") return other;
      if (other.type === "null") return FALSE;

      const sourceFile = ctx.host.getFile(receiver.path);
      if (!sourceFile) return FALSE;

      let otherFile: HostFile | null = null;
      if (other.type === "file") {
        otherFile = ctx.host.getFile(other.path);
      } else if (other.type === "link") {
        if (other.resolvedPath) {
          otherFile = ctx.host.getFile(other.resolvedPath);
        }
        if (!otherFile) {
          otherFile = ctx.host.resolveLink(
            stripWikilink(other.target),
            other.sourcePath,
          );
        }
      } else if (other.type === "string") {
        otherFile = ctx.host.resolveLink(
          stripWikilink(other.value),
          sourceFile.path,
        );
      }
      if (!otherFile) return FALSE;

      return bool(hasLinkHelper(sourceFile, otherFile, ctx));
    },
    hasProperty(receiver: FileValue, args: Value[], ctx: EvalContext): Value {
      const name = args[0];
      if (name.type === "error") return name;
      if (name.type !== "string") {
        return errorVal("TYPE001", "hasProperty expects a string");
      }
      const hf = ctx.host.getFile(receiver.path);
      if (!hf) return FALSE;
      const fm = ctx.host.getFrontmatter(hf);
      if (!fm) return FALSE;
      // Case-fold comparison (§26)
      const lower = name.value.toLowerCase();
      for (const key of Object.keys(fm)) {
        if (key.toLowerCase() === lower) return TRUE;
      }
      return FALSE;
    },
    hasTag(receiver: FileValue, args: Value[], ctx: EvalContext): Value {
      const hf = ctx.host.getFile(receiver.path);
      if (!hf) return FALSE;
      const tags = ctx.host.getTags(hf);
      for (const arg of args) {
        if (arg.type === "error") return arg;
        if (arg.type !== "string") {
          return errorVal("TYPE001", "hasTag expects strings");
        }
        const target = canonicalizeTag(arg.value).toLowerCase();
        for (const tag of tags) {
          const t = tag.toLowerCase();
          if (t === target || t.startsWith(target + "/")) return TRUE;
        }
      }
      return FALSE;
    },
    inFolder(receiver: FileValue, args: Value[]): Value {
      const folder = args[0];
      if (folder.type === "error") return folder;
      if (folder.type !== "string") {
        return errorVal("TYPE001", "inFolder expects a string");
      }
      const normalizedFolder = normalizePath(folder.value);
      if (normalizedFolder === "") return TRUE;
      if (receiver.folder === normalizedFolder) return TRUE;
      if (receiver.folder.startsWith(normalizedFolder + "/")) return TRUE;
      return FALSE;
    },
  },

  // ----- RegExp methods (§28) -----
  regexp: {
    matches(receiver: RegexpValue, args: Value[]): Value {
      const input = args[0];
      if (input.type === "error") return input;
      if (input.type !== "string") {
        return errorVal("TYPE001", "matches expects a string");
      }
      receiver.re.lastIndex = 0;
      return bool(receiver.re.test(input.value));
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripWikilink(s: string): string {
  const wl = detectWikilink(s);
  if (wl) return wl.target;
  return s;
}

function canonicalizeTag(tag: string): string {
  let t = tag.trim();
  if (t.startsWith("#")) t = t.slice(1);
  t = t.normalize("NFC");
  t = t.replace(/\/+/g, "/");
  if (t.endsWith("/")) t = t.slice(0, -1);
  return t;
}

function normalizePath(p: string): string {
  let path = p.replace(/\\/g, "/");
  path = path.replace(/\/+/g, "/");
  // Remove . segments
  path = path.replace(/\/\.\//g, "/");
  if (path.startsWith("./")) path = path.slice(2);
  if (path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.href;
  } catch {
    return url;
  }
}

function hasLinkHelper(
  source: HostFile,
  target: HostFile,
  ctx: EvalContext,
): boolean {
  const links = ctx.host.getOutgoingLinks(source);
  for (const link of links) {
    if (link.resolvedPath === target.path) return true;
    const resolved = ctx.host.resolveLink(link.target, source.path);
    if (resolved && resolved.path === target.path) return true;
  }
  return false;
}

export function hostFileToFileValue(hf: HostFile): FileValue {
  const lastDot = hf.name.lastIndexOf(".");
  const ext = lastDot >= 0 ? hf.name.substring(lastDot + 1) : "";
  const basename = lastDot >= 0 ? hf.name.substring(0, lastDot) : hf.name;
  const folder = hf.path.includes("/")
    ? hf.path.substring(0, hf.path.lastIndexOf("/"))
    : "";
  return {
    type: "file",
    path: hf.path,
    name: hf.name,
    basename,
    ext,
    folder,
    size: hf.size,
    ctimeMs: hf.ctimeMs,
    mtimeMs: hf.mtimeMs,
  };
}

// ---------------------------------------------------------------------------
// Moment.js-compatible format (§13.8)
// ---------------------------------------------------------------------------

function formatDate(date: DateValue, format: string, timezone: string): string {
  const offset = getTimezoneOffsetMs(timezone, date.epochMs);
  const d = new Date(date.epochMs + offset);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();

  let result = "";
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    let len = 1;
    while (i + len < format.length && format[i + len] === c) len++;

    switch (c) {
      case "Y": {
        const yStr = String(year).padStart(4, "0");
        result += len === 2 ? yStr.slice(-2) : yStr;
        break;
      }
      case "M":
        result += len === 2 ? String(month).padStart(2, "0") : String(month);
        break;
      case "D":
        result += len === 2 ? String(day).padStart(2, "0") : String(day);
        break;
      case "H":
        result += len === 2 ? String(hours).padStart(2, "0") : String(hours);
        break;
      case "m":
        result += len === 2
          ? String(minutes).padStart(2, "0")
          : String(minutes);
        break;
      case "s":
        result += len === 2
          ? String(seconds).padStart(2, "0")
          : String(seconds);
        break;
      case "S":
        result += String(ms).padStart(3, "0").slice(0, len);
        break;
      case "A":
        result += hours < 12 ? "AM" : "PM";
        break;
      case "a":
        result += hours < 12 ? "am" : "pm";
        break;
      case "h": {
        const h12 = hours % 12 || 12;
        result += len === 2 ? String(h12).padStart(2, "0") : String(h12);
        break;
      }
      default:
        result += format.substring(i, i + len);
    }
    i += len;
  }
  return result;
}

// ---------------------------------------------------------------------------
// HTML sanitizer (basic, for test host)
// ---------------------------------------------------------------------------

export function sanitizeHtmlBasic(input: string): string {
  // Remove script tags, inline event handlers, javascript: URLs
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*[^\s>]+/gi, "");
}
