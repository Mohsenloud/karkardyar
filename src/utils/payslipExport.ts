import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { AccruedToTodaySummary, PaymentRecord, Worker } from '../types';
import {
  formatShamsiDayMonth,
  formatShamsiFull,
  formatShamsiShort,
  formatToman,
  getIsoDatesBetween,
  toPersianDigits,
} from './jalali';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PayslipExportData {
  worker: Worker;
  accrued: AccruedToTodaySummary;
  payments: PaymentRecord[];
  todayIso: string;
}

export interface PayslipCalendarDayItem {
  iso: string;
  jd: number;
  jm: number;
  jy: number;
  monthName: string;
  weekday: string;
  state: 'worked' | 'off_red' | 'future';
  statusLabel: string;
  overtimeHours: number;
}

/**
 * Builds the day-by-day calendar items for a worker's active period,
 * marking worked days as 'worked' (green) and any holiday, Friday off,
 * leave, or absence as 'off_red' (red).
 */
export function buildPayslipCalendarDays(
  worker: Worker,
  accrued: AccruedToTodaySummary,
  todayIso: string
): PayslipCalendarDayItem[] {
  const endIso = accrued.endDate || todayIso;
  const rawDates = getIsoDatesBetween(accrued.startDate, endIso, 400);

  return rawDates.map((dItem) => {
    const log = accrued.periodLogs.find((l) => l.work_date === dItem.iso);
    const isFutureDay = dItem.iso > todayIso;
    const isFriday = dItem.weekday === 'جمعه';
    const isFridayOffActive =
      isFriday && worker.wage_type === 'daily' && Boolean(worker.fridays_off);

    const overtimeHours = log ? Number(log.overtime_hours || 0) : 0;

    if (log) {
      if (log.status === 'present') {
        return {
          ...dItem,
          state: 'worked',
          statusLabel:
            overtimeHours > 0
              ? `کارکرد (+${toPersianDigits(overtimeHours)}س)`
              : 'حاضر (کارکرد)',
          overtimeHours,
        };
      }
      if (log.status === 'paid_leave') {
        return {
          ...dItem,
          state: 'off_red',
          statusLabel: 'مرخصی (باحقوق)',
          overtimeHours,
        };
      }
      if (log.status === 'half') {
        return {
          ...dItem,
          state: 'off_red',
          statusLabel: 'نیم‌روز (۰٫۵)',
          overtimeHours,
        };
      }
      // absent
      return {
        ...dItem,
        state: 'off_red',
        statusLabel: isFridayOffActive ? 'تعطیل جمعه' : 'غایب (کار نکرده)',
        overtimeHours,
      };
    }

    // No explicit log for this date
    if (isFutureDay && accrued.calcMode === 'to_today') {
      return {
        ...dItem,
        state: 'future',
        statusLabel: 'پیش‌رو',
        overtimeHours: 0,
      };
    }

    if (isFridayOffActive) {
      return {
        ...dItem,
        state: 'off_red',
        statusLabel: 'تعطیل جمعه',
        overtimeHours: 0,
      };
    }

    if (worker.auto_count_days === 0) {
      return {
        ...dItem,
        state: 'off_red',
        statusLabel: 'کار نکرده',
        overtimeHours: 0,
      };
    }

    return {
      ...dItem,
      state: 'worked',
      statusLabel: 'حاضر (کارکرد)',
      overtimeHours: 0,
    };
  });
}

/**
 * Generates pure vector HTML+CSS markup for the payslip document.
 * This guarantees 100% scalable vector output when printed or saved as PDF
 * through the browser's native vector print engine (Save as PDF).
 * Font glyphs (Vazirmatn) are embedded as true vector outlines, text is selectable
 * and searchable, and quality remains crystal-clear at infinite zoom (1000%+).
 */
export function generatePayslipHtml(
  data: PayslipExportData,
  options: { showToolbar?: boolean } = {}
): string {
  const { worker, accrued, payments, todayIso } = data;
  const { showToolbar = true } = options;

  const calendarDays = buildPayslipCalendarDays(worker, accrued, todayIso);
  const workedCountInCal = calendarDays.filter((d) => d.state === 'worked').length;
  const offDaysCount = calendarDays.filter((d) => d.state === 'off_red').length;

  const wageTypeText =
    worker.wage_type === 'daily'
      ? `روزمزد: ${formatToman(worker.base_wage)} تومان`
      : `ماهانه: ${formatToman(worker.base_wage)} تومان`;

  const safeWorkerName = escapeHtml(worker.name);
  const safeWorkerRole = escapeHtml(worker.role);
  const safeProjectName = worker.project_name ? escapeHtml(worker.project_name) : '';

  const calendarCellsHtml = calendarDays
    .map((d) => {
      const cls =
        d.state === 'off_red'
          ? 'cal-cell off'
          : d.state === 'worked'
          ? 'cal-cell worked'
          : 'cal-cell future';
      return `
        <div class="${cls}">
          <div class="cal-top">
            <span class="cal-date">${toPersianDigits(d.jd)} ${escapeHtml(d.monthName)}</span>
            <span class="cal-day">${escapeHtml(d.weekday)}</span>
          </div>
          <div class="cal-status">${escapeHtml(d.statusLabel)}</div>
        </div>
      `;
    })
    .join('');

  const paymentsRowsHtml =
    payments.length === 0
      ? `<tr><td colspan="5" style="text-align:center; padding: 14px; color:#64748b;">هیچ مساعده یا پرداختی برای این دوره ثبت نشده است.</td></tr>`
      : payments
          .map((p, i) => {
            const typeLabel =
              p.payment_type === 'advance'
                ? 'مساعده علی‌الحساب'
                : p.payment_type === 'salary'
                ? 'تسویه حقوق'
                : 'کسر / جریمه';
            const typeCls =
              p.payment_type === 'advance'
                ? 'pay-advance'
                : p.payment_type === 'salary'
                ? 'pay-salary'
                : 'pay-deduct';
            return `
              <tr>
                <td style="text-align:center; font-weight:700;">${toPersianDigits(i + 1)}</td>
                <td>${formatShamsiShort(p.payment_date)}</td>
                <td><span class="badge ${typeCls}">${typeLabel}</span></td>
                <td>${p.note ? escapeHtml(p.note) : '—'}</td>
                <td style="text-align:left; font-weight:800; color:#0f172a; direction:ltr;">${formatToman(
                  p.amount
                )} تومان</td>
              </tr>
            `;
          })
          .join('');

  const rangeLabel = `${formatShamsiDayMonth(accrued.startDate, true)} تا ${
    accrued.endDate ? formatShamsiDayMonth(accrued.endDate, true) : formatShamsiFull(todayIso)
  }`;

  const toolbarHtml = showToolbar
    ? `
    <div class="no-print toolbar-container">
      <div class="toolbar-content">
        <div class="toolbar-info">
          <strong>خروجی وکتور صورت‌حساب (کیفیت نامحدود و فونت واقعی)</strong>
          <span>برای ذخیره فایل PDF: روی دکمه ذخیره کلیک کنید و در پنجره باز شده مقصد را روی «Save as PDF / ذخیره به عنوان PDF» قرار دهید.</span>
        </div>
        <div class="toolbar-actions">
          <button type="button" class="btn-primary" onclick="window.print()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>ذخیره به عنوان PDF (وکتور)</span>
          </button>
          <button type="button" class="btn-secondary" onclick="window.print()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <span>چاپ مستقیم</span>
          </button>
          <button type="button" class="btn-outline" onclick="window.close()">بستن</button>
        </div>
      </div>
    </div>
  `
    : '';

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>صورت‌حساب کارکرد — ${safeWorkerName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      margin: 0;
      padding: 24px 16px 40px;
      background: #f1f5f9;
      color: #0f172a;
      direction: rtl;
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Tahoma, sans-serif;
      font-feature-settings: "kern" 1;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
    }

    .no-print {
      display: block;
    }

    .toolbar-container {
      max-width: 860px;
      margin: 0 auto 18px auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
    }

    .toolbar-content {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .toolbar-info strong {
      display: block;
      font-size: 13px;
      color: #047857;
      margin-bottom: 2px;
    }

    .toolbar-info span {
      display: block;
      font-size: 11px;
      color: #64748b;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    button {
      cursor: pointer;
      font-family: inherit;
    }

    .btn-primary {
      background: linear-gradient(135deg, #059669 0%, #0d9488 100%);
      color: #ffffff;
      border: none;
      border-radius: 9px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 6px rgba(5, 150, 105, 0.25);
    }

    .btn-secondary {
      background: #f8fafc;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn-outline {
      background: transparent;
      color: #64748b;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      padding: 8px 12px;
      font-size: 12px;
    }

    .sheet {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 18px;
      padding: 24px;
      max-width: 860px;
      margin: 0 auto;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
    }

    .header-banner {
      background: linear-gradient(135deg, #047857 0%, #0d9488 55%, #0f766e 100%);
      color: #ffffff;
      padding: 18px 22px;
      border-radius: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      box-shadow: 0 4px 10px rgba(13, 148, 136, 0.2);
    }

    .header-title h1 {
      margin: 0 0 6px 0;
      font-size: 21px;
      font-weight: 900;
      letter-spacing: -0.3px;
    }

    .header-title p {
      margin: 0;
      font-size: 12.5px;
      color: #d1fae5;
      font-weight: 500;
    }

    .header-meta {
      text-align: left;
      font-size: 11.5px;
      color: #ecfdf5;
      font-weight: 600;
      line-height: 1.6;
      white-space: nowrap;
    }

    .sec-title {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 10px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .stat-card.worked-highlight {
      background: #ecfdf5;
      border-color: #a7f3d0;
    }

    .stat-card.off-highlight {
      background: #fff1f2;
      border-color: #fecdd3;
    }

    .stat-card.overtime-highlight {
      background: #f0f9ff;
      border-color: #bae6fd;
    }

    .stat-card .lbl {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .stat-card .val {
      font-size: 14.5px;
      font-weight: 800;
      color: #0f172a;
    }

    .stat-card.worked-highlight .val {
      color: #047857;
    }

    .stat-card.off-highlight .val {
      color: #be123c;
    }

    .stat-card.overtime-highlight .val {
      color: #0369a1;
    }

    /* Visual Calendar Section */
    .cal-section {
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 20px;
    }

    .cal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .cal-legend {
      display: flex;
      gap: 8px;
      font-size: 10px;
      font-weight: 700;
    }

    .leg-worked {
      background: #ecfdf5;
      color: #065f46;
      border: 1.5px solid #34d399;
      padding: 3px 10px;
      border-radius: 6px;
    }

    .leg-off {
      background: #fef2f2;
      color: #991b1b;
      border: 1.5px solid #f87171;
      padding: 3px 10px;
      border-radius: 6px;
    }

    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 7px;
    }

    .cal-cell {
      border-radius: 9px;
      padding: 7px 6px;
      border: 1.5px solid #cbd5e1;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 58px;
    }

    .cal-cell.worked {
      background: #ecfdf5;
      border-color: #34d399;
      color: #065f46;
    }

    .cal-cell.off {
      background: #fef2f2;
      border-color: #f87171;
      color: #991b1b;
    }

    .cal-cell.future {
      background: #ffffff;
      border-color: #cbd5e1;
      border-style: dashed;
      color: #94a3b8;
    }

    .cal-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      margin-bottom: 4px;
    }

    .cal-date {
      font-weight: 800;
      font-size: 10.5px;
    }

    .cal-day {
      font-size: 9px;
      opacity: 0.85;
    }

    .cal-status {
      font-size: 9px;
      font-weight: 800;
      padding: 2px 4px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.7);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Financial Breakdown Box */
    .fin-box {
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 14px;
      padding: 14px 18px;
      margin-bottom: 20px;
    }

    .fin-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px 24px;
      margin-bottom: 12px;
    }

    .fin-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
      padding: 4px 0;
    }

    .fin-row .lbl {
      color: #475569;
      font-weight: 600;
    }

    .fin-row .val {
      font-weight: 800;
      color: #0f172a;
    }

    .net-banner {
      background: #ecfdf5;
      border: 2px solid #10b981;
      border-radius: 12px;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
    }

    .net-banner .lbl {
      font-size: 14px;
      font-weight: 800;
      color: #065f46;
    }

    .net-banner .val {
      font-size: 18px;
      font-weight: 900;
      color: #047857;
      direction: ltr;
    }

    /* Payments Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
      margin-top: 8px;
      margin-bottom: 24px;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      text-align: right;
    }

    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #334155;
    }

    tr:nth-child(even) td {
      background: #f8fafc;
    }

    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 700;
    }

    .pay-advance {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }

    .pay-salary {
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }

    .pay-deduct {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fecdd3;
    }

    /* Signatures Section */
    .sigs-container {
      display: flex;
      justify-content: space-between;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1.5px dashed #cbd5e1;
    }

    .sig-block {
      width: 44%;
      text-align: center;
      font-size: 12px;
      color: #475569;
      font-weight: 600;
    }

    .sig-line {
      height: 60px;
      border-bottom: 1px solid #94a3b8;
      margin-top: 8px;
    }

    /* Print media styles */
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
        background: #ffffff !important;
      }

      .no-print {
        display: none !important;
      }

      .sheet {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        max-width: 100% !important;
      }

      .header-banner {
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  ${toolbarHtml}

  <div class="sheet">
    <!-- Header Banner -->
    <div class="header-banner">
      <div class="header-title">
        <h1>صورت‌حساب کارکرد — ${safeWorkerName}</h1>
        <p>${safeProjectName ? `پروژه: ${safeProjectName} &nbsp;|&nbsp; ` : ''}سمت: ${safeWorkerRole} &nbsp;|&nbsp; ${wageTypeText}</p>
      </div>
      <div class="header-meta">
        <div>تاریخ صدور گزارش: ${formatShamsiDayMonth(todayIso, true)}</div>
        <div>بازه محاسبه: ${rangeLabel}</div>
      </div>
    </div>

    <!-- Attendance & Working Metrics Grid (6 Vector Cards) -->
    <div class="sec-title">خلاصه وضعیت حضور، کارکرد و مرخصی</div>
    <div class="cards-grid">
      <div class="stat-card">
        <span class="lbl">تاریخ شروع کار (ورود)</span>
        <span class="val">${formatShamsiDayMonth(accrued.startDate, true)}</span>
      </div>
      <div class="stat-card">
        <span class="lbl">تاریخ پایان / خروج دوره</span>
        <span class="val">${
          accrued.endDate ? formatShamsiDayMonth(accrued.endDate, true) : 'مشغول به کار'
        }</span>
      </div>
      <div class="stat-card worked-highlight">
        <span class="lbl">کارکرد خالص محاسبه‌شده</span>
        <span class="val">${toPersianDigits(accrued.effectiveDaysToToday)} روز</span>
      </div>
      <div class="stat-card off-highlight">
        <span class="lbl">روزهای تعطیل / مرخصی / غیبت</span>
        <span class="val">${toPersianDigits(offDaysCount)} روز</span>
      </div>
      <div class="stat-card overtime-highlight">
        <span class="lbl">ساعت اضافه‌کاری ثبت‌شده</span>
        <span class="val">${toPersianDigits(accrued.effectiveOvertimeHours)} ساعت</span>
      </div>
      <div class="stat-card">
        <span class="lbl">روزهای باقی‌مانده تا پایان</span>
        <span class="val">${
          accrued.remainingDaysToWork !== null
            ? `${toPersianDigits(accrued.remainingDaysToWork)} روز`
            : '—'
        }</span>
      </div>
    </div>

    <!-- Visual Calendar Section (Green = Worked, Red = Off/Leave/Absent) -->
    <div class="cal-section">
      <div class="cal-header">
        <div class="sec-title" style="margin:0;">
          تقویم روزهای کارکرد و تعطیلات
        </div>
        <div class="cal-legend">
          <span class="leg-worked">سبز: کارکرد (${toPersianDigits(workedCountInCal)} روز)</span>
          <span class="leg-off">قرمز: تعطیل، مرخصی یا غایب (${toPersianDigits(offDaysCount)} روز)</span>
        </div>
      </div>
      <div class="cal-grid">
        ${calendarCellsHtml}
      </div>
    </div>

    <!-- Financial Breakdown Box -->
    <div class="sec-title">جزئیات مالی و تسویه‌حساب</div>
    <div class="fin-box">
      <div class="fin-grid">
        <div class="fin-row">
          <span class="lbl">دستمزد پایه کارکرد:</span>
          <span class="val">${formatToman(accrued.baseEarnedToToday)} تومان</span>
        </div>
        <div class="fin-row">
          <span class="lbl">مبلغ اضافه‌کاری و پاداش (${toPersianDigits(accrued.effectiveOvertimeHours)} ساعت):</span>
          <span class="val" style="color:#0369a1;">${formatToman(
            accrued.overtimeEarnedToToday + accrued.bonusToToday
          )} تومان</span>
        </div>
        ${
          accrued.deductionsToToday > 0
            ? `<div class="fin-row">
          <span class="lbl" style="color:#be123c;">کسورات / خسارت:</span>
          <span class="val" style="color:#be123c;">-${formatToman(accrued.deductionsToToday)} تومان</span>
        </div>`
            : ''
        }
        <div class="fin-row">
          <span class="lbl">جمع کل کارکرد (پس از کسورات):</span>
          <span class="val">${formatToman(accrued.grossEarnedToToday)} تومان</span>
        </div>
        <div class="fin-row">
          <span class="lbl">جمع مساعده‌ها و دریافتی‌ها:</span>
          <span class="val" style="color:#b45309;">${formatToman(accrued.paidToToday)} تومان</span>
        </div>
      </div>

      <div class="net-banner">
        <span class="lbl">مانده خالص قابل پرداخت به کارگر:</span>
        <span class="val">${formatToman(accrued.netPayableToToday)} تومان</span>
      </div>
    </div>

    <!-- Payments Breakdown Table -->
    <div class="sec-title">
      ریز مساعده‌ها و پرداختی‌ها (${toPersianDigits(payments.length)} مورد)
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:45px; text-align:center;">ردیف</th>
          <th style="width:110px;">تاریخ پرداخت</th>
          <th style="width:130px;">نوع پرداخت</th>
          <th>توضیحات و بابت</th>
          <th style="width:140px; text-align:left;">مبلغ</th>
        </tr>
      </thead>
      <tbody>
        ${paymentsRowsHtml}
      </tbody>
    </table>

    <!-- Signature Boxes -->
    <div class="sigs-container">
      <div class="sig-block">
        <div>امضا و تایید کارفرما</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-block">
        <div>امضا و اثر انگشت کارگر</div>
        <div class="sig-line"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates and immediately downloads a crisp, high-DPI lossless PNG-backed .pdf file
 * of the worker's payslip directly to the user's device, with smart row-boundary
 * page slicing so calendar cells, cards, and table rows are never cut in half across pages.
 * Returns 'pdf' on direct PDF download or 'html' if fallback was used.
 */
export async function downloadPayslipPdf(data: PayslipExportData): Promise<'pdf' | 'html'> {
  const { worker, todayIso } = data;
  const safeName = worker.name.trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  const fileName = `صورتحساب_${safeName}_${todayIso}.pdf`;

  const html = generatePayslipHtml(data, { showToolbar: false });
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(html, 'text/html');
  const styleText = parsedDoc.querySelector('style')?.textContent || '';
  const sheetNode = parsedDoc.querySelector('.sheet');

  if (!sheetNode) {
    downloadPayslipHtmlDocument(data);
    return 'html';
  }

  const renderContainer = document.createElement('div');
  renderContainer.id = 'payslip-pdf-render-root';
  renderContainer.style.position = 'fixed';
  renderContainer.style.left = '-10000px';
  renderContainer.style.top = '0';
  renderContainer.style.width = '840px';
  renderContainer.style.backgroundColor = '#ffffff';
  renderContainer.style.zIndex = '-999999';
  renderContainer.dir = 'rtl';

  const styleEl = document.createElement('style');
  styleEl.textContent = styleText;
  renderContainer.appendChild(styleEl);

  const cloneSheet = sheetNode.cloneNode(true) as HTMLElement;
  cloneSheet.style.maxWidth = '840px';
  cloneSheet.style.margin = '0';
  cloneSheet.style.boxShadow = 'none';
  cloneSheet.style.border = '1px solid #cbd5e1';
  renderContainer.appendChild(cloneSheet);

  document.body.appendChild(renderContainer);

  try {
    if (document.fonts) {
      try {
        await document.fonts.ready;
      } catch {
        // Continue if fonts.ready times out
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Measure safe vertical cut points (in DOM pixels relative to cloneSheet)
    const sheetRect = cloneSheet.getBoundingClientRect();
    const candidateNodes = cloneSheet.querySelectorAll(
      '.header-banner, .sec-title, .stat-card, .cal-header, .cal-cell, .cal-section, .fin-box, thead, tbody tr, .sigs-container'
    );
    const safeDomBoundariesSet = new Set<number>([0, Math.ceil(sheetRect.height)]);
    candidateNodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const topRel = Math.max(0, Math.floor(rect.top - sheetRect.top - 3));
      const botRel = Math.min(Math.ceil(sheetRect.height), Math.ceil(rect.bottom - sheetRect.top + 3));
      safeDomBoundariesSet.add(topRel);
      safeDomBoundariesSet.add(botRel);
    });

    const renderScale = 3;
    const canvas = await html2canvas(cloneSheet, {
      scale: renderScale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 1200,
    });

    const ratioY = canvas.height / Math.max(1, sheetRect.height);
    const safeCanvasBreaks = Array.from(safeDomBoundariesSet)
      .map((y) => Math.min(canvas.height, Math.max(0, Math.round(y * ratioY))))
      .sort((a, b) => a - b);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 6;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;
    const pxPerMm = canvas.width / printableWidth;
    const maxSliceHeightPx = Math.floor(printableHeight * pxPerMm);

    let sliceTop = 0;
    let pageIndex = 0;

    while (sliceTop < canvas.height - 2) {
      const idealBottom = Math.min(canvas.height, sliceTop + maxSliceHeightPx);
      let sliceBottom = idealBottom;

      if (idealBottom < canvas.height) {
        // Choose the lowest safe boundary <= idealBottom that advances at least 45% of a page
        const minAdvance = sliceTop + Math.floor(maxSliceHeightPx * 0.45);
        for (let i = safeCanvasBreaks.length - 1; i >= 0; i--) {
          const candidate = safeCanvasBreaks[i];
          if (candidate <= idealBottom && candidate >= minAdvance) {
            sliceBottom = candidate;
            break;
          }
        }
      }

      const sliceHeight = Math.max(1, sliceBottom - sliceTop);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          sliceTop,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );
      }

      const pageImgData = pageCanvas.toDataURL('image/png');
      const sliceHeightMm = sliceHeight / pxPerMm;

      if (pageIndex > 0) {
        pdf.addPage();
      }
      pdf.addImage(pageImgData, 'PNG', margin, margin, printableWidth, sliceHeightMm, undefined, 'FAST');

      sliceTop = sliceBottom;
      pageIndex++;
    }

    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 20000);
    return 'pdf';
  } catch (err) {
    console.error('Error generating PDF with html2canvas/jsPDF:', err);
    downloadPayslipHtmlDocument(data);
    return 'html';
  } finally {
    if (renderContainer.parentNode) {
      renderContainer.parentNode.removeChild(renderContainer);
    }
  }
}

/**
 * Opens the print dialog for the payslip document.
 */
export async function printPayslipDocument(data: PayslipExportData): Promise<void> {
  const html = generatePayslipHtml(data, { showToolbar: false });

  const existingFrame = document.getElementById('payslip-vector-print-frame') as HTMLIFrameElement | null;
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'payslip-vector-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  if (iframe.contentWindow?.document?.fonts) {
    try {
      await iframe.contentWindow.document.fonts.ready;
    } catch {
      // Continue
    }
  }

  await new Promise((res) => setTimeout(res, 300));

  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch {
    window.print();
  }
}

/**
 * Opens the standalone vector payslip in a clean new browser tab.
 * Allows the user to view the document with native zoom (100% to 1000%+)
 * and save it as a vector PDF anytime.
 */
export function openPayslipVectorInNewTab(data: PayslipExportData): void {
  const html = generatePayslipHtml(data, { showToolbar: true });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Downloads a standalone, self-contained HTML vector file of the payslip
 * that can be opened in any browser offline with perfect font fidelity.
 */
export function downloadPayslipHtmlDocument(data: PayslipExportData): void {
  const { worker, todayIso } = data;
  const html = generatePayslipHtml(data, { showToolbar: true });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const safeName = worker.name.trim().replace(/\s+/g, '-');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `صورتحساب-${safeName}-${todayIso}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
