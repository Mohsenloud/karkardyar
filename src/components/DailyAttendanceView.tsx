import React, { useState } from 'react';
import {
  Check,
  Clock,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  CheckCheck,
  SlidersHorizontal,
  RotateCcw,
  UserPlus,
  Edit3,
  LayoutGrid,
  LayoutList,
  X,
} from 'lucide-react';
import { AccruedToTodaySummary, AttendanceStatus, DailyLog, Worker } from '../types';
import {
  PERSIAN_MONTHS,
  formatShamsiDayMonth,
  formatShamsiFull,
  formatToman,
  getDaysWindow,
  getShamsiMonthLength,
  getShamsiYearOptions,
  isFridayIso,
  isoToShamsi,
  shamsiToIso,
  toPersianDigits,
} from '../utils/jalali';

const AVATAR_TONES = [
  'bg-emerald-50 text-emerald-800 border-emerald-200/70',
  'bg-indigo-50 text-indigo-800 border-indigo-200/70',
  'bg-amber-50 text-amber-800 border-amber-200/70',
  'bg-violet-50 text-violet-800 border-violet-200/70',
  'bg-cyan-50 text-cyan-800 border-cyan-200/70',
];

interface DailyAttendanceViewProps {
  todayIso: string;
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  workers: Worker[];
  dailyLogs: DailyLog[];
  accruedSummaries: AccruedToTodaySummary[];
  viewMode?: 'card' | 'row';
  onChangeViewMode?: (mode: 'card' | 'row') => void;
  onSaveDailyLog: (payload: {
    worker_id: number;
    work_date: string;
    status: AttendanceStatus | 'clear';
    days_equiv?: number;
    overtime_hours?: number;
    bonus_amount?: number;
    project_name?: string;
    note?: string;
  }) => void;
  onBulkMarkPresent: (projectName: string) => void;
  onOpenNewWorker: () => void;
  onOpenAccruedSheet: () => void;
}

export const DailyAttendanceView: React.FC<DailyAttendanceViewProps> = ({
  todayIso,
  selectedDate,
  onSelectDate,
  workers,
  dailyLogs,
  accruedSummaries,
  viewMode = 'card',
  onChangeViewMode,
  onSaveDailyLog,
  onBulkMarkPresent,
  onOpenNewWorker,
  onOpenAccruedSheet,
}) => {
  const activeWorkers = workers.filter((w) => w.active === 1);
  const daysStrip = getDaysWindow(selectedDate, 3);
  const currentShamsi = isoToShamsi(selectedDate);
  const todayShamsi = isoToShamsi(todayIso);
  const isSelectedDateFriday = isFridayIso(selectedDate);

  const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);
  const [showDateJump, setShowDateJump] = useState(false);
  const [jumpYear, setJumpYear] = useState(currentShamsi.jy);
  const [jumpMonth, setJumpMonth] = useState(currentShamsi.jm);
  const [jumpDay, setJumpDay] = useState(currentShamsi.jd);

  const [detailBonus, setDetailBonus] = useState<string>('');
  const [detailProject, setDetailProject] = useState<string>('');
  const [detailNote, setDetailNote] = useState<string>('');
  const [detailCustomDays, setDetailCustomDays] = useState<string>('1');

  const jumpYearOptions = getShamsiYearOptions(todayShamsi.jy, [jumpYear]);

  const getWorkerLog = (workerId: number): DailyLog | undefined =>
    dailyLogs.find((l) => l.worker_id === workerId);

  const handleToggleExpand = (worker: Worker) => {
    if (expandedWorkerId === worker.id) {
      setExpandedWorkerId(null);
      return;
    }
    const log = getWorkerLog(worker.id);
    setDetailBonus(log?.bonus_amount ? String(log.bonus_amount) : '');
    setDetailProject(log?.project_name || worker.project_name || '');
    setDetailNote(log?.note || '');
    setDetailCustomDays(log ? String(log.days_equiv) : '1');
    setExpandedWorkerId(worker.id);
  };

  const handleQuickStatus = (worker: Worker, status: AttendanceStatus) => {
    const existing = getWorkerLog(worker.id);
    const daysEquiv =
      status === 'present' || status === 'paid_leave'
        ? 1
        : status === 'half'
        ? 0.5
        : 0;

    onSaveDailyLog({
      worker_id: worker.id,
      work_date: selectedDate,
      status,
      days_equiv: daysEquiv,
      overtime_hours: existing ? existing.overtime_hours : 0,
      bonus_amount: existing ? existing.bonus_amount : 0,
      project_name: existing?.project_name || worker.project_name || '',
      note: existing?.note || '',
    });
  };

  const handleOvertimeDelta = (worker: Worker, delta: number) => {
    const existing = getWorkerLog(worker.id);
    const currentOt = existing ? Number(existing.overtime_hours || 0) : 0;
    const nextOt = Math.max(0, Math.round(currentOt + delta));
    const status: AttendanceStatus = existing ? existing.status : 'present';
    const daysEquiv = existing ? existing.days_equiv : status === 'present' ? 1 : 0;

    onSaveDailyLog({
      worker_id: worker.id,
      work_date: selectedDate,
      status,
      days_equiv: daysEquiv,
      overtime_hours: nextOt,
      bonus_amount: existing ? existing.bonus_amount : 0,
      project_name: existing?.project_name || worker.project_name || '',
      note: existing?.note || '',
    });
  };

  const handleSaveDetails = (worker: Worker) => {
    const existing = getWorkerLog(worker.id);
    const status: AttendanceStatus = existing ? existing.status : 'present';
    const parsedDays = parseFloat(detailCustomDays);
    onSaveDailyLog({
      worker_id: worker.id,
      work_date: selectedDate,
      status,
      days_equiv: Number.isFinite(parsedDays) && parsedDays >= 0 ? parsedDays : 1,
      overtime_hours: existing ? existing.overtime_hours : 0,
      bonus_amount: Number(detailBonus) || 0,
      project_name: detailProject.trim(),
      note: detailNote.trim(),
    });
    setExpandedWorkerId(null);
  };

  const shiftDay = (deltaDays: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate()
    ).padStart(2, '0')}`;
    onSelectDate(iso);
  };

  const expandedWorker = activeWorkers.find((w) => w.id === expandedWorkerId);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Top Date Bar & 7-Day Scroller */}
      <section className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 sm:gap-3">
          {/* Row 1 on mobile: Date Navigator (centered & tappable to jump) */}
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all shrink-0"
              title="روز قبل"
              aria-label="روز قبل"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                const sh = isoToShamsi(selectedDate);
                setJumpYear(sh.jy);
                setJumpMonth(sh.jm);
                setJumpDay(sh.jd);
                setShowDateJump(true);
              }}
              className="px-2 py-1 rounded-xl hover:bg-slate-50 transition-colors text-center sm:text-right min-w-0"
              title="تغییر تاریخ"
            >
              <div className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
                <h2 className="text-[13px] sm:text-base font-extrabold text-slate-900">
                  {formatShamsiFull(selectedDate)}
                </h2>
                {selectedDate === todayIso && (
                  <span className="text-[11px] sm:text-xs font-bold text-emerald-700">· امروز</span>
                )}
                {isSelectedDateFriday && (
                  <span className="text-[11px] sm:text-xs font-bold text-amber-700">· جمعه</span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => shiftDay(1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all shrink-0"
              title="روز بعد"
              aria-label="روز بعد"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Row 2 on mobile: Compact Actions + View Switcher (Single non-wrapping row) */}
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onBulkMarkPresent('')}
                disabled={activeWorkers.length === 0}
                className="h-9 px-3 sm:px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-all whitespace-nowrap disabled:opacity-50"
              >
                <CheckCheck className="w-4 h-4" />
                <span>حضور همه</span>
              </button>

              {selectedDate !== todayIso && (
                <button
                  type="button"
                  onClick={() => onSelectDate(todayIso)}
                  className="h-9 px-2.5 sm:px-3 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors whitespace-nowrap"
                >
                  امروز
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const sh = isoToShamsi(selectedDate);
                  setJumpYear(sh.jy);
                  setJumpMonth(sh.jm);
                  setJumpDay(sh.jd);
                  setShowDateJump(true);
                }}
                title="تغییر تاریخ"
                aria-label="تغییر تاریخ"
                className="h-9 w-9 sm:w-auto sm:px-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Calendar className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-500" />
                <span className="hidden sm:inline">تغییر تاریخ</span>
              </button>

              {/* View Mode Toggle (icon-only on mobile, icon+label on sm:) */}
              <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => onChangeViewMode?.('card')}
                  aria-label="نمای کارتی"
                  className={`h-7 w-8 sm:w-auto sm:px-2.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                    viewMode === 'card'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="نمای کارتی"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">کارتی</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeViewMode?.('row')}
                  aria-label="نمای ردیفی"
                  className={`h-7 w-8 sm:w-auto sm:px-2.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                    viewMode === 'row'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="نمای ردیفی"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ردیفی</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 7-Day Touch Strip (Edge-to-edge 7-col grid on mobile, centered strip on sm:) */}
        <div className="grid grid-cols-7 sm:flex sm:items-center sm:justify-center gap-1 sm:gap-2 pt-2.5 border-t border-slate-100">
          {daysStrip.map((item) => {
            const isSelected = item.iso === selectedDate;
            const isToday = item.iso === todayIso;
            return (
              <button
                key={item.iso}
                type="button"
                onClick={() => onSelectDate(item.iso)}
                className={`sm:min-w-[60px] h-12 sm:h-14 rounded-xl flex flex-col items-center justify-center transition-colors border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900'
                    : isToday
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-slate-50/70 text-slate-700 border-slate-200/80 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`text-[9px] sm:text-[10px] font-medium leading-none truncate max-w-full px-0.5 ${
                    isSelected ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {item.weekdayShort}
                </span>
                <span className="text-xs sm:text-sm font-extrabold font-mono-num mt-1 sm:mt-1.5 leading-none">
                  {toPersianDigits(item.jd)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Workers Attendance List */}
      {activeWorkers.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-600">
            هنوز هیچ کارگر فعالی در این پروژه ثبت نشده است.
          </p>
          <button
            type="button"
            onClick={onOpenNewWorker}
            className="h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>افزودن اولین کارگر</span>
          </button>
        </div>
      ) : viewMode === 'row' ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {activeWorkers.map((worker, index) => {
            const avatarTone = AVATAR_TONES[index % AVATAR_TONES.length];
            const log = getWorkerLog(worker.id);

            const isWithinAutoActiveRange =
              worker.auto_count_days !== 0 &&
              selectedDate >= (worker.start_date || '') &&
              selectedDate <= todayIso &&
              (!worker.end_date || selectedDate <= worker.end_date);

            const isAutoFridayHoliday =
              isSelectedDateFriday &&
              worker.wage_type === 'daily' &&
              Boolean(worker.fridays_off) &&
              !log;

            const currentStatus: AttendanceStatus | undefined = log?.status
              ? log.status
              : isAutoFridayHoliday
              ? 'absent'
              : isWithinAutoActiveRange
              ? 'present'
              : undefined;
            const currentOvertime = log ? Number(log.overtime_hours || 0) : 0;

            return (
              <div
                key={worker.id}
                className="px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-2 lg:gap-4"
              >
                {/* Top Line on mobile / Left on desktop: Identity + (Mobile Overtime & Note) */}
                <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
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
                        <span className="text-[11px] sm:text-xs text-slate-400 truncate shrink-0">
                          · {worker.role}
                        </span>
                      </div>
                      {(isAutoFridayHoliday ||
                        (worker.manual_worked_days !== null &&
                          worker.manual_worked_days !== undefined)) && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 mt-0.5">
                          {isAutoFridayHoliday && <span>جمعه تعطیل</span>}
                          {worker.manual_worked_days !== null &&
                            worker.manual_worked_days !== undefined && <span>روز دستی</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mobile Overtime + Note (top-left of row, zero crowding with status bar) */}
                  <div className="flex lg:hidden items-center gap-1.5 font-mono-num shrink-0">
                    <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleOvertimeDelta(worker, -1)}
                        disabled={currentOvertime <= 0}
                        title="کسر ۱ ساعت اضافه‌کار"
                        aria-label="کسر ۱ ساعت اضافه‌کار"
                        className="h-7 w-7 rounded-md hover:bg-rose-50 flex items-center justify-center text-rose-600 disabled:opacity-30 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        title="ساعت اضافه‌کار"
                        className="text-[11px] font-extrabold text-slate-800 px-1 min-w-[32px] text-center whitespace-nowrap"
                      >
                        {toPersianDigits(currentOvertime)}س
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOvertimeDelta(worker, 1)}
                        title="افزودن ۱ ساعت اضافه‌کار"
                        aria-label="افزودن ۱ ساعت اضافه‌کار"
                        className="h-7 w-7 rounded-md hover:bg-emerald-50 flex items-center justify-center text-emerald-700 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleExpand(worker)}
                      title="یادداشت و پاداش روزانه"
                      aria-label="یادداشت و پاداش روزانه"
                      className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors ${
                        log?.note || log?.bonus_amount
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Line 2 on mobile (full-width 3-col bar) / Inline controls on desktop */}
                <div className="flex items-center justify-between lg:justify-end gap-2.5">
                  <div className="grid grid-cols-3 w-full lg:w-auto lg:inline-flex items-center bg-slate-100 p-1 rounded-xl gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickStatus(worker, 'present')}
                      className={`h-8.5 lg:h-8 px-2.5 lg:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                        currentStatus === 'present'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>حاضر</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickStatus(worker, 'paid_leave')}
                      className={`h-8.5 lg:h-8 px-2.5 lg:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                        currentStatus === 'paid_leave'
                          ? 'bg-sky-700 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>مرخصی</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickStatus(worker, 'absent')}
                      className={`h-8.5 lg:h-8 px-2.5 lg:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                        currentStatus === 'absent'
                          ? isAutoFridayHoliday
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-rose-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>{isAutoFridayHoliday ? 'تعطیل' : 'غایب'}</span>
                    </button>
                  </div>

                  {/* Desktop Overtime Stepper + Note */}
                  <div className="hidden lg:flex items-center gap-2 font-mono-num shrink-0">
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => handleOvertimeDelta(worker, -1)}
                        disabled={currentOvertime <= 0}
                        title="کسر ۱ ساعت اضافه‌کار"
                        aria-label="کسر ۱ ساعت اضافه‌کار"
                        className="h-8 w-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-rose-600 disabled:opacity-30 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        title="ساعت اضافه‌کار"
                        className="text-xs font-extrabold text-slate-800 px-1.5 min-w-[40px] text-center whitespace-nowrap"
                      >
                        {toPersianDigits(currentOvertime)} س
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOvertimeDelta(worker, 1)}
                        title="افزودن ۱ ساعت اضافه‌کار"
                        aria-label="افزودن ۱ ساعت اضافه‌کار"
                        className="h-8 w-8 rounded-lg hover:bg-emerald-50 flex items-center justify-center text-emerald-700 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleExpand(worker)}
                      title="یادداشت و پاداش روزانه"
                      aria-label="یادداشت و پاداش روزانه"
                      className={`w-9 h-9 rounded-xl inline-flex items-center justify-center transition-colors ${
                        log?.note || log?.bonus_amount
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">
          {activeWorkers.map((worker, index) => {
            const avatarTone = AVATAR_TONES[index % AVATAR_TONES.length];
            const log = getWorkerLog(worker.id);
            const accrued = accruedSummaries.find((a) => a.workerId === worker.id);

            const isWithinAutoActiveRange =
              worker.auto_count_days !== 0 &&
              selectedDate >= (worker.start_date || '') &&
              selectedDate <= todayIso &&
              (!worker.end_date || selectedDate <= worker.end_date);

            const isAutoFridayHoliday =
              isSelectedDateFriday &&
              worker.wage_type === 'daily' &&
              Boolean(worker.fridays_off) &&
              !log;

            const currentStatus: AttendanceStatus | undefined = log?.status
              ? log.status
              : isAutoFridayHoliday
              ? 'absent'
              : isWithinAutoActiveRange
              ? 'present'
              : undefined;
            const currentOvertime = log ? Number(log.overtime_hours || 0) : 0;

            return (
              <div
                key={worker.id}
                className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-3.5 sm:p-5 space-y-3 sm:space-y-4 transition-colors"
              >
                {/* Worker Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`hidden sm:flex w-10 h-10 rounded-xl border ${avatarTone} font-extrabold text-sm items-center justify-center shrink-0`}
                    >
                      {worker.name.trim().charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                          {worker.name}
                        </h3>
                        {isAutoFridayHoliday && (
                          <span className="text-[11px] font-bold text-amber-700 shrink-0">
                            · جمعه تعطیل
                          </span>
                        )}
                        {worker.manual_worked_days !== null &&
                          worker.manual_worked_days !== undefined && (
                            <span
                              title="تعداد روز کارکرد این کارگر به‌صورت دستی تنظیم شده و تا زمان بازنشانی از تغییرات حضور روزانه تبعیت نمی‌کند"
                              className="text-[11px] font-bold text-amber-700 shrink-0"
                            >
                              · روز دستی
                            </span>
                          )}
                      </div>
                      <div className="text-[11px] sm:text-xs text-slate-500 font-mono-num truncate mt-0.5">
                        {worker.role} ·{' '}
                        {worker.wage_type === 'daily'
                          ? `روزمزد ${formatToman(worker.base_wage)} ت`
                          : `ماهانه ${formatToman(worker.base_wage)} ت`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {log && (
                      <button
                        type="button"
                        onClick={() =>
                          onSaveDailyLog({
                            worker_id: worker.id,
                            work_date: selectedDate,
                            status: 'clear',
                          })
                        }
                        title="بازنشانی روز"
                        aria-label="بازنشانی روز"
                        className="h-8.5 w-8.5 sm:h-9 sm:w-9 rounded-xl bg-slate-100 text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(worker)}
                      title="یادداشت و پاداش روزانه"
                      aria-label="یادداشت و پاداش روزانه"
                      className={`h-8.5 w-8.5 sm:h-9 sm:w-auto sm:px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        log?.note || log?.bonus_amount
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">یادداشت</span>
                    </button>
                  </div>
                </div>

                {/* Attendance 3-Way Segmented Control */}
                <div className="grid grid-cols-3 gap-1 sm:gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleQuickStatus(worker, 'present')}
                    className={`min-h-[38px] sm:min-h-[36px] px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                      currentStatus === 'present'
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {currentStatus === 'present' && <Check className="w-3.5 h-3.5 shrink-0" />}
                    <span className="sm:hidden">حاضر</span>
                    <span className="hidden sm:inline">حاضر (۱)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickStatus(worker, 'paid_leave')}
                    className={`min-h-[38px] sm:min-h-[36px] px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                      currentStatus === 'paid_leave'
                        ? 'bg-sky-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>مرخصی</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickStatus(worker, 'absent')}
                    className={`min-h-[38px] sm:min-h-[36px] px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                      currentStatus === 'absent'
                        ? isAutoFridayHoliday
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-rose-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="sm:hidden">{isAutoFridayHoliday ? 'تعطیل' : 'غایب'}</span>
                    <span className="hidden sm:inline">
                      {isAutoFridayHoliday ? 'تعطیل (۰)' : 'غایب (۰)'}
                    </span>
                  </button>
                </div>

                {/* Overtime Row + Accrued Footer (Single calm line on mobile) */}
                <div className="flex items-center justify-between gap-2 pt-2.5 sm:pt-3 border-t border-slate-100 font-mono-num">
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                    <span className="hidden sm:inline text-xs text-slate-600">اضافه‌کاری:</span>
                    <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-50 border border-slate-200 rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => handleOvertimeDelta(worker, -1)}
                        disabled={currentOvertime <= 0}
                        title="کسر ۱ ساعت"
                        aria-label="کسر ۱ ساعت"
                        className="h-8 w-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-rose-600 disabled:opacity-35 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                      <span className="text-xs font-extrabold text-slate-900 px-1 sm:px-1.5 min-w-[38px] sm:min-w-[46px] text-center whitespace-nowrap">
                        {toPersianDigits(currentOvertime)}{' '}
                        <span className="sm:hidden">س</span>
                        <span className="hidden sm:inline">ساعت</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOvertimeDelta(worker, 1)}
                        title="افزودن ۱ ساعت"
                        aria-label="افزودن ۱ ساعت"
                        className="h-8 w-8 rounded-lg hover:bg-emerald-50 flex items-center justify-center text-emerald-700 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>

                  {accrued && (
                    <button
                      type="button"
                      onClick={onOpenAccruedSheet}
                      className="text-[11px] sm:text-xs font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 transition-colors truncate"
                    >
                      <span className="truncate">
                        {toPersianDigits(accrued.effectiveDaysToToday)} روز ·{' '}
                        {formatToman(accrued.netPayableToToday)} ت
                      </span>
                      <Edit3 className="w-3 h-3 shrink-0" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Date Jump Modal */}
      {showDateJump && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setShowDateJump(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-sm w-full overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900">انتخاب تاریخ روزانه</h3>
              <button
                type="button"
                onClick={() => setShowDateJump(false)}
                aria-label="بستن"
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">روز</label>
                  <select
                    value={jumpDay}
                    onChange={(e) => setJumpDay(Number(e.target.value))}
                    className="w-full h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-mono-num font-bold"
                  >
                    {Array.from(
                      { length: getShamsiMonthLength(jumpYear, jumpMonth) },
                      (_, i) => i + 1
                    ).map((d) => (
                      <option key={d} value={d}>
                        {toPersianDigits(d)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">ماه</label>
                  <select
                    value={jumpMonth}
                    onChange={(e) => {
                      const nextM = Number(e.target.value);
                      setJumpMonth(nextM);
                      setJumpDay((prev) => Math.min(prev, getShamsiMonthLength(jumpYear, nextM)));
                    }}
                    className="w-full h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                  >
                    {PERSIAN_MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">سال</label>
                  <select
                    value={jumpYear}
                    onChange={(e) => {
                      const nextY = Number(e.target.value);
                      setJumpYear(nextY);
                      setJumpDay((prev) => Math.min(prev, getShamsiMonthLength(nextY, jumpMonth)));
                    }}
                    className="w-full h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-mono-num font-bold"
                  >
                    {jumpYearOptions.map((y) => (
                      <option key={y} value={y}>
                        {toPersianDigits(y)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDateJump(false)}
                  className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const maxD = getShamsiMonthLength(jumpYear, jumpMonth);
                    const safeD = Math.min(jumpDay, maxD);
                    onSelectDate(shamsiToIso(jumpYear, jumpMonth, safeD));
                    setShowDateJump(false);
                  }}
                  className="h-10 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors"
                >
                  تایید تاریخ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Note & Bonus Modal */}
      {expandedWorker && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setExpandedWorkerId(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-md w-full overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  جزئیات روز — {expandedWorker.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatShamsiDayMonth(selectedDate, true)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedWorkerId(null)}
                aria-label="بستن"
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    تعداد روز کاری
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={detailCustomDays}
                    onChange={(e) => setDetailCustomDays(e.target.value)}
                    className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    پاداش / خرجی (تومان)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={detailBonus}
                    onChange={(e) => setDetailBonus(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    پروژه / محل کار
                  </label>
                  <input
                    type="text"
                    value={detailProject}
                    onChange={(e) => setDetailProject(e.target.value)}
                    placeholder="مثلاً: پروژه نیاوران"
                    className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    توضیحات روز
                  </label>
                  <input
                    type="text"
                    value={detailNote}
                    onChange={(e) => setDetailNote(e.target.value)}
                    placeholder="مثلاً: سیمان‌کاری"
                    className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setExpandedWorkerId(null)}
                  className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveDetails(expandedWorker)}
                  className="h-10 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors"
                >
                  ذخیره جزئیات
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
