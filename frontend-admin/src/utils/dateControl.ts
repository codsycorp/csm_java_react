import dayjs, { Dayjs } from "dayjs";

export type DateControlKind = "date" | "datetime" | "time";

export function resolveDateLocaleFormat(langInput?: string): {
  date: string;
  datetime: string;
  time: string;
} {
  const lang = String(langInput || (typeof navigator !== "undefined" ? navigator.language : "vi") || "vi").toLowerCase();
  if (lang.startsWith("en")) {
    return { date: "MM/DD/YYYY", datetime: "MM/DD/YYYY HH:mm:ss", time: "HH:mm:ss" };
  }
  if (lang.startsWith("zh")) {
    return { date: "YYYY/MM/DD", datetime: "YYYY/MM/DD HH:mm:ss", time: "HH:mm:ss" };
  }
  return { date: "DD/MM/YYYY", datetime: "DD/MM/YYYY HH:mm:ss", time: "HH:mm:ss" };
}

function createDayjsFromParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Dayjs | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const d = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    d.getFullYear() !== year
    || d.getMonth() !== month - 1
    || d.getDate() !== day
    || d.getHours() !== hour
    || d.getMinutes() !== minute
    || d.getSeconds() !== second
  ) {
    return null;
  }
  return dayjs(d);
}

function parseDateCompact(text: string): Dayjs | null {
  const m = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return createDayjsFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
}

function parseDateTimeCompact(text: string): Dayjs | null {
  const m = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return createDayjsFromParts(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
}

function parseDateSlash(text: string): Dayjs | null {
  let m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    return createDayjsFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  }

  m = text.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) {
    return createDayjsFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return createDayjsFromParts(
      Number(m[3]),
      Number(m[2]),
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || "0"),
    );
  }

  m = text.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return createDayjsFromParts(
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || "0"),
    );
  }

  return null;
}

function parseIsoLike(text: string): Dayjs | null {
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const d = dayjs(normalized);
  return d.isValid() ? d : null;
}

function parseTimeValue(text: string): Dayjs | null {
  const compact = text.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    return createDayjsFromParts(1970, 1, 1, Number(compact[1]), Number(compact[2]), Number(compact[3]));
  }

  const colon = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (colon) {
    return createDayjsFromParts(1970, 1, 1, Number(colon[1]), Number(colon[2]), Number(colon[3] || "0"));
  }

  const dt = parseDateTimeCompact(text) || parseIsoLike(text);
  if (dt?.isValid()) return dt;
  return null;
}

export function parseDateValueToDayjs(input: unknown, kind: DateControlKind): Dayjs | null {
  if (input == null || input === "") return null;
  if (dayjs.isDayjs(input)) return input.isValid() ? input : null;
  if (input instanceof Date) {
    const d = dayjs(input);
    return d.isValid() ? d : null;
  }

  const text = String(input).trim();
  if (!text) return null;

  if (kind === "time") {
    return parseTimeValue(text);
  }

  const compactDateTime = parseDateTimeCompact(text);
  if (compactDateTime?.isValid()) {
    if (kind === "date") {
      return compactDateTime.startOf("day");
    }
    return compactDateTime;
  }

  const compactDate = parseDateCompact(text);
  if (compactDate?.isValid()) {
    if (kind === "datetime") {
      return compactDate.startOf("day");
    }
    return compactDate;
  }

  const slash = parseDateSlash(text);
  if (slash?.isValid()) return slash;

  const iso = parseIsoLike(text);
  if (iso?.isValid()) return iso;

  return null;
}

export function formatDateForStorage(input: unknown, kind: DateControlKind): string {
  const parsed = parseDateValueToDayjs(input, kind);
  if (!parsed) {
    return input == null ? "" : String(input);
  }
  if (kind === "date") return parsed.format("YYYYMMDD");
  if (kind === "datetime") return parsed.format("YYYYMMDDHHmmss");
  return parsed.format("HHmmss");
}

export function formatDateForDisplay(input: unknown, kind: DateControlKind, langInput?: string): string {
  if (input == null || input === "") return "";
  const parsed = parseDateValueToDayjs(input, kind);
  if (!parsed) return String(input);

  const fmt = resolveDateLocaleFormat(langInput);
  if (kind === "date") return parsed.format(fmt.date);
  if (kind === "datetime") return parsed.format(fmt.datetime);
  return parsed.format(fmt.time);
}
