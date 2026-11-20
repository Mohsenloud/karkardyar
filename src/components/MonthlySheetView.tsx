import React, { useState } from 'react';
import {
  FileText,
  Printer,
  CheckCircle2,
  Download,
  X,
  Plus,
  Minus,
  Calendar,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  LayoutGrid,
  LayoutList,
  ExternalLink,
} from 'lucide-react';
import {
  AccruedToTodaySummary,
  AttendanceStatus,
  CalcMode,
  DailyLog,
  PaymentRecord,
  Worker,
} from '../types';
import {
  PERSIAN_MONTHS,
  formatShamsiDayMonth,
  formatShamsiShort,
  formatToman,
  getIsoDatesBetween,
  getShamsiMonthLength,
  getShamsiYearOptions,
  isFridayIso,
  isoToShamsi,
  shamsiToIso,
  toPersianDigits,
} from '../utils/jalali';
import {
  buildPayslipCalendarDays,
  downloadPayslipPdf,
  downloadPayslipHtmlDocument,
  printPayslipDocument,
  openPayslipVectorInNewTab,
} from '../utils/payslipExport';
import { getProjectTheme } from '../utils/projectThemes';

const AVATAR_TONES = [
  'bg-emerald-50 text-emerald-800 border-emerald-200/70',
  'bg-indigo-50 text-indigo-800 border-indigo-200/70',
  'bg-amber-50 text-amber-800 border-amber-200/70',
  'bg-violet-50 text-violet-800 border-violet-200/70',
  'bg-cyan-50 text-cyan-800 border-cyan-200/70',
];

interface MonthlySheetViewProps {
  activeProjectName?: string;
  activeProjectColor?: string;
  todayIso: string;
  workers: Worker[];
  accruedSummaries: AccruedToTodaySummary[];
  payments: PaymentRecord[];
  viewMode?: 'card' | 'row';
  onChangeViewMode?: (mode: 'card' | 'row') => void;
  onToggleAllDailyFridaysOff?: (enabled: boolean) => void;
  onSaveDailyLog: (payload: {
    worker_id: number;
    work_date: string;
    status: AttendanceStatus | 'clear';
    days_equiv?: number;
    overtime_hours?: number;
  }) => void;
  onSaveWorkerRangeAndDays: (
    worker: Worker,
    updates: {
      start_date: string;
      end_date: string | null;
      calc_mode: CalcMode;
      manual_worked_days: number | null;
      manual_absent_days: number;
      manual_overtime_hours: number | null;
      auto_count_days: number;
      fridays_off?: number;
    }
  ) => void;
  onQuickSettleWorker: (
    worker: Worker,
    amount: number,
    paymentType?: 'advance' | 'salary' | 'deduction',
    note?: string,
    paymentDateIso?: string
  ) => void;
  onOpenWorkersTab?: () => void;
}

export const MonthlySheetView: React.FC<MonthlySheetViewProps> = ({
  activeProjectName = 'همه پروژه‌ها',
  activeProjectColor = 'emerald',
  todayIso,
  workers,
  accruedSummaries,
  payments,
  viewMode = 'card',
  onChangeViewMode,
  onToggleAllDailyFridaysOff,
  onSaveDailyLog,
  onSaveWorkerRangeAndDays,
  onQuickSettleWorker,
  onOpenWorkersTab,
}) => {
  const todayShamsi = isoToShamsi(todayIso);
  const activeProjTheme = getProjectTheme(activeProjectColor);

  const [editingWorkerId, setEditingWorkerId] = useState<number | null>(null);
  const [openCalendarWorkerId, setOpenCalendarWorkerId] = useState<number | null>(null);

  const [startJy, setStartJy] = useState<number>(todayShamsi.jy);
  const [startJm, setStartJm] = useState<number>(todayShamsi.jm);
  const [startJd, setStartJd] = useState<number>(todayShamsi.jd);

  const [hasEndDate, setHasEndDate] = useState<boolean>(false);
  const [endJy, setEndJy] = useState<number>(todayShamsi.jy);
  const [endJm, setEndJm] = useState<number>(todayShamsi.jm);
  const [endJd, setEndJd] = useState<number>(todayShamsi.jd);

  const [calcModeInput, setCalcModeInput] = useState<CalcMode>('to_today');
  const [manualWorkedDaysInput, setManualWorkedDaysInput] = useState<string>('');
  const [manualAbsentDaysInput, setManualAbsentDaysInput] = useState<string>('0');
  const [manualOvertimeInput, setManualOvertimeInput] = useState<string>('');
  const [fridaysOffInput, setFridaysOffInput] = useState<boolean>(false);

  const [payslipWorkerId, setPayslipWorkerId] = useState<number | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [downloadFeedback, setDownloadFeedback] = useState<'pdf' | 'html' | null>(null);

  // Advance & Settlement Modal State
  const [settleModalWorkerId, setSettleModalWorkerId] = useState<number | null>(null);
  const [settleType, setSettleType] = useState<'advance' | 'salary' | 'deduction'>('salary');
  const [settleAmountInput, setSettleAmountInput] = useState<string>('');
  const [settleNoteInput, setSettleNoteInput] = useState<string>('');
  const [settleJy, setSettleJy] = useState<number>(todayShamsi.jy);
  const [settleJm, setSettleJm] = useState<number>(todayShamsi.jm);
  const [settleJd, setSettleJd] = useState<number>(todayShamsi.jd);

  const yearOptions = getShamsiYearOptions(todayShamsi.jy, [startJy, endJy, settleJy]);

  const dailyWorkers = workers.filter((w) => w.wage_type === 'daily');
  const allDailyHaveFridaysOff =
    dailyWorkers.length > 0 && dailyWorkers.every((w) => Boolean(w.fridays_off));
  const someDailyHaveFridaysOff =
    dailyWorkers.some((w) => Boolean(w.fridays_off)) && !allDailyHaveFridaysOff;

  const openSettleModal = (w: Worker, acc: AccruedToTodaySummary) => {
    const shToday = isoToShamsi(todayIso);
    setSettleJy(shToday.jy);
    setSettleJm(shToday.jm);
    setSettleJd(shToday.jd);
    setSettleModalWorkerId(w.id);
    if (acc.netPayableToToday > 0) {
      setSettleType('salary');
      setSettleAmountInput(String(acc.netPayableToToday));
    } else {
      setSettleType('advance');
      setSettleAmountInput('');
    }
    setSettleNoteInput('');
  };

  const openRangeAndDaysEditor = (w: Worker) => {
    const shStart = isoToShamsi(w.start_date || todayIso);
    setStartJy(shStart.jy);
    setStartJm(shStart.jm);
    setStartJd(shStart.jd);

    if (w.end_date) {
      setHasEndDate(true);
      const shEnd = isoToShamsi(w.end_date);
      setEndJy(shEnd.jy);
      setEndJm(shEnd.jm);
      setEndJd(shEnd.jd);
    } else {
      setHasEndDate(false);
      const shToday = isoToShamsi(todayIso);
      setEndJy(shToday.jy);
      setEndJm(shToday.jm);
      setEndJd(shToday.jd);
    }

    setCalcModeInput(w.calc_mode || 'to_today');
    setManualWorkedDaysInput(
      w.manual_worked_days !== null && w.manual_worked_days !== undefined
        ? String(w.manual_worked_days)
        : ''
    );
    setManualAbsentDaysInput(String(w.manual_absent_days || 0));
    setManualOvertimeInput(
      w.manual_overtime_hours !== null && w.manual_overtime_hours !== undefined
        ? String(w.manual_overtime_hours)
        : ''
    );
    setFridaysOffInput(Boolean(w.fridays_off));
    setEditingWorkerId(w.id);
  };

  const handleSaveEditor = (w: Worker) => {
    const maxStartD = getShamsiMonthLength(startJy, startJm);
    const startIso = shamsiToIso(startJy, startJm, Math.min(startJd, maxStartD));

    let endIso: string | null = null;
    if (hasEndDate) {
      const maxEndD = getShamsiMonthLength(endJy, endJm);
      endIso = shamsiToIso(endJy, endJm, Math.min(endJd, maxEndD));
    }

    onSaveWorkerRangeAndDays(w, {
      start_date: startIso,
      end_date: endIso,
      calc_mode: calcModeInput,
      manual_worked_days:
        manualWorkedDaysInput.trim() === ''
          ? null
          : Math.max(0, Math.round(Number(manualWorkedDaysInput))),
      manual_absent_days: Math.max(0, Math.round(Number(manualAbsentDaysInput) || 0)),
      manual_overtime_hours:
        manualOvertimeInput.trim() === '' ? null : Math.max(0, Number(manualOvertimeInput)),
      auto_count_days: w.auto_count_days ?? 1,
      fridays_off: w.wage_type === 'daily' && fridaysOffInput ? 1 : 0,
    });
    setEditingWorkerId(null);
  };

  const handleToggleSingleWorkerFridaysOff = (w: Worker) => {
    if (w.wage_type !== 'daily') return;
    const nextFlag = w.fridays_off ? 0 : 1;
    onSaveWorkerRangeAndDays(w, {
      start_date: w.start_date,
      end_date: w.end_date,
      calc_mode: w.calc_mode || 'to_today',
      manual_worked_days: null,
      manual_absent_days: w.manual_absent_days || 0,
      manual_overtime_hours: w.manual_overtime_hours,
      auto_count_days: w.auto_count_days ?? 1,
      fridays_off: nextFlag,
    });
  };

  const handleQuickAdjustWorkedDays = (
    w: Worker,
    acc: AccruedToTodaySummary,
    deltaDays: number
  ) => {
    const nextDays = Math.max(0, Math.round(acc.effectiveDaysToToday + deltaDays));
    onSaveWorkerRangeAndDays(w, {
      start_date: w.start_date,
      end_date: w.end_date,
      calc_mode: w.calc_mode || 'to_today',
      manual_worked_days: nextDays,
      manual_absent_days: w.manual_absent_days || 0,
      manual_overtime_hours: w.manual_overtime_hours,
      auto_count_days: w.auto_count_days ?? 1,
      fridays_off: w.fridays_off ?? 0,
    });
  };

  const handleResetToAutoCalendar = (w: Worker) => {
    onSaveWorkerRangeAndDays(w, {
      start_date: w.start_date,
      end_date: w.end_date,
      calc_mode: w.calc_mode || 'to_today',
      manual_worked_days: null,
      manual_absent_days: 0,
      manual_overtime_hours: null,
      auto_count_days: 1,
      fridays_off: w.fridays_off ?? 0,
    });
  };

  const handleToggleDayInPeriod = (
    w: Worker,
    isoDate: string,
    existingLog?: DailyLog
  ) => {
    const isFridayHolidayMode =
      w.wage_type === 'daily' && Boolean(w.fridays_off) && isFridayIso(isoDate);

    let nextStatus: AttendanceStatus = 'absent';
    let nextDays = 0;

    if (isFridayHolidayMode) {
      if (existingLog?.status === 'present') {
        nextStatus = 'absent';
        nextDays = 0;
      } else {
        nextStatus = 'present';
        nextDays = 1;
      }
    } else {
      if (!existingLog || existingLog.status === 'present') {
        nextStatus = 'absent';
        nextDays = 0;
      } else {
        nextStatus = 'present';
        nextDays = 1;
      }
    }

    if (w.manual_worked_days !== null && w.manual_worked_days !== undefined) {
      onSaveWorkerRangeAndDays(w, {
        start_date: w.start_date,
        end_date: w.end_date,
        calc_mode: w.calc_mode || 'to_today',
        manual_worked_days: null,
        manual_absent_days: w.manual_absent_days || 0,
        manual_overtime_hours: w.manual_overtime_hours,
        auto_count_days: w.auto_count_days ?? 1,
        fridays_off: w.fridays_off ?? 0,
      });
    }

    onSaveDailyLog({
      worker_id: w.id,
      work_date: isoDate,
      status: nextStatus,
      days_equiv: nextDays,
      overtime_hours: existingLog?.overtime_hours || 0,
    });
  };

  const escapeCsvCell = (val: unknown): string => {
    let str = String(val ?? '');
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  const handleExportCsv = () => {
    const headers = [
      'نام کارگر',
      'سمت',
      'تاریخ ورود',
      'تاریخ خروج',
      'روز کارکرد موثر',
      'روزهای باقی‌مانده',
      'ساعت اضافه‌کاری',
      'دستمزد پایه (تومان)',
      'مبلغ اضافه‌کاری (تومان)',
      'کسورات (تومان)',
      'جمع کل کارکرد (تومان)',
      'مساعده و دریافتی (تومان)',
      'مانده قابل پرداخت (تومان)',
    ];
    const rows = workers.map((w) => {
      const a = accruedSummaries.find((x) => x.workerId === w.id);
      return [
        w.name,
        w.role,
        formatShamsiShort(w.start_date || todayIso),
        w.end_date ? formatShamsiShort(w.end_date) : 'نامحدود',
        a?.effectiveDaysToToday ?? 0,
        a?.remainingDaysToWork ?? 0,
        a?.effectiveOvertimeHours ?? 0,
        a?.baseEarnedToToday ?? 0,
        a?.overtimeEarnedToToday ?? 0,
        a?.deductionsToToday ?? 0,
        a?.grossEarnedToToday ?? 0,
        a?.paidToToday ?? 0,
        a?.netPayableToToday ?? 0,
      ];
    });

    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsvCell).join(','),
        ...rows.map((r) => r.map(escapeCsvCell).join(',')),
      ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karkard-${todayIso}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalDaysToTodayAll = accruedSummaries.reduce((s, x) => s + x.effectiveDaysToToday, 0);
  const totalGrossToTodayAll = accruedSummaries.reduce((s, x) => s + x.grossEarnedToToday, 0);
  const totalPaidToTodayAll = accruedSummaries.reduce((s, x) => s + x.paidToToday, 0);
  const totalNetToTodayAll = accruedSummaries.reduce((s, x) => s + x.netPayableToToday, 0);

  const editingWorker = workers.find((w) => w.id === editingWorkerId);
  const editingWorkerAccrued = accruedSummaries.find((a) => a.workerId === editingWorkerId);

  const selectedPayslipWorker = workers.find((w) => w.id === payslipWorkerId);
  const selectedPayslipAccrued = accruedSummaries.find((a) => a.workerId === payslipWorkerId);
  const selectedPayslipPayments = payments.filter((p) => p.worker_id === payslipWorkerId);

  const settleModalWorker = workers.find((w) => w.id === settleModalWorkerId);
  const settleModalAccrued = accruedSummaries.find((a) => a.workerId === settleModalWorkerId);

  const renderWorkerCalendarStrip = (
    worker: Worker,
    acc: AccruedToTodaySummary,
    periodDates: ReturnType<typeof getIsoDatesBetween>
  ) => (
    <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-200/80 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <span>
          {worker.wage_type === 'daily' && worker.fridays_off
            ? 'جمعه‌ها تعطیل (نارنجی = ۰ روز) است؛ با لمس هر جمعه می‌توانید کارکرد آن را فعال کنید.'
            : 'لمس هر روز: حاضر (سبز = ۱ روز) یا غایب (قرمز = ۰ روز)'}
        </span>
        {worker.wage_type === 'daily' && Boolean(worker.fridays_off) && (
          <span className="font-bold text-amber-800 font-mono-num">
            {toPersianDigits(acc.fridaysOffCount || 0)} جمعه تعطیل کسر شد
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 max-h-56 overflow-y-auto p-0.5">
        {periodDates.map((dItem, idx) => {
          const log = acc.periodLogs.find((l) => l.work_date === dItem.iso);
          const isFutureDay = dItem.iso > todayIso;
          const showMonthBadge = idx === 0 || dItem.jd === 1;
          const isFriday = dItem.weekday === 'جمعه';
          const isFridayOffActive =
            isFriday && worker.wage_type === 'daily' && Boolean(worker.fridays_off);

          let cellStyle = 'bg-emerald-700 text-white border-emerald-700';
          let subLabel = dItem.weekday;

          if (isFridayOffActive) {
            if (log?.status === 'present') {
              cellStyle = 'bg-emerald-700 text-white border-emerald-700 ring-2 ring-amber-400';
              subLabel = 'جمعه ✓';
            } else if (log?.status === 'paid_leave') {
              cellStyle = 'bg-sky-700 text-white border-sky-700';
              subLabel = 'مرخصی';
            } else {
              cellStyle =
                'bg-amber-50 text-amber-900 border-dashed border-amber-300 hover:bg-amber-100';
              subLabel = 'تعطیل';
            }
          } else {
            if (log?.status === 'absent') {
              cellStyle = 'bg-rose-50 text-rose-700 border-rose-300 line-through';
            } else if (log?.status === 'paid_leave') {
              cellStyle = 'bg-sky-700 text-white border-sky-700';
            } else if (isFutureDay && acc.calcMode === 'to_today') {
              cellStyle =
                'bg-white text-slate-500 border-dashed border-slate-300 hover:bg-slate-100';
            }
          }

          return (
            <React.Fragment key={dItem.iso}>
              {showMonthBadge && (
                <span className="h-11 px-2.5 rounded-lg bg-slate-200/80 text-slate-800 text-[11px] font-bold inline-flex items-center justify-center shrink-0">
                  {dItem.monthName}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleToggleDayInPeriod(worker, dItem.iso, log)}
                title={
                  isFridayOffActive
                    ? log?.status === 'present'
                      ? `${dItem.weekday} ${toPersianDigits(dItem.jd)} ${dItem.monthName} — کارکرد در جمعه (کلیک برای تبدیل به تعطیل)`
                      : `${dItem.weekday} ${toPersianDigits(dItem.jd)} ${dItem.monthName} — جمعه تعطیل (کلیک برای ثبت کارکرد در این جمعه)`
                    : `${dItem.weekday} ${toPersianDigits(dItem.jd)} ${dItem.monthName}`
                }
                className={`w-11 h-11 rounded-lg font-mono-num border flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95 shrink-0 ${cellStyle}`}
              >
                <span className="text-xs font-extrabold leading-none">
                  {toPersianDigits(dItem.jd)}
                </span>
                <span className="text-[9px] font-medium leading-none opacity-90 whitespace-nowrap">
                  {subLabel}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Executive Project Financial Overview */}
      <section
        className={`${activeProjTheme.heroBanner} text-white rounded-2xl p-3.5 sm:p-5 transition-colors`}
      >
        {/* Mobile Compact Hero (< sm): Focal Net Payable + Hairline 3-Col Strip */}
        <div className="sm:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] text-white/75 block">
                مانده قابل پرداخت · {toPersianDigits(workers.length)} نفر
              </span>
              <div className="text-xl font-extrabold text-white font-mono-num tracking-tight mt-0.5 truncate">
                {formatToman(totalNetToTodayAll)}{' '}
                <span className="text-xs font-normal text-white/75">تومان</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="h-8.5 px-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-[11px] font-bold text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>اکسل</span>
            </button>
          </div>

          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-white/15 pt-2.5 mt-2.5 border-t border-white/15 text-center font-mono-num">
            <div className="px-1">
              <span className="text-[10px] text-white/70 block">کارکرد</span>
              <span className="text-xs font-extrabold text-white mt-0.5 block truncate">
                {toPersianDigits(totalDaysToTodayAll)} روز
              </span>
            </div>
            <div className="px-1">
              <span className="text-[10px] text-white/70 block">کل دستمزد</span>
              <span className="text-xs font-extrabold text-white mt-0.5 block truncate">
                {formatToman(totalGrossToTodayAll)} ت
              </span>
            </div>
            <div className="px-1">
              <span className="text-[10px] text-amber-200 block">مساعده</span>
              <span className="text-xs font-extrabold text-amber-300 mt-0.5 block truncate">
                {formatToman(totalPaidToTodayAll)} ت
              </span>
            </div>
          </div>
        </div>

        {/* Desktop / Tablet Full Hero (sm:) */}
        <div className="hidden sm:block">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-white/15">
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight">
                کارکرد و تراز مالی «{activeProjectName}»
              </h2>
              <p className="text-xs text-white/75 mt-0.5 font-mono-num">
                تا امروز {formatShamsiDayMonth(todayIso)} · {toPersianDigits(workers.length)} نفر
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-9 px-3.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 font-mono-num">
            <div className="bg-white/10 rounded-xl px-3.5 py-2.5 border border-white/10">
              <span className="text-[11px] text-white/75 block">مجموع روز کارکرد</span>
              <span className="text-lg font-extrabold text-white mt-1 block">
                {toPersianDigits(totalDaysToTodayAll)}{' '}
                <span className="text-xs font-normal text-white/75">روز</span>
              </span>
            </div>

            <div className="bg-white/10 rounded-xl px-3.5 py-2.5 border border-white/10">
              <span className="text-[11px] text-white/75 block">کل دستمزد کارکرد</span>
              <span className="text-lg font-extrabold text-white mt-1 block truncate">
                {formatToman(totalGrossToTodayAll)}{' '}
                <span className="text-xs font-normal text-white/75">ت</span>
              </span>
            </div>

            <div className="bg-white/10 rounded-xl px-3.5 py-2.5 border border-white/10">
              <span className="text-[11px] text-amber-200 block">مساعده پرداختی</span>
              <span className="text-lg font-extrabold text-amber-300 mt-1 block truncate">
                {formatToman(totalPaidToTodayAll)}{' '}
                <span className="text-xs font-normal text-amber-200/80">ت</span>
              </span>
            </div>

            <div className="bg-white text-slate-900 rounded-xl px-3.5 py-2.5">
              <span className="text-[11px] text-slate-500 font-bold block">مانده قابل پرداخت</span>
              <span
                className={`text-lg font-extrabold mt-1 block truncate ${activeProjTheme.accentText}`}
              >
                {formatToman(totalNetToTodayAll)}{' '}
                <span className="text-xs font-normal text-slate-500">تومان</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Toolbar: Single-Row Friday Holiday Checkbox + Card/Row View Switcher */}
      {workers.length > 0 && (
        <section className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
          {dailyWorkers.length > 0 ? (
            <label className="flex items-center gap-2 cursor-pointer select-none min-h-[34px] min-w-0">
              <input
                type="checkbox"
                checked={allDailyHaveFridaysOff}
                ref={(el) => {
                  if (el) el.indeterminate = someDailyHaveFridaysOff;
                }}
                onChange={(e) => onToggleAllDailyFridaysOff?.(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-emerald-700 cursor-pointer shrink-0"
              />
              <div className="flex items-center gap-x-2 min-w-0 truncate">
                <span className="text-xs sm:text-[13px] font-bold text-slate-900 truncate">
                  <span className="sm:hidden">جمعه‌ها تعطیل</span>
                  <span className="hidden sm:inline">تعطیلی جمعه‌ها (روزمزد)</span>
                </span>
                <span className="text-[11px] text-slate-500 hidden md:inline truncate">
                  · جمعه‌ها کسر می‌شود و از تقویم هر کارگر قابل تغییر است
                </span>
              </div>
            </label>
          ) : (
            <div className="text-xs font-semibold text-slate-500 truncate">
              {toPersianDigits(workers.length)} نفر
            </div>
          )}

          {/* Segmented View Switcher (icon-only on mobile, icon+label on sm:) */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => onChangeViewMode?.('card')}
              title="نمای کارتی"
              aria-label="نمای کارتی"
              className={`h-7 w-8 sm:h-8 sm:w-auto sm:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'card'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">کارتی</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode?.('row')}
              title="نمای ردیفی"
              aria-label="نمای ردیفی"
              className={`h-7 w-8 sm:h-8 sm:w-auto sm:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'row'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ردیفی</span>
            </button>
          </div>
        </section>
      )}

      {/* Empty State */}
      {workers.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm font-bold text-slate-700">
            هنوز هیچ کارگری در «{activeProjectName}» ثبت نشده است.
          </p>
          {onOpenWorkersTab && (
            <button
              type="button"
              onClick={onOpenWorkersTab}
              className="h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن کارگر به «{activeProjectName}»</span>
            </button>
          )}
        </div>
      ) : null}

      {/* Worker List — Row Ledger View vs Card Grid View */}
      {workers.length > 0 &&
        (viewMode === 'row' ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {/* Desktop Column Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2.5 bg-slate-50/90 text-[11px] font-bold text-slate-500">
              <div className="col-span-4">کارگر و تنظیمات</div>
              <div className="col-span-2 text-center">کارکرد</div>
              <div className="col-span-3 text-left pl-2">مانده قابل پرداخت</div>
              <div className="col-span-3 text-left">عملیات</div>
            </div>

            {workers.map((worker, index) => {
              const acc = accruedSummaries.find((a) => a.workerId === worker.id);
              if (!acc) return null;

              const avatarTone = AVATAR_TONES[index % AVATAR_TONES.length];
              const isCalendarOpen = openCalendarWorkerId === worker.id;
              const periodDates = isCalendarOpen
                ? getIsoDatesBetween(acc.startDate, acc.endDate || todayIso, 400)
                : [];

              return (
                <div key={worker.id} className="transition-colors hover:bg-slate-50/60">
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col lg:grid lg:grid-cols-12 lg:items-center gap-2 sm:gap-3">
                    {/* Col 1 (4 cols): Identity + Role + Friday-Off Toggle */}
                    <div className="lg:col-span-4 flex items-center justify-between lg:justify-start gap-2 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`hidden sm:flex w-9 h-9 rounded-xl border ${avatarTone} font-extrabold text-xs items-center justify-center shrink-0`}
                        >
                          {worker.name.trim().charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-[13px] sm:text-sm font-extrabold text-slate-900 truncate">
                              {worker.name}
                            </h3>
                            {worker.wage_type === 'daily' && (
                              <label
                                title="تعطیل کردن جمعه‌ها برای این کارگر روزمزد"
                                className={`h-5 sm:h-6 px-1.5 rounded-md border text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer select-none shrink-0 transition-colors ${
                                  worker.fridays_off
                                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(worker.fridays_off)}
                                  onChange={() => handleToggleSingleWorkerFridaysOff(worker)}
                                  className="w-3 h-3 rounded accent-amber-600 cursor-pointer"
                                />
                                <span>جمعه</span>
                              </label>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-num truncate">
                            {worker.role} · از {formatShamsiDayMonth(acc.startDate)}
                          </div>
                        </div>
                      </div>

                      {/* Mobile Net Payable (visible < lg) */}
                      <div className="lg:hidden text-left font-mono-num shrink-0">
                        <span className="text-[13px] sm:text-sm font-extrabold text-emerald-700">
                          {formatToman(acc.netPayableToToday)}
                          <span className="text-[10px] font-normal text-slate-400 mr-0.5">ت</span>
                        </span>
                      </div>
                    </div>

                    {/* Mobile Bottom Bar / Desktop Cols 2-4 */}
                    <div className="lg:col-span-2 flex items-center justify-between lg:justify-center gap-1.5 sm:gap-2">
                      {/* Worked Days Stepper */}
                      <div className="flex items-center gap-0.5 sm:gap-1 font-mono-num bg-slate-50 border border-slate-200 rounded-xl p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustWorkedDays(worker, acc, -1)}
                          title="کسر ۱ روز"
                          aria-label="کسر ۱ روز"
                          className="w-7 h-7 rounded-lg hover:bg-rose-50 text-rose-600 flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <span className="text-xs font-extrabold text-slate-900 px-1 min-w-[46px] sm:min-w-[54px] text-center whitespace-nowrap">
                          {toPersianDigits(acc.effectiveDaysToToday)} روز
                        </span>

                        {(acc.isDaysManuallyEdited || acc.manualAbsentDays > 0) && (
                          <button
                            type="button"
                            onClick={() => handleResetToAutoCalendar(worker)}
                            className="w-6 h-6 rounded-md text-amber-700 hover:bg-amber-100 flex items-center justify-center"
                            title="بازگشت به محاسبه خودکار تقویم"
                            aria-label="بازگشت به محاسبه خودکار تقویم"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleQuickAdjustWorkedDays(worker, acc, 1)}
                          title="افزودن ۱ روز"
                          aria-label="افزودن ۱ روز"
                          className="w-7 h-7 rounded-lg hover:bg-emerald-50 text-emerald-700 flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Mobile Actions (visible < lg — compact single-row) */}
                      <div className="flex lg:hidden items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenCalendarWorkerId(isCalendarOpen ? null : worker.id)
                          }
                          title="تقویم روزها"
                          aria-label="تقویم روزها"
                          className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors ${
                            isCalendarOpen
                              ? 'bg-emerald-700 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openRangeAndDaysEditor(worker)}
                          title="تنظیم تاریخ"
                          aria-label="تنظیم تاریخ"
                          className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayslipWorkerId(worker.id)}
                          title="فیش کارکرد"
                          aria-label="فیش کارکرد"
                          className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-700" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openSettleModal(worker, acc)}
                          className="h-8 px-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center whitespace-nowrap transition-colors"
                        >
                          تسویه
                        </button>
                      </div>
                    </div>

                    {/* Desktop Col 3 (3 cols): Financial Display */}
                    <div className="hidden lg:flex lg:col-span-3 flex-col items-end font-mono-num pl-2">
                      <div className="text-sm font-extrabold text-emerald-700">
                        {formatToman(acc.netPayableToToday)}{' '}
                        <span className="text-[11px] font-normal text-slate-400">تومان</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2">
                        {acc.effectiveOvertimeHours > 0 && (
                          <span className="text-sky-700">
                            +{toPersianDigits(acc.effectiveOvertimeHours)} س اضافه‌کار
                          </span>
                        )}
                        {acc.paidToToday > 0 && (
                          <span className="text-amber-700">
                            مساعده: {formatToman(acc.paidToToday)} ت
                          </span>
                        )}
                        {acc.effectiveOvertimeHours === 0 && acc.paidToToday === 0 && (
                          <span>کل: {formatToman(acc.grossEarnedToToday)} ت</span>
                        )}
                      </div>
                    </div>

                    {/* Desktop Col 4 (3 cols): Clean Action Bar */}
                    <div className="hidden lg:flex lg:col-span-3 items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenCalendarWorkerId(isCalendarOpen ? null : worker.id)
                        }
                        title="تقویم کارکرد و حضور/غیاب"
                        aria-label="تقویم کارکرد"
                        className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors ${
                          isCalendarOpen
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        <Calendar className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openRangeAndDaysEditor(worker)}
                        title={`تنظیم تاریخ (${formatShamsiDayMonth(acc.startDate)} تا ${
                          acc.endDate ? formatShamsiDayMonth(acc.endDate) : 'امروز'
                        })`}
                        aria-label="تنظیم تاریخ"
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 inline-flex items-center justify-center transition-colors"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setPayslipWorkerId(worker.id)}
                        title="مشاهده فیش حقوقی"
                        aria-label="مشاهده فیش حقوقی"
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 inline-flex items-center justify-center transition-colors"
                      >
                        <FileText className="w-4 h-4 text-emerald-700" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openSettleModal(worker, acc)}
                        className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>تسویه</span>
                      </button>
                    </div>
                  </div>

                  {isCalendarOpen && (
                    <div className="px-3.5 sm:px-4 pb-3.5">
                      {renderWorkerCalendarStrip(worker, acc, periodDates)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">
            {workers.map((worker, index) => {
              const acc = accruedSummaries.find((a) => a.workerId === worker.id);
              if (!acc) return null;

              const avatarTone = AVATAR_TONES[index % AVATAR_TONES.length];
              const isCalendarOpen = openCalendarWorkerId === worker.id;

              const periodDates = isCalendarOpen
                ? getIsoDatesBetween(acc.startDate, acc.endDate || todayIso, 400)
                : [];

              return (
                <div
                  key={worker.id}
                  className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-3.5 sm:p-5 space-y-3 sm:space-y-4 transition-colors"
                >
                  {/* Zone 1: Identity + Prominent Net Payable */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`hidden sm:flex w-10 h-10 rounded-xl border ${avatarTone} font-extrabold text-sm items-center justify-center shrink-0`}
                      >
                        {worker.name.trim().charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                          {worker.name}
                        </h3>
                        <div className="text-[11px] sm:text-xs text-slate-500 font-mono-num truncate mt-0.5">
                          {worker.role} ·{' '}
                          {worker.wage_type === 'daily'
                            ? `روزمزد ${formatToman(worker.base_wage)} ت`
                            : `ماهانه ${formatToman(worker.base_wage)} ت`}
                        </div>
                      </div>
                    </div>

                    <div className="text-left font-mono-num shrink-0">
                      <span className="text-[10px] sm:text-[11px] text-slate-500 block leading-tight">
                        مانده پرداخت
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-emerald-700 mt-0.5 block">
                        {formatToman(acc.netPayableToToday)}{' '}
                        <span className="text-[10px] sm:text-[11px] font-normal text-slate-400">
                          ت
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Zone 2: Date Range + Friday Toggle + Calm Stepper */}
                  <div className="pt-2.5 sm:pt-3.5 border-t border-slate-100 space-y-2.5 sm:space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] sm:text-xs font-mono-num text-slate-600 truncate">
                        <span className="hidden sm:inline text-slate-400">بازه: </span>
                        <strong className="text-slate-800">
                          {formatShamsiDayMonth(acc.startDate)} تا{' '}
                          {acc.endDate ? formatShamsiDayMonth(acc.endDate) : 'امروز'}
                        </strong>
                        {acc.remainingDaysToWork !== null && acc.remainingDaysToWork > 0 && (
                          <span className="text-amber-700 font-bold mr-1 text-[10px] sm:text-[11px]">
                            ({toPersianDigits(acc.remainingDaysToWork)} روز مانده)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {worker.wage_type === 'daily' && (
                          <label
                            title="با تیک زدن، جمعه‌های این کارگر روزمزد تعطیل (۰ روز) محاسبه می‌شود"
                            className={`h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg border text-[10px] sm:text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer select-none transition-colors ${
                              worker.fridays_off
                                ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(worker.fridays_off)}
                              onChange={() => handleToggleSingleWorkerFridaysOff(worker)}
                              className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded accent-amber-600 cursor-pointer"
                            />
                            <span className="sm:hidden">جمعه</span>
                            <span className="hidden sm:inline">
                              جمعه تعطیل
                              {worker.fridays_off && (acc.fridaysOffCount || 0) > 0
                                ? ` (${toPersianDigits(acc.fridaysOffCount)})`
                                : ''}
                            </span>
                          </label>
                        )}

                        <button
                          type="button"
                          onClick={() => openRangeAndDaysEditor(worker)}
                          title="تغییر تاریخ و کارکرد"
                          className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] sm:text-[11px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
                        >
                          <SlidersHorizontal className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          <span className="sm:hidden">تاریخ</span>
                          <span className="hidden sm:inline">تغییر تاریخ</span>
                        </button>
                      </div>
                    </div>

                    {/* Calm Worked Days Stepper */}
                    <div className="flex items-center justify-between gap-2 bg-slate-50/90 border border-slate-200/80 rounded-xl p-1 font-mono-num">
                      <button
                        type="button"
                        onClick={() => handleQuickAdjustWorkedDays(worker, acc, -1)}
                        title="کسر ۱ روز"
                        aria-label="کسر ۱ روز"
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200/80 active:scale-95 text-slate-700 flex items-center justify-center transition-all shrink-0"
                      >
                        <Minus className="w-4 h-4 stroke-[2.5]" />
                      </button>

                      <div className="flex flex-col items-center justify-center min-w-0 px-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-slate-900 leading-none whitespace-nowrap">
                            {toPersianDigits(acc.effectiveDaysToToday)} روز کارکرد
                          </span>
                          {(acc.isDaysManuallyEdited || acc.manualAbsentDays > 0) && (
                            <button
                              type="button"
                              onClick={() => handleResetToAutoCalendar(worker)}
                              className="p-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors"
                              title="بازگشت به محاسبه خودکار تقویم"
                              aria-label="بازگشت به محاسبه خودکار تقویم"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <span className="mt-1 text-[10px] font-medium text-slate-500 leading-none whitespace-nowrap truncate max-w-full">
                          {acc.isDaysManuallyEdited
                            ? 'ویرایش دستی'
                            : worker.wage_type === 'daily' && worker.fridays_off
                            ? `بدون جمعه‌ها (${toPersianDigits(acc.fridaysOffCount || 0)} جمعه)`
                            : 'محاسبه خودکار'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleQuickAdjustWorkedDays(worker, acc, 1)}
                        title="افزودن ۱ روز"
                        aria-label="افزودن ۱ روز"
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200/80 active:scale-95 text-slate-700 flex items-center justify-center transition-all shrink-0"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>

                  {/* Zone 3: Hairline-Divided Financial Breakdown */}
                  <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 pt-2.5 sm:pt-3.5 border-t border-slate-100 text-center font-mono-num">
                    <div className="px-1">
                      <span className="text-[10px] sm:text-[11px] text-slate-500 block">
                        دستمزد پایه
                      </span>
                      <span className="text-xs sm:text-[13px] font-bold text-slate-900 mt-0.5 block truncate">
                        {formatToman(acc.baseEarnedToToday)} ت
                      </span>
                    </div>

                    <div className="px-1">
                      <span className="text-[10px] sm:text-[11px] text-slate-500 block">
                        اضافه‌کار ({toPersianDigits(acc.effectiveOvertimeHours)}س)
                      </span>
                      <span className="text-xs sm:text-[13px] font-bold text-sky-700 mt-0.5 block truncate">
                        {formatToman(acc.overtimeEarnedToToday + acc.bonusToToday)} ت
                      </span>
                    </div>

                    <div className="px-1">
                      <span className="text-[10px] sm:text-[11px] text-slate-500 block">مساعده</span>
                      <span className="text-xs sm:text-[13px] font-bold text-amber-700 mt-0.5 block truncate">
                        {formatToman(acc.paidToToday)} ت
                      </span>
                    </div>
                  </div>

                  {/* Zone 4: Single-Row Action Footer */}
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-2.5 sm:pt-3.5 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenCalendarWorkerId(isCalendarOpen ? null : worker.id)
                        }
                        className={`h-9 px-2.5 sm:px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap ${
                          isCalendarOpen
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="sm:hidden">تقویم</span>
                        <span className="hidden sm:inline">
                          {isCalendarOpen ? 'بستن تقویم' : 'تقویم روزها'}
                        </span>
                        {isCalendarOpen ? (
                          <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPayslipWorkerId(worker.id)}
                        className="h-9 px-2.5 sm:px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="sm:hidden">فیش</span>
                        <span className="hidden sm:inline">فیش کارکرد</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openSettleModal(worker, acc)}
                      className="h-9 px-3 sm:px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 transition-all whitespace-nowrap shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">تسویه</span>
                      <span className="hidden sm:inline">تسویه مانده</span>
                    </button>
                  </div>

                  {/* Collapsible Interactive Calendar Strip */}
                  {isCalendarOpen && renderWorkerCalendarStrip(worker, acc, periodDates)}
                </div>
              );
            })}
          </div>
        ))}

      {/* Modal 1: Edit Entry/Exit Dates & Worked Days */}
      {editingWorker && editingWorkerAccrued && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setEditingWorkerId(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
              <span className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  تنظیم بازه و کارکرد — {editingWorker.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تاریخ ورود، خروج و تنظیمات دستی روز و اضافه‌کار
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingWorkerId(null)}
                aria-label="بستن"
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Entry Date */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  تاریخ ورود (شروع کار)
                </label>
                <div className="grid grid-cols-3 gap-2 font-mono-num">
                  <select
                    value={startJd}
                    onChange={(e) => setStartJd(Number(e.target.value))}
                    className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {Array.from(
                      { length: getShamsiMonthLength(startJy, startJm) },
                      (_, i) => i + 1
                    ).map((d) => (
                      <option key={d} value={d}>
                        روز {toPersianDigits(d)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={startJm}
                    onChange={(e) => {
                      const nextM = Number(e.target.value);
                      setStartJm(nextM);
                      setStartJd((prev) => Math.min(prev, getShamsiMonthLength(startJy, nextM)));
                    }}
                    className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {PERSIAN_MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={startJy}
                    onChange={(e) => {
                      const nextY = Number(e.target.value);
                      setStartJy(nextY);
                      setStartJd((prev) => Math.min(prev, getShamsiMonthLength(nextY, startJm)));
                    }}
                    className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {toPersianDigits(y)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Exit Date */}
              <div className="pt-3.5 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    تاریخ خروج (پایان دوره)
                  </label>
                  <label className="text-xs text-slate-600 flex items-center gap-2 cursor-pointer min-h-[32px]">
                    <input
                      type="checkbox"
                      checked={hasEndDate}
                      onChange={(e) => setHasEndDate(e.target.checked)}
                      className="w-4 h-4 rounded accent-emerald-700 cursor-pointer"
                    />
                    <span>دارای تاریخ خروج</span>
                  </label>
                </div>

                {hasEndDate ? (
                  <div className="grid grid-cols-3 gap-2 font-mono-num">
                    <select
                      value={endJd}
                      onChange={(e) => setEndJd(Number(e.target.value))}
                      className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                    >
                      {Array.from(
                        { length: getShamsiMonthLength(endJy, endJm) },
                        (_, i) => i + 1
                      ).map((d) => (
                        <option key={d} value={d}>
                          روز {toPersianDigits(d)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={endJm}
                      onChange={(e) => {
                        const nextM = Number(e.target.value);
                        setEndJm(nextM);
                        setEndJd((prev) => Math.min(prev, getShamsiMonthLength(endJy, nextM)));
                      }}
                      className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                    >
                      {PERSIAN_MONTHS.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={endJy}
                      onChange={(e) => {
                        const nextY = Number(e.target.value);
                        setEndJy(nextY);
                        setEndJd((prev) => Math.min(prev, getShamsiMonthLength(nextY, endJm)));
                      }}
                      className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {toPersianDigits(y)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">مشغول به کار (محاسبه تا امروز)</p>
                )}
              </div>

              {/* Calculation Mode, Friday Option & Manual Overrides */}
              <div className="pt-3.5 border-t border-slate-100 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    مبنای محاسبه تقویم
                  </label>
                  <select
                    value={calcModeInput}
                    onChange={(e) => setCalcModeInput(e.target.value as CalcMode)}
                    className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold"
                  >
                    <option value="to_today">از تاریخ ورود تا امروز</option>
                    <option value="full_range">کل بازه ورود تا خروج</option>
                  </select>
                </div>

                {editingWorker.wage_type === 'daily' && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={fridaysOffInput}
                      onChange={(e) => setFridaysOffInput(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded accent-amber-600 cursor-pointer shrink-0"
                    />
                    <div className="text-xs text-amber-950 leading-relaxed">
                      <span className="font-bold block">تعطیل بودن جمعه‌ها (ویژه روزمزد)</span>
                      <span className="text-[11px] text-amber-800">
                        جمعه‌ها خودکار کسر می‌شوند؛ در صورت کارکرد در جمعه از تقویم دستی فعال کنید.
                      </span>
                    </div>
                  </label>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      روز کارکرد دستی
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={manualWorkedDaysInput}
                      onChange={(e) => setManualWorkedDaysInput(e.target.value)}
                      placeholder={`خودکار (${editingWorkerAccrued.rawCalculatedDays})`}
                      className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono-num font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      ساعت اضافه‌کاری کل
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={manualOvertimeInput}
                      onChange={(e) => setManualOvertimeInput(e.target.value)}
                      placeholder={`خودکار (${editingWorkerAccrued.loggedOvertimeHours})`}
                      className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono-num"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingWorkerId(null)}
                className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditor(editingWorker)}
                className="h-10 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors"
              >
                ذخیره تغییرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Payslip Preview & PDF / Print Export */}
      {selectedPayslipWorker && selectedPayslipAccrued && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setPayslipWorkerId(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-lg w-full overflow-hidden shadow-xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 shrink-0 space-y-3.5">
              <div className="sm:hidden -mt-1.5 pb-0.5 flex justify-center">
                <span className="w-10 h-1 rounded-full bg-white/25" />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/15 flex items-center justify-center font-extrabold text-sm shrink-0">
                    {selectedPayslipWorker.name.trim().charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                      صورت‌حساب کارکرد — {selectedPayslipWorker.name}
                    </h3>
                    <p className="text-xs text-slate-300 font-mono-num truncate mt-0.5">
                      {selectedPayslipWorker.role} ·{' '}
                      {selectedPayslipWorker.wage_type === 'daily'
                        ? `روزمزد ${formatToman(selectedPayslipWorker.base_wage)} ت`
                        : `ماهانه ${formatToman(selectedPayslipWorker.base_wage)} ت`}{' '}
                      · تا {formatShamsiDayMonth(todayIso)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPayslipWorkerId(null)}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
                  aria-label="بستن"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Export Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  disabled={isDownloadingPdf}
                  onClick={async () => {
                    setIsDownloadingPdf(true);
                    setDownloadFeedback(null);
                    try {
                      const mode = await downloadPayslipPdf({
                        worker: selectedPayslipWorker,
                        accrued: selectedPayslipAccrued,
                        payments: selectedPayslipPayments,
                        todayIso,
                      });
                      setDownloadFeedback(mode);
                      setTimeout(() => setDownloadFeedback(null), 3500);
                    } catch (err) {
                      console.error('PDF export error:', err);
                    } finally {
                      setIsDownloadingPdf(false);
                    }
                  }}
                  title="دانلود مستقیم فایل PDF صورت‌حساب کارکرد"
                  className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-all disabled:opacity-60"
                >
                  <Download
                    className={`w-3.5 h-3.5 ${isDownloadingPdf ? 'animate-bounce' : ''}`}
                  />
                  <span>
                    {isDownloadingPdf
                      ? 'در حال ساخت PDF...'
                      : downloadFeedback === 'pdf'
                      ? 'فایل PDF دانلود شد'
                      : downloadFeedback === 'html'
                      ? 'نسخه HTML ذخیره شد'
                      : 'دانلود PDF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    printPayslipDocument({
                      worker: selectedPayslipWorker,
                      accrued: selectedPayslipAccrued,
                      payments: selectedPayslipPayments,
                      todayIso,
                    })
                  }
                  className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openPayslipVectorInNewTab({
                      worker: selectedPayslipWorker,
                      accrued: selectedPayslipAccrued,
                      payments: selectedPayslipPayments,
                      todayIso,
                    })
                  }
                  title="مشاهده در تب جدید با بزرگنمایی نامحدود"
                  className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>تب جدید</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadPayslipHtmlDocument({
                      worker: selectedPayslipWorker,
                      accrued: selectedPayslipAccrued,
                      payments: selectedPayslipPayments,
                      todayIso,
                    })
                  }
                  title="دانلود فایل HTML آفلاین"
                  className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>HTML</span>
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto font-mono-num">
              {/* Period & Attendance Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-right">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] text-slate-500 block">تاریخ ورود</span>
                  <span className="text-xs font-extrabold text-slate-900 mt-0.5 block">
                    {formatShamsiDayMonth(selectedPayslipAccrued.startDate)}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] text-slate-500 block">پایان دوره</span>
                  <span className="text-xs font-extrabold text-slate-900 mt-0.5 block">
                    {selectedPayslipAccrued.endDate
                      ? formatShamsiDayMonth(selectedPayslipAccrued.endDate)
                      : 'مشغول به کار'}
                  </span>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] text-emerald-800 block">کارکرد خالص</span>
                  <span className="text-xs sm:text-sm font-extrabold text-emerald-800 mt-0.5 block">
                    {toPersianDigits(selectedPayslipAccrued.effectiveDaysToToday)} روز
                  </span>
                </div>

                <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] text-sky-800 block">اضافه‌کاری</span>
                  <span className="text-xs sm:text-sm font-extrabold text-sky-800 mt-0.5 block">
                    {toPersianDigits(selectedPayslipAccrued.effectiveOvertimeHours)} ساعت
                  </span>
                </div>
              </div>

              {selectedPayslipAccrued.remainingDaysToWork !== null && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs">
                  <span className="text-amber-900">روزهای باقی‌مانده تا تاریخ خروج:</span>
                  <span className="font-extrabold text-amber-900">
                    {toPersianDigits(selectedPayslipAccrued.remainingDaysToWork)} روز
                  </span>
                </div>
              )}

              {/* Visual Calendar Box inside Payslip Preview */}
              {(() => {
                const payslipCalDays = buildPayslipCalendarDays(
                  selectedPayslipWorker,
                  selectedPayslipAccrued,
                  todayIso
                );
                const offCount = payslipCalDays.filter((d) => d.state === 'off_red').length;
                return (
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold text-slate-900">
                        تقویم کارکرد و تعطیلات
                      </h4>
                      <div className="flex items-center gap-3 text-[11px] font-semibold">
                        <span className="text-emerald-700">سبز: کارکرد</span>
                        <span className="text-rose-700">
                          قرمز: تعطیل / غیبت ({toPersianDigits(offCount)})
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-52 overflow-y-auto p-0.5">
                      {payslipCalDays.map((d) => {
                        const cellCls =
                          d.state === 'off_red'
                            ? 'bg-rose-50 border-rose-300 text-rose-800'
                            : d.state === 'worked'
                            ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
                            : 'bg-white border-slate-200 text-slate-400';
                        const badgeCls =
                          d.state === 'off_red'
                            ? 'bg-rose-100 text-rose-700'
                            : d.state === 'worked'
                            ? 'bg-emerald-100/80 text-emerald-800'
                            : 'bg-slate-100 text-slate-500';
                        return (
                          <div
                            key={d.iso}
                            className={`rounded-lg border p-1.5 text-center flex flex-col justify-between gap-1 ${cellCls}`}
                          >
                            <div className="flex items-center justify-between text-[9px] leading-none">
                              <span className="font-extrabold">
                                {toPersianDigits(d.jd)} {d.monthName}
                              </span>
                              <span className="opacity-75 text-[8px]">{d.weekday}</span>
                            </div>
                            <span
                              className={`text-[9px] font-bold px-1 py-0.5 rounded truncate ${badgeCls}`}
                            >
                              {d.statusLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Financial Breakdown */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">دستمزد پایه کارکرد</span>
                  <span className="font-bold text-slate-900">
                    {formatToman(selectedPayslipAccrued.baseEarnedToToday)} تومان
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">
                    اضافه‌کاری ({toPersianDigits(selectedPayslipAccrued.effectiveOvertimeHours)}{' '}
                    ساعت)
                  </span>
                  <span className="font-bold text-sky-800">
                    {formatToman(
                      selectedPayslipAccrued.overtimeEarnedToToday +
                        selectedPayslipAccrued.bonusToToday
                    )}{' '}
                    تومان
                  </span>
                </div>

                {selectedPayslipAccrued.deductionsToToday > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700">کسورات / خسارت</span>
                    <span className="font-bold text-rose-700">
                      -{formatToman(selectedPayslipAccrued.deductionsToToday)} تومان
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-200">
                  <span className="font-bold text-slate-800">جمع کل کارکرد</span>
                  <span className="font-extrabold text-slate-900">
                    {formatToman(selectedPayslipAccrued.grossEarnedToToday)} تومان
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-amber-800">کسر مساعده و دریافتی</span>
                  <span className="font-bold text-amber-700">
                    {formatToman(selectedPayslipAccrued.paidToToday)} تومان
                  </span>
                </div>

                <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                    مانده قابل پرداخت
                  </span>
                  <span className="text-base font-extrabold text-emerald-700">
                    {formatToman(selectedPayslipAccrued.netPayableToToday)}{' '}
                    <span className="text-xs font-normal text-slate-500">تومان</span>
                  </span>
                </div>
              </div>

              {/* Payments History List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800">
                    ریز مساعده‌ها و پرداختی‌ها
                  </h4>
                  <span className="text-xs text-slate-500">
                    {toPersianDigits(selectedPayslipPayments.length)} مورد
                  </span>
                </div>

                {selectedPayslipPayments.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 text-center text-xs text-slate-500">
                    هیچ پرداختی برای این کارگر ثبت نشده است.
                  </div>
                ) : (
                  <div className="border border-slate-200/80 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
                    {selectedPayslipPayments.map((p) => {
                      const typeLabel =
                        p.payment_type === 'advance'
                          ? 'مساعده'
                          : p.payment_type === 'salary'
                          ? 'تسویه حقوق'
                          : 'کسر / جریمه';
                      const typeColor =
                        p.payment_type === 'advance'
                          ? 'text-amber-700'
                          : p.payment_type === 'salary'
                          ? 'text-emerald-700'
                          : 'text-rose-700';

                      return (
                        <div
                          key={p.id}
                          className="px-3 py-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs flex items-center gap-1.5">
                              <span className={`font-bold ${typeColor}`}>{typeLabel}</span>
                              <span className="text-slate-500">
                                · {formatShamsiShort(p.payment_date)}
                              </span>
                            </div>
                            {p.note && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">{p.note}</p>
                            )}
                          </div>

                          <div className="text-left shrink-0 text-xs font-extrabold text-slate-900">
                            {formatToman(p.amount)}{' '}
                            <span className="text-[10px] font-normal text-slate-400">ت</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Advance & Settlement */}
      {settleModalWorker && settleModalAccrued && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setSettleModalWorkerId(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const numericAmount = Number(settleAmountInput);
              if (!numericAmount || numericAmount <= 0) return;
              const maxD = getShamsiMonthLength(settleJy, settleJm);
              const paymentDateIso = shamsiToIso(
                settleJy,
                settleJm,
                Math.min(settleJd, maxD)
              );
              onQuickSettleWorker(
                settleModalWorker,
                numericAmount,
                settleType,
                settleNoteInput,
                paymentDateIso
              );
              setSettleModalWorkerId(null);
            }}
            className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between gap-2 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  ثبت مساعده و تسویه — {settleModalWorker.name}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 font-mono-num">
                  {settleModalWorker.project_name
                    ? `${settleModalWorker.project_name} · `
                    : ''}
                  {settleModalWorker.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettleModalWorkerId(null)}
                aria-label="بستن"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto font-mono-num">
              {/* Financial Summary Strip */}
              <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-200 text-center bg-slate-50 border border-slate-200/80 rounded-xl py-2.5">
                <div className="px-1">
                  <span className="text-[10px] text-slate-500 block">کل کارکرد</span>
                  <span className="text-xs font-extrabold text-slate-900 mt-0.5 block">
                    {formatToman(settleModalAccrued.grossEarnedToToday)} ت
                  </span>
                </div>
                <div className="px-1">
                  <span className="text-[10px] text-slate-500 block">دریافتی قبلی</span>
                  <span className="text-xs font-extrabold text-amber-700 mt-0.5 block">
                    {formatToman(settleModalAccrued.paidToToday)} ت
                  </span>
                </div>
                <div className="px-1">
                  <span className="text-[10px] text-emerald-800 font-bold block">مانده</span>
                  <span className="text-xs font-extrabold text-emerald-700 mt-0.5 block">
                    {formatToman(settleModalAccrued.netPayableToToday)} ت
                  </span>
                </div>
              </div>

              {/* Payment Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  نوع تراکنش
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleType('advance')}
                    className={`min-h-[42px] rounded-xl text-xs font-bold border transition-colors ${
                      settleType === 'advance'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    مساعده
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettleType('salary');
                      if (settleModalAccrued.netPayableToToday > 0 && !settleAmountInput) {
                        setSettleAmountInput(String(settleModalAccrued.netPayableToToday));
                      }
                    }}
                    className={`min-h-[42px] rounded-xl text-xs font-bold border transition-colors ${
                      settleType === 'salary'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    تسویه کارکرد
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleType('deduction')}
                    className={`min-h-[42px] rounded-xl text-xs font-bold border transition-colors ${
                      settleType === 'deduction'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    کسر / خسارت
                  </button>
                </div>
              </div>

              {/* Date Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>تاریخ پرداخت</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const shToday = isoToShamsi(todayIso);
                      setSettleJy(shToday.jy);
                      setSettleJm(shToday.jm);
                      setSettleJd(shToday.jd);
                    }}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
                  >
                    امروز ({formatShamsiDayMonth(todayIso)})
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={settleJd}
                    onChange={(e) => setSettleJd(Number(e.target.value))}
                    className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {Array.from(
                      { length: getShamsiMonthLength(settleJy, settleJm) },
                      (_, i) => i + 1
                    ).map((d) => (
                      <option key={d} value={d}>
                        روز {toPersianDigits(d)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={settleJm}
                    onChange={(e) => {
                      const nextM = Number(e.target.value);
                      setSettleJm(nextM);
                      setSettleJd((prev) => Math.min(prev, getShamsiMonthLength(settleJy, nextM)));
                    }}
                    className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {PERSIAN_MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={settleJy}
                    onChange={(e) => {
                      const nextY = Number(e.target.value);
                      setSettleJy(nextY);
                      setSettleJd((prev) => Math.min(prev, getShamsiMonthLength(nextY, settleJm)));
                    }}
                    className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {toPersianDigits(y)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">مبلغ (تومان) *</label>
                  {settleAmountInput && Number(settleAmountInput) > 0 && (
                    <span className="text-xs font-extrabold text-emerald-700">
                      {formatToman(Number(settleAmountInput))} تومان
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={settleAmountInput}
                  onChange={(e) => setSettleAmountInput(e.target.value)}
                  placeholder="مثلاً: 1350000"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-bold focus:border-emerald-600"
                  required
                />

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {settleModalAccrued.netPayableToToday > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettleAmountInput(String(settleModalAccrued.netPayableToToday))
                      }
                      className="h-8 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-xs font-bold transition-colors"
                    >
                      کل مانده ({formatToman(settleModalAccrued.netPayableToToday)} ت)
                    </button>
                  )}
                  {[500000, 1000000, 2000000, 5000000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSettleAmountInput(String(preset))}
                      className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                    >
                      {formatToman(preset)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  توضیحات (کارت به کارت، نقدی، شماره پیگیری...)
                </label>
                <input
                  type="text"
                  value={settleNoteInput}
                  onChange={(e) => setSettleNoteInput(e.target.value)}
                  placeholder="مثلاً: واریز کارت به کارت علی‌الحساب"
                  className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:border-emerald-600"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettleModalWorkerId(null)}
                  className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {settleType === 'advance'
                      ? 'ثبت مساعده'
                      : settleType === 'salary'
                      ? 'ثبت تسویه کارکرد'
                      : 'ثبت کسر از حساب'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
