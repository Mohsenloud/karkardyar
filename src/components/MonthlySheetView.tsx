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
  Lock,
  Unlock,
  Layers,
  Share2,
  MessageCircle,
  Archive,
} from 'lucide-react';
import {
  AccruedToTodaySummary,
  AttendanceStatus,
  CalcMode,
  DailyLog,
  LockedMonthRecord,
  PaymentRecord,
  PaymentType,
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
  downloadBatchPayslipsPdf,
  printBatchPayslips,
  buildWhatsAppPayslipUrl,
  sharePayslipSummary,
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
  selectedProjectId?: number | 'all';
  todayIso: string;
  workers: Worker[];
  accruedSummaries: AccruedToTodaySummary[];
  payments: PaymentRecord[];
  lockedMonths?: LockedMonthRecord[];
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
    paymentType?: PaymentType,
    note?: string,
    paymentDateIso?: string
  ) => void;
  onToggleMonthLock?: (payload: {
    project_id: number;
    shamsi_year: number;
    shamsi_month: number;
    locked: boolean;
    note?: string;
  }) => Promise<void>;
  onClosePeriod?: (payload: {
    project_id: number | 'all';
    next_start_date: string;
    lock_current_month: boolean;
    shamsi_year: number;
    shamsi_month: number;
  }) => Promise<void>;
  onShowToast?: (msg: string) => void;
  onOpenWorkersTab?: () => void;
}

export const MonthlySheetView: React.FC<MonthlySheetViewProps> = ({
  activeProjectName = 'همه پروژه‌ها',
  activeProjectColor = 'emerald',
  selectedProjectId = 'all',
  todayIso,
  workers,
  accruedSummaries,
  payments,
  lockedMonths = [],
  viewMode = 'card',
  onChangeViewMode,
  onToggleAllDailyFridaysOff,
  onSaveDailyLog,
  onSaveWorkerRangeAndDays,
  onQuickSettleWorker,
  onToggleMonthLock,
  onClosePeriod,
  onShowToast,
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
  const [isExportingBatch, setIsExportingBatch] = useState<boolean>(false);
  const [downloadFeedback, setDownloadFeedback] = useState<'pdf' | 'html' | null>(null);

  // Period Close & Month Lock Modal
  const [showPeriodModal, setShowPeriodModal] = useState<boolean>(false);
  const [periodModalTab, setPeriodModalTab] = useState<'close' | 'lock'>('close');
  const [lockJy, setLockJy] = useState<number>(todayShamsi.jy);
  const [lockJm, setLockJm] = useState<number>(todayShamsi.jm);
  const [closeNextJy, setCloseNextJy] = useState<number>(todayShamsi.jy);
  const [closeNextJm, setCloseNextJm] = useState<number>(todayShamsi.jm);
  const [closeNextJd, setCloseNextJd] = useState<number>(todayShamsi.jd);
  const [lockCurrentOnClose, setLockCurrentOnClose] = useState<boolean>(true);
  const [processingPeriodAction, setProcessingPeriodAction] = useState<boolean>(false);

  // Advance & Settlement Modal State
  const [settleModalWorkerId, setSettleModalWorkerId] = useState<number | null>(null);
  const [settleType, setSettleType] = useState<PaymentType>('salary');
  const [settleAmountInput, setSettleAmountInput] = useState<string>('');
  const [settleNoteInput, setSettleNoteInput] = useState<string>('');
  const [settleJy, setSettleJy] = useState<number>(todayShamsi.jy);
  const [settleJm, setSettleJm] = useState<number>(todayShamsi.jm);
  const [settleJd, setSettleJd] = useState<number>(todayShamsi.jd);

  const yearOptions = getShamsiYearOptions(todayShamsi.jy, [
    startJy,
    endJy,
    settleJy,
    lockJy,
    closeNextJy,
  ]);

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
      'مزایا (تومان)',
      'کسورات (تومان)',
      'مانده دوره قبل (تومان)',
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
        (a?.fixedAllowance ?? 0) + (a?.extraAllowancesToToday ?? 0),
        (a?.fixedDeduction ?? 0) + (a?.deductionsToToday ?? 0),
        a?.carryOverBalance ?? 0,
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

  const buildAllBatchItems = () =>
    workers
      .map((w) => {
        const acc = accruedSummaries.find((a) => a.workerId === w.id);
        if (!acc) return null;
        return {
          worker: w,
          accrued: acc,
          payments: payments.filter((p) => p.worker_id === w.id),
          todayIso,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

  const handleDownloadBatchPdf = async () => {
    const items = buildAllBatchItems();
    if (items.length === 0) return;
    setIsExportingBatch(true);
    try {
      const mode = await downloadBatchPayslipsPdf(items, activeProjectName, todayIso);
      onShowToast?.(
        mode === 'pdf'
          ? `فیش یکجای ${toPersianDigits(items.length)} کارگر دانلود شد`
          : 'فیش یکجا در قالب HTML ذخیره شد'
      );
    } finally {
      setIsExportingBatch(false);
    }
  };

  const handlePrintBatchPayslips = async () => {
    const items = buildAllBatchItems();
    if (items.length === 0) return;
    await printBatchPayslips(items, activeProjectName);
  };

  const currentProjectIdNumeric = selectedProjectId === 'all' ? 0 : selectedProjectId;
  const isTargetLockMonthLocked = lockedMonths.some(
    (l) =>
      l.shamsi_year === lockJy &&
      l.shamsi_month === lockJm &&
      (l.project_id === 0 || l.project_id === currentProjectIdNumeric)
  );

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
    <div className="bg-zinc-50/90 rounded-xl p-3 ring-1 ring-zinc-950/5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
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

          let cellStyle = 'bg-emerald-600 text-white border-emerald-600 shadow-2xs';
          let subLabel = dItem.weekday;

          if (isFridayOffActive) {
            if (log?.status === 'present') {
              cellStyle =
                'bg-emerald-600 text-white border-emerald-600 ring-2 ring-amber-400 shadow-2xs';
              subLabel = 'جمعه ✓';
            } else if (log?.status === 'paid_leave') {
              cellStyle = 'bg-sky-600 text-white border-sky-600 shadow-2xs';
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
              cellStyle = 'bg-sky-600 text-white border-sky-600 shadow-2xs';
            } else if (isFutureDay && acc.calcMode === 'to_today') {
              cellStyle =
                'bg-white text-zinc-500 border-dashed border-zinc-300 hover:bg-zinc-100';
            }
          }

          return (
            <React.Fragment key={dItem.iso}>
              {showMonthBadge && (
                <span className="h-11 px-2.5 rounded-lg bg-zinc-200/80 text-zinc-800 text-[11px] font-bold inline-flex items-center justify-center shrink-0">
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
      {/* Catalyst Financial Stat Sheet */}
      <section
        className={`bg-white ring-1 shadow-2xs rounded-2xl overflow-hidden transition-colors ${
          selectedProjectId === 'all' ? 'ring-zinc-950/10' : activeProjTheme.cardBorder
        }`}
      >
        {/* Mobile Financial Header (< sm) — Complete, Uncluttered, Zero Truncation */}
        <div className="sm:hidden">
          <div
            className={`px-3.5 py-3 space-y-2.5 border-b transition-colors ${
              selectedProjectId === 'all'
                ? 'bg-linear-to-l from-zinc-100 via-zinc-50/90 to-slate-50/60 border-zinc-200/80'
                : activeProjTheme.headerTintBg
            }`}
          >
            {/* Row 1: Project Title + Date & Headcount */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${activeProjTheme.dotClass}`} />
                <span className="text-xs font-extrabold text-zinc-950">
                  تراز مالی «{activeProjectName}»
                </span>
              </div>
              <span className="text-[11px] font-mono-num text-zinc-500">
                تا {formatShamsiDayMonth(todayIso)} · {toPersianDigits(workers.length)} نفر
              </span>
            </div>

            {/* Row 2: Hero Net Payable + Total Worked Days */}
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5 pt-0.5">
              <div>
                <span className="block text-[11px] font-semibold text-zinc-500">
                  مانده قابل پرداخت
                </span>
                <div
                  className={`text-xl font-extrabold font-mono-num tracking-tight mt-0.5 leading-snug ${activeProjTheme.accentText}`}
                >
                  {formatToman(totalNetToTodayAll)}{' '}
                  <span className="text-xs font-medium text-zinc-500">تومان</span>
                </div>
              </div>

              <div className="text-left">
                <span className="block text-[10px] font-medium text-zinc-500">
                  مجموع کارکرد
                </span>
                <span className="text-sm font-extrabold font-mono-num text-zinc-950 mt-0.5 block">
                  {toPersianDigits(totalDaysToTodayAll)}{' '}
                  <span className="text-[11px] font-normal text-zinc-500">روز</span>
                </span>
              </div>
            </div>

            {/* Row 3: Clean Action Strip (Full Labels, Wraps Safely on Narrow Screens) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {workers.length > 0 && (
                <>
                  <button
                    type="button"
                    disabled={isExportingBatch}
                    onClick={handleDownloadBatchPdf}
                    className="flex-1 min-w-[78px] h-8 px-2 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-[11px] font-bold text-zinc-800 inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{isExportingBatch ? 'در حال ساخت...' : 'فیش PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintBatchPayslips}
                    className="h-8 px-2.5 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-[11px] font-bold text-zinc-800 inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span>چاپ</span>
                  </button>
                </>
              )}
              {(onToggleMonthLock || onClosePeriod) && (
                <button
                  type="button"
                  onClick={() => setShowPeriodModal(true)}
                  className="flex-1 min-w-[78px] h-8 px-2 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-[11px] font-bold text-zinc-800 inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>قفل دوره</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleExportCsv}
                className="h-8 px-2.5 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-[11px] font-bold text-zinc-800 inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>اکسل</span>
              </button>
            </div>
          </div>

          {/* Spacious 2-Column Financial Breakdown — Zero Truncation */}
          <div className="grid grid-cols-2 divide-x divide-x-reverse divide-zinc-950/5 py-2.5 border-t border-zinc-950/5 font-mono-num bg-white">
            <div className="px-3.5">
              <span className="text-[11px] text-zinc-500 block">کل دستمزد کارکرد</span>
              <span className="text-sm font-extrabold text-zinc-950 mt-0.5 block leading-snug">
                {formatToman(totalGrossToTodayAll)}{' '}
                <span className="text-[11px] font-normal text-zinc-500">تومان</span>
              </span>
            </div>
            <div className="px-3.5">
              <span className="text-[11px] text-amber-700 block">مساعده پرداختی</span>
              <span className="text-sm font-extrabold text-amber-700 mt-0.5 block leading-snug">
                {formatToman(totalPaidToTodayAll)}{' '}
                <span className="text-[11px] font-normal text-amber-600/80">تومان</span>
              </span>
            </div>
          </div>
        </div>

        {/* Desktop / Tablet Catalyst Stat Sheet (sm:) */}
        <div className="hidden sm:block">
          <div
            className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 transition-colors ${
              selectedProjectId === 'all'
                ? 'bg-linear-to-l from-zinc-100 via-zinc-50/90 to-slate-50/60 border-zinc-200/80'
                : activeProjTheme.headerTintBg
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeProjTheme.dotClass}`} />
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-zinc-950 tracking-tight truncate">
                  تراز مالی «{activeProjectName}»
                </h2>
                <p className="text-xs text-zinc-500 font-mono-num mt-0.5">
                  تا امروز {formatShamsiDayMonth(todayIso)} · {toPersianDigits(workers.length)} نفر
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {workers.length > 0 && (
                <>
                  <button
                    type="button"
                    disabled={isExportingBatch}
                    onClick={handleDownloadBatchPdf}
                    className="h-9 px-3 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-xs font-bold text-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isExportingBatch ? 'در حال ساخت PDF...' : 'فیش یکجا PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintBatchPayslips}
                    title="چاپ یکجای فیش کل کارگران"
                    className="h-9 w-9 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-zinc-700 inline-flex items-center justify-center transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {(onToggleMonthLock || onClosePeriod) && (
                <button
                  type="button"
                  onClick={() => setShowPeriodModal(true)}
                  className="h-9 px-3 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-xs font-bold text-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Archive className="w-3.5 h-3.5 text-amber-600" />
                  <span>بستن دوره / قفل ماه</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExportCsv}
                className="h-9 px-3.5 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-xs font-bold text-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-zinc-500" />
                <span>خروجی اکسل</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 lg:divide-x lg:divide-x-reverse divide-zinc-950/5 font-mono-num bg-white">
            <div className="px-5 py-4">
              <span className="text-xs font-medium text-zinc-500 block">مجموع روز کارکرد</span>
              <span className="text-xl font-extrabold text-zinc-950 tracking-tight mt-1.5 block">
                {toPersianDigits(totalDaysToTodayAll)}{' '}
                <span className="text-xs font-normal text-zinc-400">روز</span>
              </span>
            </div>

            <div className="px-5 py-4">
              <span className="text-xs font-medium text-zinc-500 block">کل دستمزد کارکرد</span>
              <span className="text-xl font-extrabold text-zinc-950 tracking-tight mt-1.5 block truncate">
                {formatToman(totalGrossToTodayAll)}{' '}
                <span className="text-xs font-normal text-zinc-400">ت</span>
              </span>
            </div>

            <div className="px-5 py-4 border-t lg:border-t-0 border-zinc-950/5">
              <span className="text-xs font-medium text-amber-700 block">مساعده پرداختی</span>
              <span className="text-xl font-extrabold text-amber-700 tracking-tight mt-1.5 block truncate">
                {formatToman(totalPaidToTodayAll)}{' '}
                <span className="text-xs font-normal text-amber-600/70">ت</span>
              </span>
            </div>

            <div className="px-5 py-4 border-t lg:border-t-0 border-zinc-950/5 bg-zinc-50/40">
              <span className="text-xs font-bold text-zinc-600 block">مانده قابل پرداخت</span>
              <span
                className={`text-xl font-extrabold tracking-tight mt-1.5 block truncate ${activeProjTheme.accentText}`}
              >
                {formatToman(totalNetToTodayAll)}{' '}
                <span className="text-xs font-medium text-zinc-500">تومان</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Toolbar: Single-Row Friday Holiday Checkbox + Card/Row View Switcher */}
      {workers.length > 0 && (
        <section className="bg-zinc-50/80 ring-1 ring-zinc-950/5 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2">
          {dailyWorkers.length > 0 ? (
            <label className="flex items-center gap-2 cursor-pointer select-none min-h-[34px] min-w-0">
              <input
                type="checkbox"
                checked={allDailyHaveFridaysOff}
                ref={(el) => {
                  if (el) el.indeterminate = someDailyHaveFridaysOff;
                }}
                onChange={(e) => onToggleAllDailyFridaysOff?.(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 accent-zinc-950 cursor-pointer shrink-0"
              />
              <div className="flex items-center gap-x-2 min-w-0 truncate">
                <span className="text-xs sm:text-[13px] font-bold text-zinc-950 truncate">
                  <span className="sm:hidden">جمعه‌ها تعطیل</span>
                  <span className="hidden sm:inline">تعطیلی جمعه‌ها (روزمزد)</span>
                </span>
                <span className="text-[11px] text-zinc-500 hidden md:inline truncate">
                  · جمعه‌ها کسر می‌شود و از تقویم هر کارگر قابل تغییر است
                </span>
              </div>
            </label>
          ) : (
            <div className="text-xs font-semibold text-zinc-500 truncate">
              {toPersianDigits(workers.length)} نفر
            </div>
          )}

          {/* Segmented View Switcher */}
          <div className="flex items-center gap-0.5 bg-zinc-200/70 ring-1 ring-inset ring-zinc-950/5 p-0.5 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => onChangeViewMode?.('card')}
              title="نمای کارتی"
              aria-label="نمای کارتی"
              className={`h-7 w-8 sm:h-7.5 sm:w-auto sm:px-2.5 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'card'
                  ? 'bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-950/5'
                  : 'text-zinc-500 hover:text-zinc-950'
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
              className={`h-7 w-8 sm:h-7.5 sm:w-auto sm:px-2.5 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'row'
                  ? 'bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-950/5'
                  : 'text-zinc-500 hover:text-zinc-950'
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
        <div className="bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm font-bold text-zinc-700">
            هنوز هیچ کارگری در «{activeProjectName}» ثبت نشده است.
          </p>
          {onOpenWorkersTab && (
            <button
              type="button"
              onClick={onOpenWorkersTab}
              className="h-10 px-4 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white shadow-xs inset-ring inset-ring-white/10 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>افزودن کارگر به «{activeProjectName}»</span>
            </button>
          )}
        </div>
      ) : null}

      {/* Worker List — Row Ledger View vs Card Grid View */}
      {workers.length > 0 &&
        (viewMode === 'row' ? (
          <div className="bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-xl divide-y divide-zinc-950/5 overflow-hidden">
            {/* Desktop Column Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2.5 bg-zinc-50/80 text-[11px] font-bold text-zinc-500">
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
                <div key={worker.id} className="transition-colors hover:bg-zinc-50/70">
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col lg:grid lg:grid-cols-12 lg:items-center gap-2 sm:gap-3">
                    {/* Col 1 (4 cols): Identity + Role + Friday-Off Toggle */}
                    <div className="lg:col-span-4 flex items-center justify-between lg:justify-start gap-2 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`hidden sm:flex w-9 h-9 rounded-lg border ${avatarTone} font-extrabold text-xs items-center justify-center shrink-0`}
                        >
                          {worker.name.trim().charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-[13px] sm:text-sm font-extrabold text-zinc-950 truncate">
                              {worker.name}
                            </h3>
                            {worker.wage_type === 'daily' && (
                              <label
                                title="تعطیل کردن جمعه‌ها برای این کارگر روزمزد"
                                className={`h-5 sm:h-6 px-1.5 rounded-md ring-1 ring-inset text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer select-none shrink-0 transition-colors ${
                                  worker.fridays_off
                                    ? 'bg-amber-50 ring-amber-600/20 text-amber-800'
                                    : 'bg-zinc-50 ring-zinc-950/10 text-zinc-400 hover:text-zinc-700'
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
                          <div className="text-[11px] text-zinc-500 font-mono-num truncate">
                            {worker.role} · از {formatShamsiDayMonth(acc.startDate)}
                          </div>
                        </div>
                      </div>

                      {/* Mobile Net Payable (visible < lg) */}
                      <div className="lg:hidden text-left font-mono-num shrink-0">
                        <span className="text-[13px] sm:text-sm font-extrabold text-emerald-700">
                          {formatToman(acc.netPayableToToday)}
                          <span className="text-[10px] font-normal text-zinc-400 mr-0.5">ت</span>
                        </span>
                      </div>
                    </div>

                    {/* Mobile Bottom Bar / Desktop Cols 2-4 */}
                    <div className="lg:col-span-2 flex items-center justify-between lg:justify-center gap-1.5 sm:gap-2">
                      {/* Worked Days Stepper */}
                      <div className="flex items-center gap-0.5 sm:gap-1 font-mono-num bg-zinc-50 ring-1 ring-zinc-950/10 rounded-lg p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustWorkedDays(worker, acc, -1)}
                          title="کسر ۱ روز"
                          aria-label="کسر ۱ روز"
                          className="w-7 h-7 rounded-md hover:bg-rose-50 text-rose-600 flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <span className="text-xs font-extrabold text-zinc-950 px-1 min-w-[46px] sm:min-w-[54px] text-center whitespace-nowrap">
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
                          className="w-7 h-7 rounded-md hover:bg-emerald-50 text-emerald-700 flex items-center justify-center transition-colors"
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
                              ? 'bg-zinc-950 text-white'
                              : 'bg-white ring-1 ring-zinc-950/10 text-zinc-600 hover:bg-zinc-50'
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openRangeAndDaysEditor(worker)}
                          title="تنظیم تاریخ"
                          aria-label="تنظیم تاریخ"
                          className="w-8 h-8 rounded-lg bg-white ring-1 ring-zinc-950/10 text-zinc-600 hover:bg-zinc-50 inline-flex items-center justify-center transition-colors"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayslipWorkerId(worker.id)}
                          title="فیش کارکرد"
                          aria-label="فیش کارکرد"
                          className="w-8 h-8 rounded-lg bg-white ring-1 ring-zinc-950/10 text-zinc-600 hover:bg-zinc-50 inline-flex items-center justify-center transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openSettleModal(worker, acc)}
                          className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center whitespace-nowrap transition-colors"
                        >
                          تسویه
                        </button>
                      </div>
                    </div>

                    {/* Desktop Col 3 (3 cols): Financial Display */}
                    <div className="hidden lg:flex lg:col-span-3 flex-col items-end font-mono-num pl-2">
                      <div className="text-sm font-extrabold text-emerald-700">
                        {formatToman(acc.netPayableToToday)}{' '}
                        <span className="text-[11px] font-normal text-zinc-400">تومان</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 flex items-center gap-2">
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
                            ? 'bg-zinc-950 text-white shadow-xs'
                            : 'bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-zinc-600'
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
                        className="w-8 h-8 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-zinc-600 inline-flex items-center justify-center transition-colors"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setPayslipWorkerId(worker.id)}
                        title="مشاهده فیش حقوقی"
                        aria-label="مشاهده فیش حقوقی"
                        className="w-8 h-8 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-zinc-600 inline-flex items-center justify-center transition-colors"
                      >
                        <FileText className="w-4 h-4 text-emerald-600" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openSettleModal(worker, acc)}
                        className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
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
                  className="bg-white ring-1 ring-zinc-950/10 hover:ring-zinc-950/20 shadow-2xs rounded-xl p-3.5 sm:p-5 space-y-3 sm:space-y-4 transition-all"
                >
                  {/* Zone 1: Identity + Prominent Net Payable */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`hidden sm:flex w-10 h-10 rounded-lg border ${avatarTone} font-extrabold text-sm items-center justify-center shrink-0`}
                      >
                        {worker.name.trim().charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-[15px] font-extrabold text-zinc-950 tracking-tight truncate">
                          {worker.name}
                        </h3>
                        <div className="text-[11px] sm:text-xs text-zinc-500 font-mono-num truncate mt-0.5">
                          {worker.role} ·{' '}
                          {worker.wage_type === 'daily'
                            ? `روزمزد ${formatToman(worker.base_wage)} ت`
                            : `ماهانه ${formatToman(worker.base_wage)} ت`}
                        </div>
                      </div>
                    </div>

                    <div className="text-left font-mono-num shrink-0">
                      <span className="text-[10px] sm:text-[11px] text-zinc-500 block leading-tight">
                        مانده پرداخت
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-emerald-700 mt-0.5 block">
                        {formatToman(acc.netPayableToToday)}{' '}
                        <span className="text-[10px] sm:text-[11px] font-normal text-zinc-400">
                          ت
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Zone 2: Date Range + Friday Toggle + Calm Stepper */}
                  <div className="pt-2.5 sm:pt-3.5 border-t border-zinc-950/5 space-y-2.5 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] sm:text-xs font-mono-num text-zinc-500 truncate">
                        <span className="hidden sm:inline text-zinc-400">بازه: </span>
                        <strong className="text-zinc-900">
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
                            className={`h-7 sm:h-7.5 px-2 sm:px-2.5 rounded-lg ring-1 ring-inset text-[10px] sm:text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer select-none transition-colors ${
                              worker.fridays_off
                                ? 'bg-amber-50 ring-amber-600/20 text-amber-800'
                                : 'bg-zinc-50 ring-zinc-950/10 text-zinc-600 hover:bg-zinc-100'
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
                          className="h-7 sm:h-7.5 px-2 sm:px-2.5 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-zinc-700 text-[10px] sm:text-[11px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
                        >
                          <SlidersHorizontal className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-500" />
                          <span className="sm:hidden">تاریخ</span>
                          <span className="hidden sm:inline">تغییر تاریخ</span>
                        </button>
                      </div>
                    </div>

                    {/* Catalyst Worked Days Stepper */}
                    <div className="flex items-center justify-between gap-2 bg-zinc-50/90 ring-1 ring-zinc-950/5 rounded-xl p-1 font-mono-num">
                      <button
                        type="button"
                        onClick={() => handleQuickAdjustWorkedDays(worker, acc, -1)}
                        title="کسر ۱ روز"
                        aria-label="کسر ۱ روز"
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white hover:bg-rose-50 hover:text-rose-600 ring-1 ring-zinc-950/10 shadow-2xs active:scale-95 text-zinc-700 flex items-center justify-center transition-all shrink-0"
                      >
                        <Minus className="w-4 h-4 stroke-[2.5]" />
                      </button>

                      <div className="flex flex-col items-center justify-center min-w-0 px-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-zinc-950 leading-none whitespace-nowrap">
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
                        <span className="mt-1 text-[10px] font-medium text-zinc-500 leading-none whitespace-nowrap truncate max-w-full">
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
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-700 ring-1 ring-zinc-950/10 shadow-2xs active:scale-95 text-zinc-700 flex items-center justify-center transition-all shrink-0"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>

                  {/* Zone 3: Hairline-Divided Financial Breakdown */}
                  <div className="grid grid-cols-3 divide-x divide-x-reverse divide-zinc-950/5 pt-2.5 sm:pt-3.5 border-t border-zinc-950/5 text-center font-mono-num">
                    <div className="px-1">
                      <span className="text-[10px] sm:text-[11px] text-zinc-500 block">
                        دستمزد پایه
                      </span>
                      <span className="text-xs sm:text-[13px] font-bold text-zinc-950 mt-0.5 block truncate">
                        {formatToman(acc.baseEarnedToToday)} ت
                      </span>
                    </div>

                    <div className="px-1">
                      <span className="text-[10px] sm:text-[11px] text-zinc-500 block">
                        اضافه‌کار / مزایا
                      </span>
                      <span className="text-xs sm:text-[13px] font-bold text-sky-700 mt-0.5 block truncate">
                        {formatToman(
                          acc.overtimeEarnedToToday +
                            acc.bonusToToday +
                            (acc.fixedAllowance || 0) +
                            (acc.extraAllowancesToToday || 0)
                        )}{' '}
                        ت
                      </span>
                    </div>

                    <div className="px-1">
                      <span className="text-[10px] sm:text-[11px] text-zinc-500 block">مساعده</span>
                      <span className="text-xs sm:text-[13px] font-bold text-amber-700 mt-0.5 block truncate">
                        {formatToman(acc.paidToToday)} ت
                      </span>
                    </div>
                  </div>

                  {((acc.carryOverBalance || 0) !== 0 || acc.usedWageHistory) && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-num text-zinc-500">
                      {(acc.carryOverBalance || 0) !== 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-semibold">
                          مانده دوره قبل: {acc.carryOverBalance > 0 ? '+' : ''}
                          {formatToman(acc.carryOverBalance)} ت
                        </span>
                      )}
                      {acc.usedWageHistory && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold">
                          محاسبه با تاریخچه نرخ
                        </span>
                      )}
                    </div>
                  )}

                  {/* Zone 4: Single-Row Action Footer */}
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-2.5 sm:pt-3.5 border-t border-zinc-950/5">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenCalendarWorkerId(isCalendarOpen ? null : worker.id)
                        }
                        className={`h-9 px-2.5 sm:px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap ${
                          isCalendarOpen
                            ? 'bg-zinc-950 text-white shadow-xs inset-ring inset-ring-white/10'
                            : 'bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-zinc-700'
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
                        className="h-9 px-2.5 sm:px-3 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-zinc-700 text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="sm:hidden">فیش</span>
                        <span className="hidden sm:inline">فیش کارکرد</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openSettleModal(worker, acc)}
                      className="h-9 px-3 sm:px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 transition-all whitespace-nowrap shrink-0"
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
          className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setEditingWorkerId(null)}
        >
          <div
            className="bg-white ring-1 ring-zinc-950/10 rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
              <span className="w-10 h-1 rounded-full bg-zinc-300" />
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-950/5 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 tracking-tight">
                  تنظیم بازه و کارکرد — {editingWorker.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  تاریخ ورود، خروج و تنظیمات دستی روز و اضافه‌کار
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingWorkerId(null)}
                aria-label="بستن"
                className="w-9 h-9 rounded-lg ring-1 ring-zinc-950/10 bg-white flex items-center justify-center text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Entry Date */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-800">
                  تاریخ ورود (شروع کار)
                </label>
                <div className="grid grid-cols-3 gap-2 font-mono-num">
                  <select
                    value={startJd}
                    onChange={(e) => setStartJd(Number(e.target.value))}
                    className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
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
                    className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
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
                    className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
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
              <div className="pt-3.5 border-t border-zinc-950/5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-800">
                    تاریخ خروج (پایان دوره)
                  </label>
                  <label className="text-xs text-zinc-600 flex items-center gap-2 cursor-pointer min-h-[32px]">
                    <input
                      type="checkbox"
                      checked={hasEndDate}
                      onChange={(e) => setHasEndDate(e.target.checked)}
                      className="w-4 h-4 rounded accent-zinc-950 cursor-pointer"
                    />
                    <span>دارای تاریخ خروج</span>
                  </label>
                </div>

                {hasEndDate ? (
                  <div className="grid grid-cols-3 gap-2 font-mono-num">
                    <select
                      value={endJd}
                      onChange={(e) => setEndJd(Number(e.target.value))}
                      className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
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
                      className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
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
                      className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {toPersianDigits(y)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">مشغول به کار (محاسبه تا امروز)</p>
                )}
              </div>

              {/* Calculation Mode, Friday Option & Manual Overrides */}
              <div className="pt-3.5 border-t border-zinc-950/5 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                    مبنای محاسبه تقویم
                  </label>
                  <select
                    value={calcModeInput}
                    onChange={(e) => setCalcModeInput(e.target.value as CalcMode)}
                    className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs sm:text-sm font-semibold"
                  >
                    <option value="to_today">از تاریخ ورود تا امروز</option>
                    <option value="full_range">کل بازه ورود تا خروج</option>
                  </select>
                </div>

                {editingWorker.wage_type === 'daily' && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 ring-1 ring-amber-600/15 cursor-pointer select-none">
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
                    <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                      روز کارکرد دستی
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={manualWorkedDaysInput}
                      onChange={(e) => setManualWorkedDaysInput(e.target.value)}
                      placeholder={`خودکار (${editingWorkerAccrued.rawCalculatedDays})`}
                      className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-mono-num font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                      ساعت اضافه‌کاری کل
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={manualOvertimeInput}
                      onChange={(e) => setManualOvertimeInput(e.target.value)}
                      placeholder={`خودکار (${editingWorkerAccrued.loggedOvertimeHours})`}
                      className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-mono-num"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-zinc-950/5 flex items-center justify-end gap-2 shrink-0 bg-zinc-50/50">
              <button
                type="button"
                onClick={() => setEditingWorkerId(null)}
                className="h-9.5 px-4 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditor(editingWorker)}
                className="h-9.5 px-5 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white shadow-xs inset-ring inset-ring-white/10 text-xs font-bold transition-colors"
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
          className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setPayslipWorkerId(null)}
        >
          <div
            className="bg-white ring-1 ring-zinc-950/10 rounded-t-3xl sm:rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-zinc-950 text-white p-4 sm:p-5 shrink-0 space-y-3.5">
              <div className="sm:hidden -mt-1.5 pb-0.5 flex justify-center">
                <span className="w-10 h-1 rounded-full bg-white/25" />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center font-extrabold text-sm shrink-0">
                    {selectedPayslipWorker.name.trim().charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">
                      صورت‌حساب کارکرد — {selectedPayslipWorker.name}
                    </h3>
                    <p className="text-xs text-zinc-400 font-mono-num truncate mt-0.5">
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
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
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
                  className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center gap-1.5 transition-all disabled:opacity-60"
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
                  className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
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
                  className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
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
                  className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>HTML</span>
                </button>

                <a
                  href={buildWhatsAppPayslipUrl({
                    worker: selectedPayslipWorker,
                    accrued: selectedPayslipAccrued,
                    payments: selectedPayslipPayments,
                    todayIso,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="ارسال خلاصه فیش در واتساپ"
                  className="h-9 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 ring-1 ring-emerald-400/30 text-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>واتساپ</span>
                </a>

                <button
                  type="button"
                  onClick={async () => {
                    const outcome = await sharePayslipSummary({
                      worker: selectedPayslipWorker,
                      accrued: selectedPayslipAccrued,
                      payments: selectedPayslipPayments,
                      todayIso,
                    });
                    onShowToast?.(
                      outcome === 'shared'
                        ? 'فیش حقوقی به اشتراک گذاشته شد'
                        : 'خلاصه فیش حقوقی در حافظه کپی شد'
                    );
                  }}
                  title="اشتراک‌گذاری یا کپی خلاصه فیش"
                  className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>اشتراک</span>
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto font-mono-num">
              {/* Period & Attendance Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-right">
                <div className="bg-zinc-50 ring-1 ring-zinc-950/5 rounded-xl p-2.5">
                  <span className="text-[10px] text-zinc-500 block">تاریخ ورود</span>
                  <span className="text-xs font-extrabold text-zinc-950 mt-0.5 block">
                    {formatShamsiDayMonth(selectedPayslipAccrued.startDate)}
                  </span>
                </div>

                <div className="bg-zinc-50 ring-1 ring-zinc-950/5 rounded-xl p-2.5">
                  <span className="text-[10px] text-zinc-500 block">پایان دوره</span>
                  <span className="text-xs font-extrabold text-zinc-950 mt-0.5 block">
                    {selectedPayslipAccrued.endDate
                      ? formatShamsiDayMonth(selectedPayslipAccrued.endDate)
                      : 'مشغول به کار'}
                  </span>
                </div>

                <div className="bg-emerald-50/70 ring-1 ring-emerald-600/15 rounded-xl p-2.5">
                  <span className="text-[10px] text-emerald-800 block">کارکرد خالص</span>
                  <span className="text-xs sm:text-sm font-extrabold text-emerald-800 mt-0.5 block">
                    {toPersianDigits(selectedPayslipAccrued.effectiveDaysToToday)} روز
                  </span>
                </div>

                <div className="bg-sky-50/70 ring-1 ring-sky-600/15 rounded-xl p-2.5">
                  <span className="text-[10px] text-sky-800 block">اضافه‌کاری</span>
                  <span className="text-xs sm:text-sm font-extrabold text-sky-800 mt-0.5 block">
                    {toPersianDigits(selectedPayslipAccrued.effectiveOvertimeHours)} ساعت
                  </span>
                </div>
              </div>

              {selectedPayslipAccrued.remainingDaysToWork !== null && (
                <div className="bg-amber-50/70 ring-1 ring-amber-600/15 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs">
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
                  <div className="bg-zinc-50/80 ring-1 ring-zinc-950/5 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold text-zinc-950">
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
                            : 'bg-white border-zinc-200 text-zinc-400';
                        const badgeCls =
                          d.state === 'off_red'
                            ? 'bg-rose-100 text-rose-700'
                            : d.state === 'worked'
                            ? 'bg-emerald-100/80 text-emerald-800'
                            : 'bg-zinc-100 text-zinc-500';
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
              <div className="bg-zinc-50/80 ring-1 ring-zinc-950/5 rounded-xl p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">دستمزد پایه کارکرد</span>
                  <span className="font-bold text-zinc-950">
                    {formatToman(selectedPayslipAccrued.baseEarnedToToday)} تومان
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">
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

                {((selectedPayslipAccrued.fixedAllowance || 0) +
                  (selectedPayslipAccrued.extraAllowancesToToday || 0)) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sky-700">
                      مزایا ({selectedPayslipWorker.fixed_allowance_label || 'مزایا و پاداش'})
                    </span>
                    <span className="font-bold text-sky-700">
                      +
                      {formatToman(
                        (selectedPayslipAccrued.fixedAllowance || 0) +
                          (selectedPayslipAccrued.extraAllowancesToToday || 0)
                      )}{' '}
                      تومان
                    </span>
                  </div>
                )}

                {((selectedPayslipAccrued.fixedDeduction || 0) +
                  (selectedPayslipAccrued.deductionsToToday || 0)) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700">کسورات / خسارت</span>
                    <span className="font-bold text-rose-700">
                      -
                      {formatToman(
                        (selectedPayslipAccrued.fixedDeduction || 0) +
                          (selectedPayslipAccrued.deductionsToToday || 0)
                      )}{' '}
                      تومان
                    </span>
                  </div>
                )}

                {(selectedPayslipAccrued.carryOverBalance || 0) !== 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600">مانده انتقالی از دوره قبل</span>
                    <span className="font-bold text-zinc-900">
                      {selectedPayslipAccrued.carryOverBalance > 0 ? '+' : ''}
                      {formatToman(selectedPayslipAccrued.carryOverBalance)} تومان
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2.5 border-t border-zinc-950/10">
                  <span className="font-bold text-zinc-800">جمع کل کارکرد</span>
                  <span className="font-extrabold text-zinc-950">
                    {formatToman(selectedPayslipAccrued.grossEarnedToToday)} تومان
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-amber-800">کسر مساعده و دریافتی</span>
                  <span className="font-bold text-amber-700">
                    {formatToman(selectedPayslipAccrued.paidToToday)} تومان
                  </span>
                </div>

                <div className="pt-2.5 border-t border-zinc-950/10 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-extrabold text-zinc-950">
                    مانده قابل پرداخت
                  </span>
                  <span className="text-base font-extrabold text-emerald-700">
                    {formatToman(selectedPayslipAccrued.netPayableToToday)}{' '}
                    <span className="text-xs font-normal text-zinc-500">تومان</span>
                  </span>
                </div>
              </div>

              {/* Payments History List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-zinc-900">
                    ریز مساعده‌ها و پرداختی‌ها
                  </h4>
                  <span className="text-xs text-zinc-500">
                    {toPersianDigits(selectedPayslipPayments.length)} مورد
                  </span>
                </div>

                {selectedPayslipPayments.length === 0 ? (
                  <div className="bg-zinc-50 ring-1 ring-zinc-950/5 rounded-xl p-3.5 text-center text-xs text-zinc-500">
                    هیچ پرداختی برای این کارگر ثبت نشده است.
                  </div>
                ) : (
                  <div className="ring-1 ring-zinc-950/10 rounded-xl divide-y divide-zinc-950/5 max-h-44 overflow-y-auto">
                    {selectedPayslipPayments.map((p) => {
                      const typeLabel =
                        p.payment_type === 'advance'
                          ? 'مساعده'
                          : p.payment_type === 'salary'
                          ? 'تسویه حقوق'
                          : p.payment_type === 'allowance'
                          ? 'مزایا / پاداش'
                          : 'کسر / جریمه';
                      const typeColor =
                        p.payment_type === 'advance'
                          ? 'text-amber-700'
                          : p.payment_type === 'salary'
                          ? 'text-emerald-700'
                          : p.payment_type === 'allowance'
                          ? 'text-sky-700'
                          : 'text-rose-700';

                      return (
                        <div
                          key={p.id}
                          className={`px-3 py-2.5 flex items-center justify-between gap-2 ${
                            p.period_archived ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold ${typeColor}`}>{typeLabel}</span>
                              <span className="text-zinc-500">
                                · {formatShamsiShort(p.payment_date)}
                              </span>
                              {p.period_archived === 1 && (
                                <span className="text-[10px] text-zinc-400">· دوره قبل</span>
                              )}
                            </div>
                            {p.note && (
                              <p className="text-[11px] text-zinc-500 truncate mt-0.5">{p.note}</p>
                            )}
                          </div>

                          <div className="text-left shrink-0 text-xs font-extrabold text-zinc-950">
                            {formatToman(p.amount)}{' '}
                            <span className="text-[10px] font-normal text-zinc-400">ت</span>
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
          className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
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
            className="bg-white ring-1 ring-zinc-950/10 rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-zinc-950 text-white px-5 py-4 flex items-center justify-between gap-2 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                  ثبت مساعده و تسویه — {settleModalWorker.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5 font-mono-num">
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
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto font-mono-num">
              {/* Financial Summary Strip */}
              <div className="grid grid-cols-3 divide-x divide-x-reverse divide-zinc-950/5 text-center bg-zinc-50 ring-1 ring-zinc-950/5 rounded-xl py-2.5">
                <div className="px-1">
                  <span className="text-[10px] text-zinc-500 block">کل کارکرد</span>
                  <span className="text-xs font-extrabold text-zinc-950 mt-0.5 block">
                    {formatToman(settleModalAccrued.grossEarnedToToday)} ت
                  </span>
                </div>
                <div className="px-1">
                  <span className="text-[10px] text-zinc-500 block">دریافتی قبلی</span>
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
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                  نوع تراکنش
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleType('advance')}
                    className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                      settleType === 'advance'
                        ? 'bg-amber-600 text-white shadow-xs inset-ring inset-ring-white/15'
                        : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100'
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
                    className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                      settleType === 'salary'
                        ? 'bg-emerald-600 text-white shadow-xs inset-ring inset-ring-white/15'
                        : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100'
                    }`}
                  >
                    تسویه کارکرد
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleType('deduction')}
                    className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                      settleType === 'deduction'
                        ? 'bg-rose-600 text-white shadow-xs inset-ring inset-ring-white/15'
                        : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100'
                    }`}
                  >
                    کسر / خسارت
                  </button>
                </div>
              </div>

              {/* Date Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-700 inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
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
                    className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
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
                    className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
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
                    className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
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
                  <label className="text-xs font-bold text-zinc-700">مبلغ (تومان) *</label>
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
                  className="w-full h-10.5 px-3.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-bold hover:border-zinc-950/25 focus:border-zinc-950"
                  required
                />

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {settleModalAccrued.netPayableToToday > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettleAmountInput(String(settleModalAccrued.netPayableToToday))
                      }
                      className="h-8 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-600/20 text-xs font-bold transition-colors"
                    >
                      کل مانده ({formatToman(settleModalAccrued.netPayableToToday)} ت)
                    </button>
                  )}
                  {[500000, 1000000, 2000000, 5000000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSettleAmountInput(String(preset))}
                      className="h-8 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 text-xs font-semibold transition-colors"
                    >
                      {formatToman(preset)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Note */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                  توضیحات (کارت به کارت، نقدی، شماره پیگیری...)
                </label>
                <input
                  type="text"
                  value={settleNoteInput}
                  onChange={(e) => setSettleNoteInput(e.target.value)}
                  placeholder="مثلاً: واریز کارت به کارت علی‌الحساب"
                  className="w-full h-10 px-3.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs sm:text-sm hover:border-zinc-950/25 focus:border-zinc-950"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-950/5">
                <button
                  type="button"
                  onClick={() => setSettleModalWorkerId(null)}
                  className="h-9.5 px-4 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="h-9.5 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {settleType === 'advance'
                      ? 'ثبت مساعده'
                      : settleType === 'salary'
                      ? 'ثبت تسویه کارکرد'
                      : settleType === 'allowance'
                      ? 'ثبت مزایا'
                      : 'ثبت کسر از حساب'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal 4: Period Close (Carry-Over Balance) & Month Lock */}
      {showPeriodModal && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setShowPeriodModal(false)}
        >
          <div
            className="bg-white ring-1 ring-zinc-950/10 rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
              <span className="w-10 h-1 rounded-full bg-zinc-300" />
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-950/5 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 tracking-tight">
                  بستن دوره و قفل ماه — {activeProjectName}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  انتقال خودکار مانده‌ها به دوره جدید یا قفل کردن تغییرات ماه
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPeriodModal(false)}
                aria-label="بستن"
                className="w-9 h-9 rounded-lg ring-1 ring-zinc-950/10 bg-white flex items-center justify-center text-zinc-500 hover:bg-zinc-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Segmented Switcher */}
              <div className="grid grid-cols-2 bg-zinc-100 ring-1 ring-inset ring-zinc-950/5 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setPeriodModalTab('close')}
                  className={`h-9 rounded-lg text-xs font-bold transition-colors ${
                    periodModalTab === 'close'
                      ? 'bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-950/5'
                      : 'text-zinc-600'
                  }`}
                >
                  بستن دوره و انتقال مانده
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodModalTab('lock')}
                  className={`h-9 rounded-lg text-xs font-bold transition-colors ${
                    periodModalTab === 'lock'
                      ? 'bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-950/5'
                      : 'text-zinc-600'
                  }`}
                >
                  قفل / بازگشایی ماه
                </button>
              </div>

              {periodModalTab === 'close' ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-amber-50/80 ring-1 ring-inset ring-amber-600/20 text-xs text-amber-950 leading-relaxed space-y-1.5">
                    <div className="font-extrabold">عملکرد بستن دوره چیست؟</div>
                    <p>
                      مانده قابل پرداخت فعلی هر کارگر (جمع کل:{' '}
                      <strong className="font-mono-num">
                        {formatToman(totalNetToTodayAll)} تومان
                      </strong>
                      ) به فیلد <strong>مانده دوره قبل</strong> منتقل می‌شود، تراکنش‌های دوره قبل
                      بایگانی می‌شوند و تاریخ شروع کارکرد از تاریخ جدید محاسبه می‌گردد.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-zinc-700">
                      تاریخ شروع دوره جدید
                    </label>
                    <div className="grid grid-cols-3 gap-2 font-mono-num">
                      <select
                        value={closeNextJd}
                        onChange={(e) => setCloseNextJd(Number(e.target.value))}
                        className="h-10 px-2 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
                      >
                        {Array.from(
                          { length: getShamsiMonthLength(closeNextJy, closeNextJm) },
                          (_, i) => i + 1
                        ).map((d) => (
                          <option key={d} value={d}>
                            روز {toPersianDigits(d)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={closeNextJm}
                        onChange={(e) => {
                          const nextM = Number(e.target.value);
                          setCloseNextJm(nextM);
                          setCloseNextJd((prev) =>
                            Math.min(prev, getShamsiMonthLength(closeNextJy, nextM))
                          );
                        }}
                        className="h-10 px-2 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
                      >
                        {PERSIAN_MONTHS.map((m, idx) => (
                          <option key={m} value={idx + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={closeNextJy}
                        onChange={(e) => {
                          const nextY = Number(e.target.value);
                          setCloseNextJy(nextY);
                          setCloseNextJd((prev) =>
                            Math.min(prev, getShamsiMonthLength(nextY, closeNextJm))
                          );
                        }}
                        className="h-10 px-2 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
                      >
                        {yearOptions.map((y) => (
                          <option key={y} value={y}>
                            {toPersianDigits(y)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={lockCurrentOnClose}
                      onChange={(e) => setLockCurrentOnClose(e.target.checked)}
                      className="w-4 h-4 rounded accent-zinc-950"
                    />
                    <span>
                      قفل کردن ماه {PERSIAN_MONTHS[todayShamsi.jm - 1]}{' '}
                      {toPersianDigits(todayShamsi.jy)} پس از بستن دوره
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={processingPeriodAction || !onClosePeriod || workers.length === 0}
                    onClick={async () => {
                      if (!onClosePeriod) return;
                      setProcessingPeriodAction(true);
                      try {
                        const maxD = getShamsiMonthLength(closeNextJy, closeNextJm);
                        const nextStartIso = shamsiToIso(
                          closeNextJy,
                          closeNextJm,
                          Math.min(closeNextJd, maxD)
                        );
                        await onClosePeriod({
                          project_id: selectedProjectId,
                          next_start_date: nextStartIso,
                          lock_current_month: lockCurrentOnClose,
                          shamsi_year: todayShamsi.jy,
                          shamsi_month: todayShamsi.jm,
                        });
                        setShowPeriodModal(false);
                      } finally {
                        setProcessingPeriodAction(false);
                      }
                    }}
                    className="w-full h-10.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white shadow-xs inset-ring inset-ring-white/10 text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    <Archive className="w-4 h-4 text-emerald-400" />
                    <span>
                      {processingPeriodAction
                        ? 'در حال بستن دوره...'
                        : 'تایید بستن دوره و انتقال مانده‌ها'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 font-mono-num">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">ماه</label>
                      <select
                        value={lockJm}
                        onChange={(e) => setLockJm(Number(e.target.value))}
                        className="w-full h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
                      >
                        {PERSIAN_MONTHS.map((m, idx) => (
                          <option key={m} value={idx + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">سال</label>
                      <select
                        value={lockJy}
                        onChange={(e) => setLockJy(Number(e.target.value))}
                        className="w-full h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
                      >
                        {yearOptions.map((y) => (
                          <option key={y} value={y}>
                            {toPersianDigits(y)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={processingPeriodAction || !onToggleMonthLock}
                    onClick={async () => {
                      if (!onToggleMonthLock) return;
                      setProcessingPeriodAction(true);
                      try {
                        await onToggleMonthLock({
                          project_id: currentProjectIdNumeric,
                          shamsi_year: lockJy,
                          shamsi_month: lockJm,
                          locked: !isTargetLockMonthLocked,
                        });
                      } finally {
                        setProcessingPeriodAction(false);
                      }
                    }}
                    className={`w-full h-10.5 rounded-lg text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
                      isTargetLockMonthLocked
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    {isTargetLockMonthLocked ? (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span>
                          باز کردن قفل {PERSIAN_MONTHS[lockJm - 1]} {toPersianDigits(lockJy)}
                        </span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>
                          قفل کردن {PERSIAN_MONTHS[lockJm - 1]} {toPersianDigits(lockJy)}
                        </span>
                      </>
                    )}
                  </button>

                  {lockedMonths.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-zinc-950/5">
                      <div className="text-xs font-bold text-zinc-700">ماه‌های قفل‌شده فعلی</div>
                      <div className="ring-1 ring-zinc-950/10 rounded-xl divide-y divide-zinc-950/5 max-h-44 overflow-y-auto">
                        {lockedMonths.map((lm) => (
                          <div
                            key={lm.id}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono-num"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="font-bold text-zinc-900">
                                {PERSIAN_MONTHS[lm.shamsi_month - 1]} {toPersianDigits(lm.shamsi_year)}
                              </span>
                              <span className="text-[11px] text-zinc-400">
                                ({lm.project_id === 0 ? 'همه پروژه‌ها' : 'پروژه'})
                              </span>
                            </div>
                            {onToggleMonthLock && (
                              <button
                                type="button"
                                onClick={() =>
                                  onToggleMonthLock({
                                    project_id: lm.project_id,
                                    shamsi_year: lm.shamsi_year,
                                    shamsi_month: lm.shamsi_month,
                                    locked: false,
                                  })
                                }
                                className="h-7 px-2 rounded-md bg-zinc-100 hover:bg-zinc-200 text-[11px] font-bold text-zinc-700"
                              >
                                باز کردن
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
