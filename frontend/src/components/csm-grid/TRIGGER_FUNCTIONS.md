/**
 * AVAILABLE FUNCTIONS IN TRIGGERS
 * 
 * All trigger functions (load_db, filter, update, etc.) in CsmDynamicGrid and CsmEditModal
 * now have access to the following utility functions via the `seft` object.
 * 
 * USAGE EXAMPLES:
 * ===============
 * 
 * // In your trigger code, you can use:
 * seft.duong_qua_am(day, month, year, timeZone)
 * seft.chuyenNgay(dateString, format)
 * seft.dateFormat(date, mask, utc)
 * seft.am_qua_duong(lunarDay, lunarMonth, lunarYear)
 * 
 * LUNAR CALENDAR FUNCTIONS (from lunarCalendar.ts)
 * =================================================
 * 
 * - INT(d: number): number
 *   Discard the fractional part of a number
 *   Example: seft.INT(3.2) => 3
 * 
 * - jdFromDate(dd: number, mm: number, yy: number): number
 *   Compute Julian day number from calendar date
 * 
 * - jdToDate(jd: number): [number, number, number]
 *   Convert Julian day number to [day, month, year]
 * 
 * - NewMoon(k: number): number
 *   Get new moon day
 * 
 * - KinhDoMatTroi(jdn: number): number
 *   Solar longitude
 * 
 * - SunLongitude(jdn: number): number
 *   Get sun longitude
 * 
 * - getSunLongitude(dayNumber: number, timeZone: number): number
 *   Get sun longitude for a day in timezone
 * 
 * - getNewMoonDay(k: number, timeZone: number): number
 *   Get new moon day in timezone
 * 
 * - getLunarMonth11(yy: number, timeZone: number): number
 *   Get lunar month 11 of year
 * 
 * - getLeapMonthOffset(a11: number, timeZone: number): number
 *   Get leap month offset
 * 
 * - duong_qua_am(dd: number, mm: number, yy: number, timeZone?: number): LunarDate
 *   Convert Solar date to Lunar date (Gregorian to Vietnamese Lunar)
 *   Returns: { day, month, year, leap, nam_mat, nam_al, nam_sinh }
 *   Example: var lunar = seft.duong_qua_am(24, 2, 2026, 7)
 * 
 * - am_qua_duong(dd: number, mm: number, yy: number, timeZone?: number): [number, number, number]
 *   Convert Lunar date to Solar date
 *   Returns: [day, month, year]
 * 
 * - LunarCalendar: object
 *   Complete lunar calendar object with all functions
 * 
 * 
 * DATE UTILITIES (from dateUtils.ts)
 * ==================================
 * 
 * - dateFormat(date: Date | string | null, mask?: string, utc?: boolean): string
 *   Format date to string
 *   Masks: yyyy, yy, mmmm, mmm, mm, m, dddd, ddd, dd, d, HH, H, hh, h, MM, m, ss, s, l, L, t, T, Z
 *   Example: seft.dateFormat(new Date(), 'yyyy-mm-dd')
 * 
 * - chuyenNgay(st: string, fm: string): Date | false
 *   Parse date string in given format
 *   Example: var dateObj = seft.chuyenNgay('24/02/2026', 'dd/mm/yyyy')
 * 
 * - TruNgayRaSoNgay(tu_ngay: string, den_ngay: string, fm: string): number
 *   Calculate difference in days between two dates
 *   Example: seft.TruNgayRaSoNgay('24/02/2026', '25/02/2026', 'dd/mm/yyyy') => 1
 * 
 * - CongNgay(strngay: string, so_cong_vao: number, fm: string): string | false
 *   Add days to a date
 *   Example: seft.CongNgay('24/02/2026', 5, 'dd/mm/yyyy') => '29/02/2026'
 * 
 * - CongGio(strngay: string, so_gio_cong_vao: number, fm: string): string | false
 *   Add hours to a date
 *   Example: seft.CongGio('24/02/2026', 2, 'dd/mm/yyyy')
 * 
 * - validateEmail(email: string): boolean
 *   Validate email format
 * 
 * - validatePhone(phone: string): boolean
 *   Validate phone format
 * 
 * - DateUtils: object
 *   Complete date utilities object with all functions
 * 
 * 
 * COMPLETE EXAMPLE TRIGGER
 * ========================
 * 
 * var data = JSON.parse(JSON.stringify(db["cbq_dsgiadinhpt"].rows));
 * var cbq_bangmang = db["cbq_bangmang"].rows;
 * 
 * // Use lunar calendar functions
 * var ngayxem = new Date();
 * var NgayAL = seft.duong_qua_am(ngayxem.getDate(), ngayxem.getMonth()+1, ngayxem.getFullYear(), 7);
 * 
 * // Use date formatting
 * var formattedDate = seft.dateFormat(ngayxem, 'dd/mm/yyyy HH:MM');
 * 
 * data.forEach(function(obj){
 *   if(obj['ngay_vao']) {
 *     // Parse date
 *     var namVao = seft.chuyenNgay(obj['ngay_vao'], 'dd/mm/yyyy').getFullYear();
 *     obj['nam_sinh'] = namVao - 1*obj['tuoi'];
 *     
 *     // Calculate lunar year
 *     var lunarInfo = seft.duong_qua_am(1, 1, obj['nam_sinh'], 7);
 *     obj['nam_dl'] = lunarInfo.year;
 *   }
 * });
 * 
 * return data;
 * 
 */

export const AVAILABLE_TRIGGER_FUNCTIONS = {
  lunar: [
    'INT',
    'jdFromDate',
    'jdToDate',
    'NewMoon',
    'KinhDoMatTroi',
    'SunLongitude',
    'getSunLongitude',
    'getNewMoonDay',
    'getLunarMonth11',
    'getLeapMonthOffset',
    'duong_qua_am',
    'am_qua_duong',
    'LunarCalendar',
  ],
  date: [
    'dateFormat',
    'chuyenNgay',
    'TruNgayRaSoNgay',
    'CongNgay',
    'CongGio',
    'validateEmail',
    'validatePhone',
    'DateUtils',
  ],
};
