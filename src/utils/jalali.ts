// Accurate Gregorian <-> Jalaali (Shamsi) Calendar Converter & Persian Formatters

export const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const PERSIAN_WEEKDAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
  'شنبه',
];

export const PERSIAN_WEEKDAYS_SHORT = [
  'ی',
  'د',
  'س',
  'چ',
  'پ',
  'ج',
  'ش',
];

export interface ShamsiDate {
  jy: number;
  jm: number;
  jd: number;
}

export function gregorianToJalali(gy: number, gm: number, gd: number): ShamsiDate {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  for (gm = 0; gm < 13; gm++) {
    const v = sal_a[gm];
    if (gd <= v) break;
    gd -= v;
  }
  return { gy, gm, gd };
}

export function isoToShamsi(isoDate: string): ShamsiDate {
  const [y, m, d] = (isoDate || '').split('-').map(Number);
  return gregorianToJalali(y || 2026, m || 1, d || 1);
}

export function shamsiToIso(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function getIsoDatesBetween(startIso: string, endIso: string, maxDays = 120): Array<{
  iso: string;
  jy: number;
  jm: number;
  jd: number;
  monthName: string;
  weekday: string;
  weekdayShort: string;
}> {
  if (!startIso || !endIso || startIso > endIso) return [];
  const [y1, m1, d1] = startIso.split('-').map(Number);
  const [y2, m2, d2] = endIso.split('-').map(Number);
  const cur = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  const result = [];
  let count = 0;
  while (cur <= end && count < maxDays) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(
      cur.getDate()
    ).padStart(2, '0')}`;
    const sh = isoToShamsi(iso);
    const dayIdx = cur.getDay();
    result.push({
      iso,
      jy: sh.jy,
      jm: sh.jm,
      jd: sh.jd,
      monthName: PERSIAN_MONTHS[sh.jm - 1],
      weekday: PERSIAN_WEEKDAYS[dayIdx],
      weekdayShort: PERSIAN_WEEKDAYS_SHORT[dayIdx],
    });
    cur.setDate(cur.getDate() + 1);
    count++;
  }
  return result;
}

export function getShamsiMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const isLeap = (((((jy - 474) % 2820) + 474 + 38) * 682) % 2816) < 682;
  return isLeap ? 30 : 29;
}

export function getWeekdayName(isoDate: string, short = false): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayIdx = dt.getDay();
  return short ? PERSIAN_WEEKDAYS_SHORT[dayIdx] : PERSIAN_WEEKDAYS[dayIdx];
}

export function formatShamsiFull(isoDate: string): string {
  const { jy, jm, jd } = isoToShamsi(isoDate);
  const weekday = getWeekdayName(isoDate);
  return `${weekday} ${toPersianDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}

export function formatShamsiDayMonth(isoDate: string | null | undefined, includeYear = false): string {
  if (!isoDate) return '—';
  const { jy, jm, jd } = isoToShamsi(isoDate);
  return includeYear
    ? `${toPersianDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toPersianDigits(jy)}`
    : `${toPersianDigits(jd)} ${PERSIAN_MONTHS[jm - 1]}`;
}

export function formatShamsiShort(isoDate: string): string {
  const { jy, jm, jd } = isoToShamsi(isoDate);
  return `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, '0'))}/${toPersianDigits(String(jd).padStart(2, '0'))}`;
}

export function toPersianDigits(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '';
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(val).replace(/\d/g, (d) => persian[Number(d)]);
}

export function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function formatToman(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '۰';
  const rounded = Math.round(amount);
  const formatted = Math.abs(rounded).toLocaleString('en-US').replace(/,/g, '٬');
  const sign = rounded < 0 ? '-' : '';
  return toPersianDigits(sign + formatted);
}

export function getDaysWindow(centerIso: string, radius = 4): Array<{
  iso: string;
  jy: number;
  jm: number;
  jd: number;
  weekday: string;
  weekdayShort: string;
  monthName: string;
}> {
  const [y, m, d] = centerIso.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const list = [];
  for (let i = -radius; i <= radius; i++) {
    const dt = new Date(base);
    dt.setDate(base.getDate() + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const sh = isoToShamsi(iso);
    list.push({
      iso,
      ...sh,
      weekday: getWeekdayName(iso, false),
      weekdayShort: getWeekdayName(iso, true),
      monthName: PERSIAN_MONTHS[sh.jm - 1],
    });
  }
  return list;
}
