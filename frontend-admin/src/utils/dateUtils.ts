/**
 * Date Utilities
 * Global date formatting and manipulation functions compatible with legacy Vue code
 */

/**
 * Pad a number with leading zeros
 */
const pad = (val: number | string, len: number = 2): string => {
  let str = String(val);
  while (str.length < len) str = "0" + str;
  return str;
};

/**
 * Date format masks
 */
const dateFormatMasks: Record<string, string> = {
  "default": "ddd mmm dd yyyy HH:MM:ss",
  shortDate: "m/d/yy",
  mediumDate: "mmm d, yyyy",
  longDate: "mmmm d, yyyy",
  fullDate: "dddd, mmmm d, yyyy",
  shortTime: "h:MM TT",
  mediumTime: "h:MM:ss TT",
  longTime: "h:MM:ss TT Z",
  isoDate: "yyyy-mm-dd",
  isoTime: "HH:MM:ss",
  isoDateTime: "yyyy-mm-dd'T'HH:MM:ss",
  isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};

/**
 * Internationalization strings
 */
const dateFormatI18n = {
  dayNames: [
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
  ],
  monthNames: [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
  ]
};

/**
 * Format a date according to a mask
 * @param date Date object, string, or null/undefined (defaults to now)
 * @param mask Format mask (e.g., "dd/mm/yyyy HH:MM:ss")
 * @param utc Use UTC time
 * @returns Formatted date string
 */
export const dateFormat = (date: Date | string | null | undefined, mask?: string, utc?: boolean): string => {
  const token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g;
  const timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g;
  const timezoneClip = /[^-+\dA-Z]/g;

  let dateObj: Date;

  if (typeof date === "string") {
    let parts: number[] | undefined;
    if (date.includes("/")) {
      parts = date.split("/").map(Number); // DD/MM/YYYY or YYYY/MM/DD
    } else if (date.includes("-")) {
      parts = date.split("-").map(Number); // YYYY-MM-DD
    }
    if (parts && parts.length === 3) {
      // Assume format is DD/MM/YYYY if first part <= 31
      if (parts[0] <= 31) {
        dateObj = new Date(parts[2], parts[1] - 1, parts[0]); // DD/MM/YYYY
      } else {
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]); // YYYY/MM/DD
      }
    } else {
      dateObj = new Date(date);
    }
  } else if (!date) {
    dateObj = new Date();
  } else {
    dateObj = date;
  }

  if (isNaN(dateObj.getTime())) dateObj = new Date(); // Handle invalid dates

  mask = String(dateFormatMasks[mask || ""] || mask || dateFormatMasks["default"]);

  if (mask.slice(0, 4) === "UTC:") {
    mask = mask.slice(4);
    utc = true;
  }

  // Use explicit method calls instead of dynamic property access to satisfy TypeScript
  const d = utc ? dateObj.getUTCDate() : dateObj.getDate();
  const D = utc ? dateObj.getUTCDay() : dateObj.getDay();
  const m = utc ? dateObj.getUTCMonth() : dateObj.getMonth();
  const y = utc ? dateObj.getUTCFullYear() : dateObj.getFullYear();
  const H = utc ? dateObj.getUTCHours() : dateObj.getHours();
  const M = utc ? dateObj.getUTCMinutes() : dateObj.getMinutes();
  const s = utc ? dateObj.getUTCSeconds() : dateObj.getSeconds();
  const L = utc ? dateObj.getUTCMilliseconds() : dateObj.getMilliseconds();
  const o = utc ? 0 : dateObj.getTimezoneOffset();
  
  const flags: Record<string, string | number> = {
    d: d,
    dd: pad(d),
    ddd: dateFormatI18n.dayNames[D],
    dddd: dateFormatI18n.dayNames[D + 7],
    m: m + 1,
    mm: pad(m + 1),
    mmm: dateFormatI18n.monthNames[m],
    mmmm: dateFormatI18n.monthNames[m + 12],
    yy: String(y).slice(2),
    yyyy: y,
    h: H % 12 || 12,
    hh: pad(H % 12 || 12),
    H: H,
    HH: pad(H),
    M: M,
    MM: pad(M),
    s: s,
    ss: pad(s),
    l: pad(L, 3),
    L: pad(L > 99 ? Math.round(L / 10) : L),
    t: H < 12 ? "a" : "p",
    tt: H < 12 ? "am" : "pm",
    T: H < 12 ? "A" : "P",
    TT: H < 12 ? "AM" : "PM",
    Z: utc ? "UTC" : (String(dateObj).match(timezone) || [""]).pop()!.replace(timezoneClip, ""),
    o: (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
    S: ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 !== 10 ? 1 : 0) * (d % 10)]
  };

  return mask.replace(token, ($0) => {
    return $0 in flags ? String(flags[$0]) : $0.slice(1, $0.length - 1);
  });
};

/**
 * Convert a string to Date object based on format
 * @param st Date string
 * @param fm Format mask (e.g., "dd/mm/yyyy HH:MM:ss")
 * @returns Date object or false if parsing fails
 */
export const chuyenNgay = (st: string, fm: string): Date | false => {
  try {
    if (typeof st !== "string" || typeof fm !== "string") return false;

    // Build regex pattern from format mask
    const formatRegex = fm
      .replace(/dd/g, "(\\d{2})")
      .replace(/mm/g, "(\\d{2})")
      .replace(/yyyy/g, "(\\d{4})")
      .replace(/HH/g, "(\\d{2})")
      .replace(/MM/g, "(\\d{2})")
      .replace(/ss/g, "(\\d{2})");

    const regex = new RegExp("^" + formatRegex + "$");
    const match = st.match(regex);

    if (!match) return false;

    // Extract format fields
    const fields = fm.match(/(dd|mm|yyyy|HH|MM|ss)/g);
    if (!fields) return false;

    const parts: Record<string, number> = {};
    fields.forEach((f, i) => {
      parts[f] = parseInt(match[i + 1], 10);
    });

    // Default values
    const day = parts["dd"] || 1;
    const month = (parts["mm"] || 1) - 1; // Month is 0-indexed in JS
    const year = parts["yyyy"] || 1970;
    const hour = parts["HH"] || 0;
    const minute = parts["MM"] || 0;
    const second = parts["ss"] || 0;

    const dateObj = new Date(year, month, day, hour, minute, second);

    // Validate date (avoid dates like 31/02)
    if (
      dateObj.getFullYear() !== year ||
      dateObj.getMonth() !== month ||
      dateObj.getDate() !== day ||
      dateObj.getHours() !== hour ||
      dateObj.getMinutes() !== minute ||
      dateObj.getSeconds() !== second
    ) {
      return false;
    }

    return dateObj;
  } catch (ex) {
    return false;
  }
};

/**
 * Calculate the difference in days between two dates
 * @param tu_ngay Start date string
 * @param den_ngay End date string
 * @param fm Format mask
 * @returns Number of days difference
 */
export const TruNgayRaSoNgay = (tu_ngay: string, den_ngay: string, fm: string): number => {
  const utcThis = chuyenNgay(tu_ngay, fm);
  const utcOther = chuyenNgay(den_ngay, fm);
  if (!utcThis || !utcOther) return 0;
  const factor = 24 * 60 * 60 * 1000;
  return (utcThis.getTime() - utcOther.getTime()) / factor;
};

/**
 * Add days to a date
 * @param strngay Date string
 * @param so_cong_vao Number of days to add
 * @param fm Format mask
 * @returns Formatted date string (dd/mm/yyyy)
 */
export const CongNgay = (strngay: string, so_cong_vao: number, fm: string): string | false => {
  const ngay = chuyenNgay(strngay, fm);
  if (!ngay) return false;
  const factor = 24 * 60 * 60 * 1000;
  return dateFormat(new Date(ngay.getTime() + so_cong_vao * factor), "dd/mm/yyyy");
};

/**
 * Add hours to a date
 * @param strngay Date string
 * @param so_gio_cong_vao Number of hours to add
 * @param fm Format mask
 * @returns Formatted date string (dd/mm/yyyy HH:MM:ss)
 */
export const CongGio = (strngay: string, so_gio_cong_vao: number, fm: string): string | false => {
  const ngay = chuyenNgay(strngay, fm);
  if (!ngay) return false;
  const factor = 60 * 60 * 1000;
  return dateFormat(new Date(ngay.getTime() + so_gio_cong_vao * factor), "dd/mm/yyyy HH:MM:ss");
};

/**
 * Validate email address
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number
 */
export const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^(\+91-|\+91|0)?\d{10}$/;
  return phoneRegex.test(phone);
};

// Export all functions as a single object
export const DateUtils = {
  dateFormat,
  chuyenNgay,
  TruNgayRaSoNgay,
  CongNgay,
  CongGio,
  validateEmail,
  validatePhone,
  masks: dateFormatMasks,
  i18n: dateFormatI18n,
};

export default DateUtils;
