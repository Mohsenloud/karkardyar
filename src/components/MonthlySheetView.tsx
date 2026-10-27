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
} from 'lucide-react';
import {
  AccruedToTodaySummary,
  AttendanceStatus,
  CalcMode,
  DailyLog,
  PaymentRecord,
  Worker,
  WorkerMonthlySummary,
} from '../types';
import {
  PERSIAN_MONTHS,
  formatShamsiDayMonth,
  formatShamsiFull,
  formatShamsiShort,
  formatToman,
  getIsoDatesBetween,
  getShamsiMonthLength,
  getTodayIso,
  isFridayIso,
  isoToShamsi,
  shamsiToIso,
  toPersianDigits,
} from '../utils/jalali';
import { downloadPayslipPdf, printPayslipDocument } from '../utils/payslipExport';
import { getProjectTheme } from '../utils/projectThemes';

// Distinct vibrant light themes per worker card for a lively, modern mobile UI
const WORKER_LIGHT_THEMES = [
  {
    cardBg: 'bg-gradient-to-br from-emerald-50 via-teal-50/90 to-cyan-50/80',
    cardBorder: 'border-emerald-200',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs shadow-emerald-600/25',
    counterBg: 'bg-gradient-to-l from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-700/20',
    accentText: 'text-emerald-700',
    payableBox: 'bg-emerald-50/90 border-emerald-200/80',
  },
  {
    cardBg: 'bg-gradient-to-br from-sky-50 via-blue-50/90 to-indigo-50/80',
    cardBorder: 'border-sky-200',
    avatarBg: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-xs shadow-sky-600/25',
    counterBg: 'bg-gradient-to-l from-sky-600 to-blue-600 text-white shadow-sm shadow-sky-700/20',
    accentText: 'text-sky-700',
    payableBox: 'bg-sky-50/90 border-sky-200/80',
  },
  {
    cardBg: 'bg-gradient-to-br from-amber-50 via-orange-50/85 to-yellow-50/80',
    cardBorder: 'border-amber-200',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xs shadow-amber-600/25',
    counterBg: 'bg-gradient-to-l from-amber-500 to-orange-600 text-white shadow-sm shadow-amber-700/20',
    accentText: 'text-amber-800',
    payableBox: 'bg-amber-50/90 border-amber-200/80',
  },
  {
    cardBg: 'bg-gradient-to-br from-violet-50 via-indigo-50/90 to-purple-50/80',
    cardBorder: 'border-violet-200',
    avatarBg: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-xs shadow-violet-600/25',
    counterBg: 'bg-gradient-to-l from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-700/20',
    accentText: 'text-violet-700',
    payableBox: 'bg-violet-50/90 border-violet-200/80',
  },
  {
    cardBg: 'bg-gradient-to-br from-rose-50 via-pink-50/85 to-red-50/75',
    cardBorder: 'border-rose-200',
    avatarBg: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-xs shadow-rose-600/25',
    counterBg: 'bg-gradient-to-l from-rose-500 to-pink-600 text-white shadow-sm shadow-rose-700/20',
    accentText: 'text-rose-700',
    payableBox: 'bg-rose-50/90 border-rose-200/80',
  },
];

interface MonthlySheetViewProps {
  activeProjectName?: string;
  activeProjectColor?: string;
  shamsiYear: number;
  shamsiMonth: number;
  onChangeMonth: (year: number, month: number) => void;
  workers: Worker[];
  summaries: WorkerMonthlySummary[];
  accruedSummaries: AccruedToTodaySummary[];
  monthLogs: DailyLog[];
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
  const todayIso = getTodayIso();
  const activeProjTheme = getProjectTheme(activeProjectColor);

  const [editingWorkerId, setEditingWorkerId] = useState<number | null>(null);
  const [openCalendarWorkerId, setOpenCalendarWorkerId] = useState<number | null>(null);

  const [startJy, setStartJy] = useState<number>(1405);
  const [startJm, setStartJm] = useState<number>(7);
  const [startJd, setStartJd] = useState<number>(5);

  const [hasEndDate, setHasEndDate] = useState<boolean>(true);
  const [endJy, setEndJy] = useState<number>(1405);
  const [endJm, setEndJm] = useState<number>(8);
  const [endJd, setEndJd] = useState<number>(23);

  const [calcModeInput, setCalcModeInput] = useState<CalcMode>('to_today');
  const [manualWorkedDaysInput, setManualWorkedDaysInput] = useState<string>('');
  const [manualAbsentDaysInput, setManualAbsentDaysInput] = useState<string>('0');
  const [manualOvertimeInput, setManualOvertimeInput] = useState<string>('');
  const [fridaysOffInput, setFridaysOffInput] = useState<boolean>(false);

  const [payslipWorkerId, setPayslipWorkerId] = useState<number | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  // Advance & Settlement Modal State (پنجره مساعده و تسویه)
  const [settleModalWorkerId, setSettleModalWorkerId] = useState<number | null>(null);
  const [settleType, setSettleType] = useState<'advance' | 'salary' | 'deduction'>('salary');
  const [settleAmountInput, setSettleAmountInput] = useState<string>('');
  const [settleNoteInput, setSettleNoteInput] = useState<string>('');
  const [settleJy, setSettleJy] = useState<number>(1405);
  const [settleJm, setSettleJm] = useState<number>(7);
  const [settleJd, setSettleJd] = useState<number>(1);

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
        manualWorkedDaysInput.trim() === '' ? null : Math.max(0, Math.round(Number(manualWorkedDaysInput))),
      manual_absent_days: Math.max(0, Math.round(Number(manualAbsentDaysInput) || 0)),
      manual_overtime_hours:
        manualOvertimeInput.trim() === '' ? null : Math.max(0, Number(manualOvertimeInput)),
      auto_count_days: w.auto_count_days ?? 1,
      fridays_off: w.wage_type === 'daily' && fridaysOffInput ? 1 : 0,
    });
    setEditingWorkerId(null);
  };

  // Toggle Friday holiday setting for a single daily-wage worker
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

  // Instant 0ms +/- 1 full worked day adjustment
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

  // Instant 0ms toggle of a single day inside the continuous calendar
  // For normal days: default is Present (1) <-> Absent (0)
  // For Fridays when daily-wage worker has fridays_off=1: default is Holiday/Off (0) <-> Worked Friday (1)
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
        a?.grossEarnedToToday ?? 0,
        a?.paidToToday ?? 0,
        a?.netPayableToToday ?? 0,
      ];
    });

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');

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
    <div className="bg-white/95 rounded-xl p-2.5 border border-white/80">
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-slate-500 mb-2">
        <span>
          {worker.wage_type === 'daily' && worker.fridays_off
            ? 'جمعه‌ها تعطیل (نارنجی = ۰ روز) است؛ اگر کارگر در جمعه‌ای کار کرده روی آن کلیک کنید تا حاضر (سبز = ۱ روز) شود.'
            : 'لمس هر روز: حاضر (سبز = ۱ روز) یا غایب (قرمز = ۰ روز)'}
        </span>
        {worker.wage_type === 'daily' && Boolean(worker.fridays_off) && (
          <span className="w-fit px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200 font-bold">
            تعطیلی جمعه‌ها فعال ({toPersianDigits(acc.fridaysOffCount || 0)} جمعه کسر شد)
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 max-h-52 overflow-y-auto p-0.5">
        {periodDates.map((dItem, idx) => {
          const log = acc.periodLogs.find((l) => l.work_date === dItem.iso);
          const isFutureDay = dItem.iso > todayIso;
          const showMonthBadge = idx === 0 || dItem.jd === 1;
          const isFriday = dItem.weekday === 'جمعه';
          const isFridayOffActive =
            isFriday && worker.wage_type === 'daily' && Boolean(worker.fridays_off);

          let cellStyle =
            'bg-gradient-to-b from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-2xs';
          let subLabel = dItem.weekday;

          if (isFridayOffActive) {
            if (log?.status === 'present') {
              cellStyle =
                'bg-gradient-to-b from-emerald-500 to-teal-600 text-white border-emerald-600 ring-2 ring-amber-300 shadow-2xs';
              subLabel = 'جمعه ✓';
            } else if (log?.status === 'paid_leave') {
              cellStyle = 'bg-gradient-to-b from-sky-500 to-blue-600 text-white border-sky-600';
              subLabel = 'مرخصی';
            } else {
              cellStyle =
                'bg-orange-50 text-orange-800 border-dashed border-orange-300 hover:bg-orange-100';
              subLabel = 'تعطیل';
            }
          } else {
            if (log?.status === 'absent') {
              cellStyle = 'bg-rose-50 text-rose-600 border-rose-300 line-through';
            } else if (log?.status === 'paid_leave') {
              cellStyle = 'bg-gradient-to-b from-sky-500 to-blue-600 text-white border-sky-600';
            } else if (isFutureDay && acc.calcMode === 'to_today') {
              cellStyle =
                'bg-amber-50/90 text-amber-800 border-dashed border-amber-400 hover:bg-amber-100';
            }
          }

          return (
            <React.Fragment key={dItem.iso}>
              {showMonthBadge && (
                <span className="w-fit h-10 px-2.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold inline-flex items-center justify-center shrink-0">
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
                className={`w-11 h-10 rounded-lg font-mono-num border flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95 shrink-0 ${cellStyle}`}
              >
                <span className="text-[11px] font-extrabold leading-none">
                  {toPersianDigits(dItem.jd)}
                </span>
                <span className="text-[8px] font-normal leading-none opacity-95 whitespace-nowrap">
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
    <div className="space-y-3.5">
      {/* Top Overview Card - Dynamic Project Color & Modern Glass */}
      <section className={`${activeProjTheme.heroBanner} text-white rounded-3xl p-4 sm:p-4.5 transition-all`}>
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/15">
          <div>
            <h2 className="text-xs sm:text-sm font-extrabold text-white">
              حساب و کارکرد «{activeProjectName}» تا امروز ({formatShamsiDayMonth(todayIso)})
            </h2>
            <p className="text-[10px] text-white/85 mt-0.5 font-mono-num">
              تعداد کارگران این بخش: {toPersianDigits(workers.length)} نفر
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="w-fit h-8 px-2.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-[11px] font-bold text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-3 h-3 text-emerald-100" />
            <span>خروجی اکسل</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 font-mono-num">
          <div className="bg-white/15 rounded-xl px-2.5 py-2 border border-white/15">
            <span className="text-[10px] text-emerald-100 block">مجموع روز کارکرد</span>
            <span className="text-sm sm:text-base font-extrabold text-white mt-0.5 block">
              {toPersianDigits(totalDaysToTodayAll)}{' '}
              <span className="text-[10px] font-normal text-emerald-100">روز</span>
            </span>
          </div>

          <div className="bg-white/15 rounded-xl px-2.5 py-2 border border-white/15">
            <span className="text-[10px] text-emerald-100 block">کل دستمزد کارکرد</span>
            <span className="text-sm sm:text-base font-extrabold text-white mt-0.5 block truncate">
              {formatToman(totalGrossToTodayAll)}{' '}
              <span className="text-[10px] font-normal text-emerald-100">ت</span>
            </span>
          </div>

          <div className="bg-amber-400/20 rounded-xl px-2.5 py-2 border border-amber-300/30">
            <span className="text-[10px] text-amber-100 block">مساعده پرداختی</span>
            <span className="text-sm sm:text-base font-extrabold text-amber-200 mt-0.5 block truncate">
              {formatToman(totalPaidToTodayAll)}{' '}
              <span className="text-[10px] font-normal text-amber-100">ت</span>
            </span>
          </div>

          <div className="bg-white text-slate-900 rounded-xl px-2.5 py-2 shadow-2xs">
            <span className="text-[10px] text-emerald-700 font-bold block">مانده قابل پرداخت</span>
            <span className="text-sm sm:text-base font-extrabold text-emerald-800 mt-0.5 block truncate">
              {formatToman(totalNetToTodayAll)}{' '}
              <span className="text-[10px] font-normal text-slate-500">ت</span>
            </span>
          </div>
        </div>
      </section>

      {/* Toolbar: Friday Holiday Checkbox (for Daily-Wage Workers) + Card/Row View Switcher */}
      {workers.length > 0 && (
        <section className="bg-white border border-emerald-100 rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
          {/* Selectable Friday Holiday Option */}
          {dailyWorkers.length > 0 ? (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allDailyHaveFridaysOff}
                ref={(el) => {
                  if (el) el.indeterminate = someDailyHaveFridaysOff;
                }}
                onChange={(e) => onToggleAllDailyFridaysOff?.(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-extrabold text-slate-800">
                  تعطیلی جمعه‌ها (روزمزد)
                </span>
                <span className="text-[10px] text-slate-500">
                  (کسر خودکار جمعه‌ها؛ در صورت کارکرد در جمعه از «تقویم روزها» دستی فعال کنید)
                </span>
              </div>
            </label>
          ) : (
            <div className="text-[11px] text-slate-500">
              نمایش لیست کارگران «{activeProjectName}»
            </div>
          )}

          {/* View Mode Toggle: Card Grid vs Horizontal Rows */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 mr-auto">
            <button
              type="button"
              onClick={() => onChangeViewMode?.('card')}
              className={`w-fit h-7 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all ${
                viewMode === 'card'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>کارتی</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode?.('row')}
              className={`w-fit h-7 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all ${
                viewMode === 'row'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>ردیفی</span>
            </button>
          </div>
        </section>
      )}

      {workers.length === 0 ? (
        <div className="bg-white border border-emerald-100 rounded-2xl p-6 text-center space-y-3 shadow-2xs">
          <p className="text-xs sm:text-sm font-bold text-slate-700">
            هنوز هیچ کارگری در «{activeProjectName}» ثبت نشده است.
          </p>
          {onOpenWorkersTab && (
            <button
              type="button"
              onClick={onOpenWorkersTab}
              className="w-fit h-9 px-4 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>افزودن کارگر به «{activeProjectName}»</span>
            </button>
          )}
        </div>
      ) : null}

      {/* Worker List — Supports both 'card' (2-Column Grid) and 'row' (Compact Horizontal Rows) */}
      {viewMode === 'row' ? (
        <div className="space-y-1.5">
          {workers.map((worker, index) => {
            const acc = accruedSummaries.find((a) => a.workerId === worker.id);
            if (!acc) return null;

            const theme = WORKER_LIGHT_THEMES[index % WORKER_LIGHT_THEMES.length];
            const isCalendarOpen = openCalendarWorkerId === worker.id;
            const periodDates = isCalendarOpen
              ? getIsoDatesBetween(acc.startDate, acc.endDate || todayIso, 95)
              : [];

            return (
              <div
                key={worker.id}
                className="bg-white border border-slate-200/90 hover:border-emerald-300 rounded-xl px-3 py-2 shadow-2xs transition-all"
              >
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                  {/* 1. Identity (Name + Role + Project Dot) */}
                  <div className="flex items-center gap-2 min-w-0 flex-1 sm:min-w-[170px]">
                    <div
                      className={`w-7 h-7 rounded-lg ${theme.avatarBg} font-extrabold text-xs flex items-center justify-center shrink-0`}
                    >
                      {worker.name.trim().charAt(0)}
                    </div>
                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                        {worker.name}
                      </h3>
                      {worker.project_name && (
                        <span
                          title={`پروژه: ${worker.project_name}`}
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            getProjectTheme(worker.project_color, (worker.project_id || 1) - 1)
                              .dotClass
                          }`}
                        />
                      )}
                      <span className="text-[10px] text-slate-400 truncate hidden md:inline">
                        ({worker.role})
                      </span>
                      {worker.wage_type === 'daily' && (
                        <label
                          title="تعطیل کردن جمعه‌ها برای این کارگر روزمزد"
                          className={`w-fit px-1.5 py-0.5 rounded-md border text-[9px] font-bold inline-flex items-center gap-1 cursor-pointer select-none shrink-0 transition-colors ${
                            worker.fridays_off
                              ? 'bg-orange-50 border-orange-200 text-orange-700'
                              : 'bg-slate-50 border-slate-200/80 text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(worker.fridays_off)}
                            onChange={() => handleToggleSingleWorkerFridaysOff(worker)}
                            className="w-2.5 h-2.5 rounded text-orange-600 focus:ring-0 cursor-pointer"
                          />
                          <span>جمعه</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* 2. Compact Worked Days Stepper */}
                  <div className="flex items-center gap-1 font-mono-num bg-slate-50 border border-slate-200/80 rounded-lg p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickAdjustWorkedDays(worker, acc, -1)}
                      title="کسر ۱ روز"
                      className="w-6 h-6 rounded-md hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3 h-3 stroke-[2.5]" />
                    </button>

                    <span className="text-[11px] font-extrabold text-slate-800 px-1.5 whitespace-nowrap">
                      {toPersianDigits(acc.effectiveDaysToToday)} روز
                    </span>

                    {(acc.isDaysManuallyEdited || acc.manualAbsentDays > 0) && (
                      <button
                        type="button"
                        onClick={() => handleResetToAutoCalendar(worker)}
                        className="p-0.5 rounded text-amber-600 hover:bg-amber-100"
                        title="بازگشت به محاسبه خودکار تقویم"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleQuickAdjustWorkedDays(worker, acc, 1)}
                      title="افزودن ۱ روز"
                      className="w-6 h-6 rounded-md hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* 3. Minimal Financial Display (Net Payable + Subtle Hints) */}
                  <div className="flex items-center justify-end gap-2 font-mono-num shrink-0 sm:min-w-[150px]">
                    {acc.effectiveOvertimeHours > 0 && (
                      <span
                        title={`اضافه‌کار: ${formatToman(acc.overtimeEarnedToToday)} تومان`}
                        className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded hidden lg:inline-block"
                      >
                        +{toPersianDigits(acc.effectiveOvertimeHours)}س
                      </span>
                    )}
                    {acc.paidToToday > 0 && (
                      <span
                        title={`مساعده دریافتی: ${formatToman(acc.paidToToday)} تومان`}
                        className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded hidden xl:inline-block"
                      >
                        مساعده: {formatToman(acc.paidToToday)}
                      </span>
                    )}
                    <div className="text-left">
                      <span className="text-[10px] text-slate-400 ml-1">مانده:</span>
                      <span className={`text-xs sm:text-sm font-extrabold ${theme.accentText}`}>
                        {formatToman(acc.netPayableToToday)}
                      </span>
                      <span className="text-[9px] text-slate-400 mr-0.5">ت</span>
                    </div>
                  </div>

                  {/* 4. Ultra-Clean Action Bar (Icon Buttons + Settle Pill) */}
                  <div className="flex items-center justify-end gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenCalendarWorkerId(isCalendarOpen ? null : worker.id)
                      }
                      title="تقویم کارکرد و حضور/غیاب"
                      className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors ${
                        isCalendarOpen
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => openRangeAndDaysEditor(worker)}
                      title={`تنظیم تاریخ (${formatShamsiDayMonth(acc.startDate)} تا ${
                        acc.endDate ? formatShamsiDayMonth(acc.endDate) : 'امروز'
                      })`}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 inline-flex items-center justify-center transition-colors"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPayslipWorkerId(worker.id)}
                      title="مشاهده فیش حقوقی"
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 inline-flex items-center justify-center transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    </button>

                    <button
                      type="button"
                      onClick={() => openSettleModal(worker, acc)}
                      className="w-fit h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>تسویه</span>
                    </button>
                  </div>
                </div>

                {isCalendarOpen && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    {renderWorkerCalendarStrip(worker, acc, periodDates)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
          {workers.map((worker, index) => {
            const acc = accruedSummaries.find((a) => a.workerId === worker.id);
            if (!acc) return null;

            const theme = WORKER_LIGHT_THEMES[index % WORKER_LIGHT_THEMES.length];
            const isCalendarOpen = openCalendarWorkerId === worker.id;

            const periodDates = isCalendarOpen
              ? getIsoDatesBetween(acc.startDate, acc.endDate || todayIso, 95)
              : [];

            return (
              <div
                key={worker.id}
                className={`${theme.cardBg} border ${theme.cardBorder} rounded-2xl p-3 sm:p-3.5 space-y-2.5 shadow-2xs transition-all`}
              >
                {/* Zone 1: Worker Identity + Compact Net Payable Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl ${theme.avatarBg} font-extrabold text-sm flex items-center justify-center shrink-0`}
                    >
                      {worker.name.trim().charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                          {worker.name}
                        </h3>
                        {worker.project_name && (
                          <span
                            className={`w-fit px-2 py-0.5 rounded-md border text-[9px] font-extrabold inline-flex items-center gap-1 shrink-0 ${
                              getProjectTheme(worker.project_color, (worker.project_id || 1) - 1)
                                .badgeClass
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                getProjectTheme(worker.project_color, (worker.project_id || 1) - 1)
                                  .dotClass
                              }`}
                            />
                            <span>{worker.project_name}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono-num truncate">
                        {worker.role} ·{' '}
                        {worker.wage_type === 'daily'
                          ? `روزمزد ${formatToman(worker.base_wage)} ت`
                          : `ماهانه ${formatToman(worker.base_wage)} ت`}
                      </div>
                    </div>
                  </div>

                  {/* Compact Net Payable Box */}
                  <div className="w-fit bg-white border border-white rounded-xl px-2.5 py-1 text-left font-mono-num shrink-0 shadow-2xs">
                    <span className="text-[9px] text-slate-500 block leading-tight">
                      مانده پرداخت
                    </span>
                    <span className={`text-xs sm:text-sm font-extrabold ${theme.accentText}`}>
                      {formatToman(acc.netPayableToToday)}{' '}
                      <span className="text-[9px] font-normal text-slate-500">ت</span>
                    </span>
                  </div>
                </div>

                {/* Zone 2: Inner White Box — Compact & Non-Stretched */}
                <div className="bg-white/95 rounded-xl p-2.5 sm:p-3 border border-white space-y-2.5 shadow-2xs">
                  {/* Sub-row A: Entry/Exit Range + Per-Worker Friday Holiday Toggle + Modal Trigger Button */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
                    <div className="text-[11px] font-mono-num text-slate-700 leading-snug">
                      <span className="text-slate-500">بازه: </span>
                      <strong className="text-slate-900">
                        {formatShamsiDayMonth(acc.startDate)} تا{' '}
                        {acc.endDate ? formatShamsiDayMonth(acc.endDate) : 'امروز'}
                      </strong>
                      {acc.remainingDaysToWork !== null && acc.remainingDaysToWork > 0 && (
                        <span className="text-amber-600 font-bold mr-1 text-[10px]">
                          ({toPersianDigits(acc.remainingDaysToWork)} روز مانده)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {worker.wage_type === 'daily' && (
                        <label
                          title="با تیک زدن، جمعه‌های این کارگر روزمزد تعطیل (۰ روز) محاسبه می‌شود و از تقویم روزها قابل تغییر دستی است"
                          className={`w-fit h-7 px-2 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer select-none transition-colors ${
                            worker.fridays_off
                              ? 'bg-orange-50 border-orange-200 text-orange-800'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(worker.fridays_off)}
                            onChange={() => handleToggleSingleWorkerFridaysOff(worker)}
                            className="w-3 h-3 rounded text-orange-600 focus:ring-0 cursor-pointer"
                          />
                          <span>
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
                        className="w-fit h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>تغییر تاریخ</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-row B: Compact Icon-Only (- / +) Buttons + Fitted Center Pill */}
                  <div className="flex items-center justify-center gap-2.5 font-mono-num">
                    {/* Subtract 1 Day — Compact Icon Only */}
                    <button
                      type="button"
                      onClick={() => handleQuickAdjustWorkedDays(worker, acc, -1)}
                      title="کسر ۱ روز"
                      aria-label="کسر ۱ روز"
                      className="w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200/90 active:scale-95 text-rose-600 flex items-center justify-center transition-all shrink-0"
                    >
                      <Minus className="w-4 h-4 stroke-[2.5]" />
                    </button>

                    {/* Center Worked Days Display — Strictly fit to text (w-fit) */}
                    <div
                      className={`w-fit px-4 py-1 rounded-xl ${theme.counterBg} flex flex-col items-center justify-center shrink-0`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs sm:text-sm font-extrabold leading-none whitespace-nowrap">
                          {toPersianDigits(acc.effectiveDaysToToday)} روز کارکرد
                        </span>
                        {(acc.isDaysManuallyEdited || acc.manualAbsentDays > 0) && (
                          <button
                            type="button"
                            onClick={() => handleResetToAutoCalendar(worker)}
                            className="p-0.5 rounded bg-white/20 hover:bg-white/30 text-white transition-colors"
                            title="بازگشت به محاسبه خودکار تقویم"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                      <span className="w-fit mt-1 px-1.5 py-0.5 rounded bg-black/15 text-[9px] font-medium text-white/95 leading-none whitespace-nowrap">
                        {acc.isDaysManuallyEdited
                          ? 'ویرایش دستی'
                          : worker.wage_type === 'daily' && worker.fridays_off
                          ? `بدون جمعه‌ها (${toPersianDigits(acc.fridaysOffCount || 0)} جمعه کسر شد)`
                          : 'محاسبه تا امروز'}
                      </span>
                    </div>

                    {/* Add 1 Day — Compact Icon Only */}
                    <button
                      type="button"
                      onClick={() => handleQuickAdjustWorkedDays(worker, acc, 1)}
                      title="افزودن ۱ روز"
                      aria-label="افزودن ۱ روز"
                      className="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 active:scale-95 text-emerald-600 flex items-center justify-center transition-all shrink-0"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* Sub-row C: Compact Financial Breakdown */}
                  <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100 text-center font-mono-num">
                    <div className="bg-slate-50/90 border border-slate-100 rounded-lg py-1.5 px-1">
                      <span className="text-[9px] text-slate-500 block">دستمزد پایه</span>
                      <span className="text-[11px] font-extrabold text-slate-800 mt-0.5 block truncate">
                        {formatToman(acc.baseEarnedToToday)} ت
                      </span>
                    </div>

                    <div className="bg-sky-50/70 border border-sky-100 rounded-lg py-1.5 px-1">
                      <span className="text-[9px] text-sky-700 block">
                        اضافه‌کاری ({toPersianDigits(acc.effectiveOvertimeHours)} س)
                      </span>
                      <span className="text-[11px] font-extrabold text-sky-800 mt-0.5 block truncate">
                        {formatToman(acc.overtimeEarnedToToday + acc.bonusToToday)} ت
                      </span>
                    </div>

                    <div className="bg-amber-50/80 border border-amber-100 rounded-lg py-1.5 px-1">
                      <span className="text-[9px] text-amber-800 block">مساعده</span>
                      <span className="text-[11px] font-extrabold text-amber-700 mt-0.5 block truncate">
                        {formatToman(acc.paidToToday)} ت
                      </span>
                    </div>
                  </div>
                </div>

                {/* Zone 3: Compact Non-Stretched Action Buttons (w-fit) */}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenCalendarWorkerId(isCalendarOpen ? null : worker.id)
                      }
                      className={`w-fit h-8 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all whitespace-nowrap ${
                        isCalendarOpen
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-white/90 hover:bg-white text-slate-700 border border-white shadow-2xs'
                      }`}
                    >
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>{isCalendarOpen ? 'بستن تقویم' : 'تقویم روزها'}</span>
                      {isCalendarOpen ? (
                        <ChevronUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPayslipWorkerId(worker.id)}
                      className="w-fit h-8 px-2.5 rounded-lg bg-white/90 hover:bg-white text-slate-700 border border-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap shadow-2xs"
                    >
                      <FileText className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>فیش کارکرد</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => openSettleModal(worker, acc)}
                    className="w-fit h-8 px-3 rounded-lg bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-95 text-white text-[11px] font-bold inline-flex items-center gap-1 transition-all whitespace-nowrap shadow-2xs"
                  >
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>تسویه مانده</span>
                  </button>
                </div>

                {/* Collapsible Interactive Calendar Strip */}
                {isCalendarOpen && renderWorkerCalendarStrip(worker, acc, periodDates)}
              </div>
            );
          })}
        </div>
      )}

      {/* Separate Modal Window for Changing Entry/Exit Date & Worked Days */}
      {editingWorker && editingWorkerAccrued && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setEditingWorkerId(null)}
        >
          <div
            className="bg-white border border-emerald-100 rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  تغییر تاریخ ورود و خروج — {editingWorker.name}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تنظیم بازه همکاری و روزهای کارکرد
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingWorkerId(null)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Entry Date */}
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200/80 space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  تاریخ ورود (شروع کار)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={startJd}
                    onChange={(e) => setStartJd(Number(e.target.value))}
                    className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num font-semibold"
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
                    onChange={(e) => setStartJm(Number(e.target.value))}
                    className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {PERSIAN_MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={startJy}
                    onChange={(e) => setStartJy(Number(e.target.value))}
                    className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
                  >
                    {[1403, 1404, 1405, 1406, 1407].map((y) => (
                      <option key={y} value={y}>
                        {toPersianDigits(y)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Exit Date */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    تاریخ خروج (پایان دوره)
                  </label>
                  <label className="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasEndDate}
                      onChange={(e) => setHasEndDate(e.target.checked)}
                      className="rounded"
                    />
                    <span>دارای تاریخ خروج</span>
                  </label>
                </div>

                {hasEndDate ? (
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={endJd}
                      onChange={(e) => setEndJd(Number(e.target.value))}
                      className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num font-semibold"
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
                      onChange={(e) => setEndJm(Number(e.target.value))}
                      className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                    >
                      {PERSIAN_MONTHS.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={endJy}
                      onChange={(e) => setEndJy(Number(e.target.value))}
                      className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
                    >
                      {[1403, 1404, 1405, 1406, 1407].map((y) => (
                        <option key={y} value={y}>
                          {toPersianDigits(y)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 pt-0.5">
                    مشغول به کار (محاسبه تا امروز)
                  </p>
                )}
              </div>

              {/* Direct Overrides & Friday Holiday Option */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    مبنای محاسبه تقویم
                  </label>
                  <select
                    value={calcModeInput}
                    onChange={(e) => setCalcModeInput(e.target.value as CalcMode)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="to_today">از تاریخ ورود تا امروز</option>
                    <option value="full_range">کل بازه ورود تا خروج</option>
                  </select>
                </div>

                {editingWorker.wage_type === 'daily' && (
                  <label className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-50/80 border border-orange-200/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={fridaysOffInput}
                      onChange={(e) => setFridaysOffInput(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-600 focus:ring-0 cursor-pointer"
                    />
                    <div className="text-[11px] text-orange-950">
                      <span className="font-bold block">تعطیل بودن جمعه‌ها (ویژه روزمزد)</span>
                      <span className="text-[10px] text-orange-800">
                        جمعه‌ها خودکار کسر می‌شوند؛ در صورت کارکرد در جمعه از تقویم دستی فعال کنید.
                      </span>
                    </div>
                  </label>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      روز کارکرد دستی
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={manualWorkedDaysInput}
                      onChange={(e) => setManualWorkedDaysInput(e.target.value)}
                      placeholder={`خودکار (${editingWorkerAccrued.rawCalculatedDays})`}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono-num font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      ساعت اضافه‌کاری کل
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={manualOvertimeInput}
                      onChange={(e) => setManualOvertimeInput(e.target.value)}
                      placeholder={`خودکار (${editingWorkerAccrued.loggedOvertimeHours})`}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingWorkerId(null)}
                className="w-fit h-9 px-3.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditor(editingWorker)}
                className="w-fit h-9 px-4 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 text-white text-xs font-bold hover:from-emerald-600 hover:to-teal-700 shadow-xs shadow-emerald-600/20"
              >
                ذخیره تغییرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile-Optimized Printable & PDF Worker Payslip Modal */}
      {selectedPayslipWorker && selectedPayslipAccrued && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setPayslipWorkerId(null)}
        >
          <div
            className="bg-white border border-emerald-100 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Vibrant Header */}
            <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white p-3.5 sm:p-4 shrink-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/25 flex items-center justify-center font-extrabold text-base shrink-0">
                    {selectedPayslipWorker.name.trim().charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                      صورت‌حساب کارکرد — {selectedPayslipWorker.name}
                    </h3>
                    <p className="text-[11px] text-emerald-100 font-mono-num truncate mt-0.5">
                      {selectedPayslipWorker.role} ·{' '}
                      {selectedPayslipWorker.wage_type === 'daily'
                        ? `روزمزد ${formatToman(selectedPayslipWorker.base_wage)} ت`
                        : `ماهانه ${formatToman(selectedPayslipWorker.base_wage)} ت`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPayslipWorkerId(null)}
                  className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
                  aria-label="بستن"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Action Bar inside Header: PDF Download & Print (Compact w-fit buttons) */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/15">
                <span className="text-[10px] text-emerald-100 font-mono-num">
                  گزارش تا: {formatShamsiDayMonth(todayIso, true)}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isDownloadingPdf}
                    onClick={async () => {
                      setIsDownloadingPdf(true);
                      try {
                        await downloadPayslipPdf({
                          worker: selectedPayslipWorker,
                          accrued: selectedPayslipAccrued,
                          payments: selectedPayslipPayments,
                          todayIso,
                        });
                      } finally {
                        setIsDownloadingPdf(false);
                      }
                    }}
                    className="w-fit h-8 px-3 rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 active:scale-95 text-[11px] font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-60"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isDownloadingPdf ? 'در حال ساخت...' : 'دانلود PDF'}</span>
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
                    className="w-fit h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 border border-white/25 active:scale-95 text-white text-[11px] font-bold inline-flex items-center gap-1.5 transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>چاپ</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Body Optimized for Mobile */}
            <div className="p-3.5 sm:p-4 space-y-3.5 overflow-y-auto font-mono-num">
              {/* Attendance & Period 2-Column Mobile Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] text-slate-500 block">تاریخ ورود</span>
                  <span className="text-xs font-extrabold text-slate-900 mt-0.5 block">
                    {formatShamsiDayMonth(selectedPayslipAccrued.startDate, true)}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] text-slate-500 block">تاریخ خروج / پایان</span>
                  <span className="text-xs font-extrabold text-slate-900 mt-0.5 block">
                    {selectedPayslipAccrued.endDate
                      ? formatShamsiDayMonth(selectedPayslipAccrued.endDate, true)
                      : 'مشغول به کار'}
                  </span>
                </div>

                <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] text-emerald-700 block">کارکرد خالص</span>
                  <span className="text-xs sm:text-sm font-extrabold text-emerald-800 mt-0.5 block">
                    {toPersianDigits(selectedPayslipAccrued.effectiveDaysToToday)} روز
                  </span>
                </div>

                <div className="bg-sky-50/80 border border-sky-200/80 rounded-xl p-2.5">
                  <span className="text-[10px] text-sky-700 block">اضافه‌کاری</span>
                  <span className="text-xs sm:text-sm font-extrabold text-sky-800 mt-0.5 block">
                    {toPersianDigits(selectedPayslipAccrued.effectiveOvertimeHours)} ساعت
                  </span>
                </div>

                {selectedPayslipAccrued.remainingDaysToWork !== null && (
                  <div className="col-span-2 bg-amber-50/70 border border-amber-200/80 rounded-xl px-3 py-2 flex items-center justify-between">
                    <span className="text-[11px] text-amber-800">روزهای باقی‌مانده تا خروج:</span>
                    <span className="text-xs font-extrabold text-amber-900">
                      {toPersianDigits(selectedPayslipAccrued.remainingDaysToWork)} روز
                    </span>
                  </div>
                )}
              </div>

              {/* Financial Breakdown Box */}
              <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">دستمزد پایه کارکرد:</span>
                  <span className="font-bold text-slate-900">
                    {formatToman(selectedPayslipAccrued.baseEarnedToToday)} تومان
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    مبلغ اضافه‌کاری ({toPersianDigits(selectedPayslipAccrued.effectiveOvertimeHours)}{' '}
                    ساعت):
                  </span>
                  <span className="font-bold text-sky-800">
                    {formatToman(
                      selectedPayslipAccrued.overtimeEarnedToToday +
                        selectedPayslipAccrued.bonusToToday
                    )}{' '}
                    تومان
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80">
                  <span className="font-bold text-slate-700">جمع کل کارکرد:</span>
                  <span className="font-extrabold text-slate-900">
                    {formatToman(selectedPayslipAccrued.grossEarnedToToday)} تومان
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-800">کسر مساعده و دریافتی:</span>
                  <span className="font-bold text-amber-700">
                    {formatToman(selectedPayslipAccrued.paidToToday)} تومان
                  </span>
                </div>

                {/* Highlighted Net Payable Banner */}
                <div className="mt-2 pt-2.5 border-t border-emerald-200 bg-gradient-to-l from-emerald-50 to-teal-50 rounded-xl p-2.5 border flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-900">
                    مانده قابل پرداخت:
                  </span>
                  <span className="text-sm sm:text-base font-extrabold text-emerald-700">
                    {formatToman(selectedPayslipAccrued.netPayableToToday)}{' '}
                    <span className="text-[10px] font-normal text-emerald-800">تومان</span>
                  </span>
                </div>
              </div>

              {/* Mobile-Friendly Payments List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800">
                    ریز مساعده‌ها و پرداختی‌ها
                  </h4>
                  <span className="w-fit px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                    {toPersianDigits(selectedPayslipPayments.length)} مورد
                  </span>
                </div>

                {selectedPayslipPayments.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 text-center text-xs text-slate-500">
                    هیچ پرداختی برای این کارگر ثبت نشده است.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                    {selectedPayslipPayments.map((p) => {
                      const badgeStyle =
                        p.payment_type === 'advance'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : p.payment_type === 'salary'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200';
                      const typeLabel =
                        p.payment_type === 'advance'
                          ? 'مساعده'
                          : p.payment_type === 'salary'
                          ? 'تسویه حقوق'
                          : 'کسر / جریمه';

                      return (
                        <div
                          key={p.id}
                          className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-fit px-2 py-0.5 rounded-md border text-[10px] font-bold ${badgeStyle}`}
                              >
                                {typeLabel}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-600">
                                {formatShamsiShort(p.payment_date)}
                              </span>
                            </div>
                            {p.note && (
                              <p className="text-[10px] text-slate-500 truncate mt-1">
                                {p.note}
                              </p>
                            )}
                          </div>

                          <div className="text-left shrink-0">
                            <span className="text-xs font-extrabold text-slate-900">
                              {formatToman(p.amount)}
                            </span>
                            <span className="text-[9px] text-slate-500 mr-0.5">ت</span>
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

      {/* Separate Modal Window for Advance & Settlement (پنجره مساعده و تسویه) */}
      {settleModalWorker && settleModalAccrued && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
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
            className="bg-white border border-emerald-100 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white p-3.5 sm:p-4 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  ثبت مساعده و تسویه — {settleModalWorker.name}
                </h3>
                <p className="text-[11px] text-emerald-100 mt-0.5 font-mono-num">
                  {settleModalWorker.project_name
                    ? `${settleModalWorker.project_name} · `
                    : ''}
                  {settleModalWorker.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettleModalWorkerId(null)}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 flex items-center justify-center text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-4 space-y-3 font-mono-num">
              {/* Worker Financial Summary Strip */}
              <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-50 border border-slate-200/80 rounded-xl p-2">
                <div>
                  <span className="text-[9px] text-slate-500 block">کل کارکرد</span>
                  <span className="text-[11px] font-extrabold text-slate-800 mt-0.5 block">
                    {formatToman(settleModalAccrued.grossEarnedToToday)} ت
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 block">دریافتی قبلی</span>
                  <span className="text-[11px] font-extrabold text-amber-700 mt-0.5 block">
                    {formatToman(settleModalAccrued.paidToToday)} ت
                  </span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg py-0.5">
                  <span className="text-[9px] text-emerald-800 font-bold block">
                    مانده قابل پرداخت
                  </span>
                  <span className="text-[11px] font-extrabold text-emerald-700 mt-0.5 block">
                    {formatToman(settleModalAccrued.netPayableToToday)} ت
                  </span>
                </div>
              </div>

              {/* Payment Type Selection: Advance (علی‌الحساب) vs Settlement (تسویه) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  نوع پرداخت را انتخاب کنید:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleType('advance')}
                    className={`h-9 rounded-xl text-xs font-extrabold border transition-all ${
                      settleType === 'advance'
                        ? 'bg-gradient-to-l from-amber-500 to-orange-500 text-white border-amber-500 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    علی‌الحساب (مساعده)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettleType('salary');
                      if (settleModalAccrued.netPayableToToday > 0 && !settleAmountInput) {
                        setSettleAmountInput(String(settleModalAccrued.netPayableToToday));
                      }
                    }}
                    className={`h-9 rounded-xl text-xs font-extrabold border transition-all ${
                      settleType === 'salary'
                        ? 'bg-gradient-to-l from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    تسویه کارکرد
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleType('deduction')}
                    className={`h-9 rounded-xl text-xs font-extrabold border transition-all ${
                      settleType === 'deduction'
                        ? 'bg-gradient-to-l from-rose-500 to-red-600 text-white border-rose-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    کسر / خسارت
                  </button>
                </div>
              </div>

              {/* Payment Date Selector (تاریخ ثبت مساعده / تسویه) */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
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
                    className="w-fit px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold transition-colors"
                  >
                    امروز ({formatShamsiDayMonth(todayIso)})
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={settleJd}
                    onChange={(e) => setSettleJd(Number(e.target.value))}
                    className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
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
                    onChange={(e) => setSettleJm(Number(e.target.value))}
                    className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {PERSIAN_MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={settleJy}
                    onChange={(e) => setSettleJy(Number(e.target.value))}
                    className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    {[1403, 1404, 1405, 1406, 1407].map((y) => (
                      <option key={y} value={y}>
                        {toPersianDigits(y)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount Input + Quick Fill Buttons */}
              <div>
                <div className="flex items-center justify-between mb-1">
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
                  placeholder="هر مبلغ دلخواه (مثلاً 1350000)..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:border-emerald-600"
                  required
                />

                {/* Quick Presets + Full Remaining Balance Button */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {settleModalAccrued.netPayableToToday > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettleAmountInput(String(settleModalAccrued.netPayableToToday))
                      }
                      className="w-fit px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-extrabold transition-colors"
                    >
                      کل مانده ({formatToman(settleModalAccrued.netPayableToToday)} ت)
                    </button>
                  )}
                  {[500000, 1000000, 2000000, 5000000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSettleAmountInput(String(preset))}
                      className="w-fit px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition-colors"
                    >
                      {formatToman(preset)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Note */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  توضیحات (کارت به کارت، نقدی، شماره پیگیری...)
                </label>
                <input
                  type="text"
                  value={settleNoteInput}
                  onChange={(e) => setSettleNoteInput(e.target.value)}
                  placeholder="مثلاً: واریز کارت به کارت علی‌الحساب"
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettleModalWorkerId(null)}
                  className="w-fit h-9 px-3.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="w-fit h-9 px-4 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs shadow-emerald-600/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {settleType === 'advance'
                      ? 'ثبت مساعده (علی‌الحساب)'
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
