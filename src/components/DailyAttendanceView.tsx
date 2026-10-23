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
} from 'lucide-react';
import { AccruedToTodaySummary, AttendanceStatus, DailyLog, Worker } from '../types';
import {
  PERSIAN_MONTHS,
  formatShamsiDayMonth,
  formatShamsiFull,
  formatToman,
  getDaysWindow,
  getShamsiMonthLength,
  getTodayIso,
  isoToShamsi,
  shamsiToIso,
  toPersianDigits,
} from '../utils/jalali';

const WORKER_LIGHT_THEMES = [
  {
    cardBg: 'bg-gradient-to-br from-emerald-50 via-teal-50/90 to-cyan-50/80',
    cardBorder: 'border-emerald-200',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs shadow-emerald-600/25',
  },
  {
    cardBg: 'bg-gradient-to-br from-sky-50 via-blue-50/90 to-indigo-50/80',
    cardBorder: 'border-sky-200',
    avatarBg: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-xs shadow-sky-600/25',
  },
  {
    cardBg: 'bg-gradient-to-br from-amber-50 via-orange-50/85 to-yellow-50/80',
    cardBorder: 'border-amber-200',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xs shadow-amber-600/25',
  },
  {
    cardBg: 'bg-gradient-to-br from-violet-50 via-indigo-50/90 to-purple-50/80',
    cardBorder: 'border-violet-200',
    avatarBg: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-xs shadow-violet-600/25',
  },
  {
    cardBg: 'bg-gradient-to-br from-rose-50 via-pink-50/85 to-red-50/75',
    cardBorder: 'border-rose-200',
    avatarBg: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-xs shadow-rose-600/25',
  },
];

interface DailyAttendanceViewProps {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  workers: Worker[];
  dailyLogs: DailyLog[];
  accruedSummaries: AccruedToTodaySummary[];
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
  savingWorkerId: number | null;
}

export const DailyAttendanceView: React.FC<DailyAttendanceViewProps> = ({
  selectedDate,
  onSelectDate,
  workers,
  dailyLogs,
  accruedSummaries,
  onSaveDailyLog,
  onBulkMarkPresent,
  onOpenNewWorker,
  onOpenAccruedSheet,
}) => {
  const todayIso = getTodayIso();
  const activeWorkers = workers.filter((w) => w.active === 1);
  const daysStrip = getDaysWindow(selectedDate, 3);
  const currentShamsi = isoToShamsi(selectedDate);

  const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);
  const [defaultProject, setDefaultProject] = useState<string>('');
  const [showDateJump, setShowDateJump] = useState(false);
  const [jumpYear, setJumpYear] = useState(currentShamsi.jy);
  const [jumpMonth, setJumpMonth] = useState(currentShamsi.jm);
  const [jumpDay, setJumpDay] = useState(currentShamsi.jd);

  const [detailBonus, setDetailBonus] = useState<string>('');
  const [detailProject, setDetailProject] = useState<string>('');
  const [detailNote, setDetailNote] = useState<string>('');
  const [detailCustomDays, setDetailCustomDays] = useState<string>('1');

  const getWorkerLog = (workerId: number): DailyLog | undefined =>
    dailyLogs.find((l) => l.worker_id === workerId);

  const handleToggleExpand = (worker: Worker) => {
    if (expandedWorkerId === worker.id) {
      setExpandedWorkerId(null);
      return;
    }
    const log = getWorkerLog(worker.id);
    setDetailBonus(log?.bonus_amount ? String(log.bonus_amount) : '');
    setDetailProject(log?.project_name || defaultProject || '');
    setDetailNote(log?.note || '');
    setDetailCustomDays(log ? String(log.days_equiv) : '1');
    setExpandedWorkerId(worker.id);
  };

  const handleQuickStatus = (worker: Worker, status: AttendanceStatus) => {
    const existing = getWorkerLog(worker.id);
    const daysEquiv = status === 'present' || status === 'paid_leave' ? 1 : 0;

    onSaveDailyLog({
      worker_id: worker.id,
      work_date: selectedDate,
      status,
      days_equiv: daysEquiv,
      overtime_hours: existing ? existing.overtime_hours : 0,
      bonus_amount: existing ? existing.bonus_amount : 0,
      project_name: existing?.project_name || defaultProject,
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
      project_name: existing?.project_name || defaultProject,
      note: existing?.note || '',
    });
  };

  const handleSaveDetails = (worker: Worker) => {
    const existing = getWorkerLog(worker.id);
    const status: AttendanceStatus = existing ? existing.status : 'present';
    const parsedDays = parseInt(detailCustomDays, 10);
    onSaveDailyLog({
      worker_id: worker.id,
      work_date: selectedDate,
      status,
      days_equiv: isNaN(parsedDays) ? 1 : parsedDays,
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
    <div className="space-y-3.5">
      {/* Top Date Bar & Strip — Compact & Proportional */}
      <section className="bg-white border border-emerald-100 rounded-2xl p-3 sm:p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 active:scale-95 transition-all"
              title="روز قبل"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 px-1">
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900">
                {formatShamsiFull(selectedDate)}
              </h2>
              {selectedDate === todayIso && (
                <span className="text-[11px] font-bold text-emerald-600">· امروز</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => shiftDay(1)}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 active:scale-95 transition-all"
              title="روز بعد"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedDate !== todayIso && (
              <button
                type="button"
                onClick={() => onSelectDate(todayIso)}
                className="w-fit h-8 px-2.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap"
              >
                امروز
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const sh = isoToShamsi(selectedDate);
                setJumpYear(sh.jy);
                setJumpMonth(sh.jm);
                setJumpDay(sh.jd);
                setShowDateJump(true);
              }}
              className="w-fit h-8 px-2.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Calendar className="w-3 h-3 text-emerald-600" />
              <span>تغییر تاریخ</span>
            </button>
            <button
              type="button"
              onClick={() => onBulkMarkPresent(defaultProject)}
              disabled={activeWorkers.length === 0}
              className="w-fit h-8 px-3 rounded-lg bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-95 text-white text-[11px] font-bold inline-flex items-center gap-1 transition-all whitespace-nowrap shadow-2xs disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>حضور همه</span>
            </button>
          </div>
        </div>

        {/* Compact 7-Day Scroller — Centered Fixed-Width Squares */}
        <div className="flex items-center justify-between sm:justify-center gap-1.5 overflow-x-auto pb-0.5">
          {daysStrip.map((item) => {
            const isSelected = item.iso === selectedDate;
            const isToday = item.iso === todayIso;
            return (
              <button
                key={item.iso}
                type="button"
                onClick={() => onSelectDate(item.iso)}
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all border shrink-0 ${
                  isSelected
                    ? 'bg-gradient-to-b from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-2xs'
                    : isToday
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-slate-50/90 text-slate-700 border-slate-200/80 hover:bg-emerald-50/50'
                }`}
              >
                <span
                  className={`text-[9px] font-medium leading-none ${
                    isSelected ? 'text-emerald-100' : 'text-slate-500'
                  }`}
                >
                  {item.weekdayShort}
                </span>
                <span className="text-xs font-extrabold font-mono-num mt-1 leading-none">
                  {toPersianDigits(item.jd)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Workers Attendance List — Compact Cards & Non-Stretched Buttons */}
      {activeWorkers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
          <p className="text-xs text-slate-600 mb-3">
            هنوز هیچ کارگر فعالی در سیستم ثبت نشده است.
          </p>
          <button
            type="button"
            onClick={onOpenNewWorker}
            className="w-fit h-9 px-4 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>افزودن اولین کارگر</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
          {activeWorkers.map((worker, index) => {
            const theme = WORKER_LIGHT_THEMES[index % WORKER_LIGHT_THEMES.length];
            const log = getWorkerLog(worker.id);
            const accrued = accruedSummaries.find((a) => a.workerId === worker.id);

            const isWithinAutoActiveRange =
              worker.auto_count_days !== 0 &&
              selectedDate >= (worker.start_date || '') &&
              selectedDate <= todayIso &&
              (!worker.end_date || selectedDate <= worker.end_date);

            const currentStatus: AttendanceStatus | undefined =
              log?.status ?? (isWithinAutoActiveRange ? 'present' : undefined);
            const currentOvertime = log ? Number(log.overtime_hours || 0) : 0;

            return (
              <div
                key={worker.id}
                className={`${theme.cardBg} border ${theme.cardBorder} rounded-2xl p-3 sm:p-3.5 space-y-2.5 shadow-2xs transition-all`}
              >
                {/* Worker Header Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl ${theme.avatarBg} font-extrabold text-sm flex items-center justify-center shrink-0`}
                    >
                      {worker.name.trim().charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-slate-900 truncate">
                        {worker.name}
                      </h3>
                      <div className="text-[11px] text-slate-600 font-mono-num truncate">
                        {worker.role} ·{' '}
                        {worker.wage_type === 'daily'
                          ? `روزمزد ${formatToman(worker.base_wage)} ت`
                          : `ماهانه ${formatToman(worker.base_wage)} ت`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
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
                        className="h-8 w-8 rounded-lg bg-white/90 text-slate-500 hover:text-rose-600 flex items-center justify-center shadow-2xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(worker)}
                      className={`w-fit h-8 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors shadow-2xs ${
                        log?.note || log?.bonus_amount
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white/90 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>یادداشت</span>
                    </button>
                  </div>
                </div>

                {/* Inner White Box for Attendance & Overtime Controls */}
                <div className="bg-white/95 rounded-xl p-2.5 border border-white space-y-2 shadow-2xs">
                  {/* Compact Non-Stretched Attendance Buttons */}
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickStatus(worker, 'present')}
                      className={`w-fit h-8 px-3.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-all active:scale-95 whitespace-nowrap ${
                        currentStatus === 'present'
                          ? 'bg-gradient-to-l from-emerald-500 to-teal-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {currentStatus === 'present' && <Check className="w-3 h-3 shrink-0" />}
                      <span>حاضر (۱ روز)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickStatus(worker, 'paid_leave')}
                      className={`w-fit h-8 px-3 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-all active:scale-95 whitespace-nowrap ${
                        currentStatus === 'paid_leave'
                          ? 'bg-gradient-to-l from-sky-500 to-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>مرخصی</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickStatus(worker, 'absent')}
                      className={`w-fit h-8 px-3 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-all active:scale-95 whitespace-nowrap ${
                        currentStatus === 'absent'
                          ? 'bg-gradient-to-l from-rose-500 to-red-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>غایب (۰)</span>
                    </button>
                  </div>

                  {/* Quick Overtime Stepper Row (Icon-Only Buttons) */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1 text-[11px] text-slate-600 font-mono-num">
                      <Clock className="w-3 h-3 text-emerald-600" />
                      <span>اضافه‌کاری:</span>
                      <strong className="text-slate-900">
                        {toPersianDigits(currentOvertime)} ساعت
                      </strong>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono-num">
                      <button
                        type="button"
                        onClick={() => handleOvertimeDelta(worker, -1)}
                        disabled={currentOvertime <= 0}
                        title="کسر ۱ ساعت"
                        aria-label="کسر ۱ ساعت"
                        className="h-8 w-8 rounded-lg bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 hover:bg-rose-100 disabled:opacity-40 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOvertimeDelta(worker, 1)}
                        title="افزودن ۱ ساعت"
                        aria-label="افزودن ۱ ساعت"
                        className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Accrued Summary Footer Line */}
                {accrued && (
                  <div className="flex items-center justify-between px-1 text-[11px] font-mono-num text-slate-700">
                    <span>
                      کارکرد از {formatShamsiDayMonth(accrued.startDate)}:{' '}
                      <strong className="text-slate-900">
                        {toPersianDigits(accrued.effectiveDaysToToday)} روز
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={onOpenAccruedSheet}
                      className="font-bold text-emerald-800 hover:underline inline-flex items-center gap-1"
                    >
                      <span>طلب: {formatToman(accrued.netPayableToToday)} ت</span>
                      <Edit3 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Separate Modal Window for Date Jump (تغییر تاریخ روزانه) */}
      {showDateJump && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowDateJump(false)}
        >
          <div
            className="bg-white border border-emerald-100 rounded-2xl max-w-sm w-full p-4 space-y-3.5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900">انتخاب تاریخ روزانه</h3>
              <button
                type="button"
                onClick={() => setShowDateJump(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                بستن
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-600 mb-1">روز</label>
                <select
                  value={jumpDay}
                  onChange={(e) => setJumpDay(Number(e.target.value))}
                  className="w-full h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
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
                <label className="block text-[10px] text-slate-600 mb-1">ماه</label>
                <select
                  value={jumpMonth}
                  onChange={(e) => setJumpMonth(Number(e.target.value))}
                  className="w-full h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs"
                >
                  {PERSIAN_MONTHS.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-600 mb-1">سال</label>
                <select
                  value={jumpYear}
                  onChange={(e) => setJumpYear(Number(e.target.value))}
                  className="w-full h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
                >
                  {[1403, 1404, 1405, 1406, 1407].map((y) => (
                    <option key={y} value={y}>
                      {toPersianDigits(y)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDateJump(false)}
                className="w-fit h-8 px-3 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
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
                className="w-fit h-8 px-4 rounded-lg bg-gradient-to-l from-emerald-500 to-teal-600 text-white text-xs font-bold"
              >
                انتخاب تاریخ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Separate Modal Window for Worker Daily Note & Bonus */}
      {expandedWorker && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setExpandedWorkerId(null)}
        >
          <div
            className="bg-white border border-emerald-100 rounded-2xl max-w-md w-full p-4 space-y-3.5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900">
                یادداشت و جزئیات روز — {expandedWorker.name}
              </h3>
              <button
                type="button"
                onClick={() => setExpandedWorkerId(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                بستن
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  تعداد روز کاری
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={detailCustomDays}
                  onChange={(e) => setDetailCustomDays(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  پاداش / خرجی روز (تومان)
                </label>
                <input
                  type="number"
                  step="50000"
                  value={detailBonus}
                  onChange={(e) => setDetailBonus(e.target.value)}
                  placeholder="0"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  نام پروژه / محل کار
                </label>
                <input
                  type="text"
                  value={detailProject}
                  onChange={(e) => setDetailProject(e.target.value)}
                  placeholder="مثلاً: پروژه نیاوران"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  توضیحات روز
                </label>
                <input
                  type="text"
                  value={detailNote}
                  onChange={(e) => setDetailNote(e.target.value)}
                  placeholder="مثلاً: سیمان‌کاری"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setExpandedWorkerId(null)}
                className="w-fit h-8 px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveDetails(expandedWorker)}
                className="w-fit h-8 px-4 rounded-lg bg-gradient-to-l from-emerald-500 to-teal-600 text-white text-xs font-bold"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
