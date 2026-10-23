import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CalendarRange,
  Wallet,
  Users,
  Download,
} from 'lucide-react';
import {
  AttendanceStatus,
  BootstrapResponse,
  CalcMode,
  DailyLog,
  PaymentRecord,
  Worker,
} from './types';
import {
  getTodayIso,
  isoToShamsi,
} from './utils/jalali';
import {
  computeWorkerAccruedSummary,
  computeWorkerMonthlySummary,
} from './utils/calculations';
import { DailyAttendanceView } from './components/DailyAttendanceView';
import { MonthlySheetView } from './components/MonthlySheetView';
import { PaymentsView } from './components/PaymentsView';
import { WorkersView } from './components/WorkersView';

type ActiveTab = 'daily' | 'monthly' | 'payments' | 'workers';

export default function App() {
  const todayIso = getTodayIso();
  const initialShamsi = isoToShamsi(todayIso);

  const [activeTab, setActiveTab] = useState<ActiveTab>('monthly');
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [shamsiYear, setShamsiYear] = useState<number>(initialShamsi.jy);
  const [shamsiMonth, setShamsiMonth] = useState<number>(initialShamsi.jm);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [allLogs, setAllLogs] = useState<DailyLog[]>([]);
  const [allPayments, setAllPayments] = useState<PaymentRecord[]>([]);
  const [dbFileSizeKb, setDbFileSizeKb] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2200);
  };

  const fetchAllData = useCallback(
    async (dateIso = selectedDate, jy = shamsiYear, jm = shamsiMonth) => {
      try {
        setErrorMsg(null);
        const params = new URLSearchParams({
          workDate: dateIso,
          shamsiYear: String(jy),
          shamsiMonth: String(jm),
        });
        const res = await fetch(`/api/bootstrap?${params.toString()}`);
        if (!res.ok) {
          throw new Error('خطا در ارتباط با سرور SQLite');
        }
        const data: BootstrapResponse = await res.json();
        setWorkers(data.workers || []);
        setAllLogs(data.allLogs || []);
        setAllPayments(data.allPayments || []);
        setDbFileSizeKb(data.dbFileSizeKb || 0);
      } catch (err: any) {
        setErrorMsg(err.message || 'خطا در بارگذاری اطلاعات');
      } finally {
        setLoading(false);
      }
    },
    [selectedDate, shamsiYear, shamsiMonth]
  );

  useEffect(() => {
    fetchAllData(selectedDate, shamsiYear, shamsiMonth);
  }, []);

  // Instant 0ms derived state using useMemo (no waiting for network roundtrips!)
  const dailyLogs = useMemo(
    () => allLogs.filter((l) => l.work_date === selectedDate),
    [allLogs, selectedDate]
  );

  const monthLogs = useMemo(
    () =>
      allLogs.filter(
        (l) => l.shamsi_year === shamsiYear && l.shamsi_month === shamsiMonth
      ),
    [allLogs, shamsiYear, shamsiMonth]
  );

  const payments = useMemo(
    () =>
      allPayments.filter(
        (p) => p.shamsi_year === shamsiYear && p.shamsi_month === shamsiMonth
      ),
    [allPayments, shamsiYear, shamsiMonth]
  );

  const accruedSummaries = useMemo(
    () =>
      workers.map((w) =>
        computeWorkerAccruedSummary(w, allLogs, allPayments, todayIso)
      ),
    [workers, allLogs, allPayments, todayIso]
  );

  const summaries = useMemo(
    () =>
      workers.map((w) =>
        computeWorkerMonthlySummary(
          w,
          allLogs,
          allPayments,
          shamsiYear,
          shamsiMonth,
          todayIso
        )
      ),
    [workers, allLogs, allPayments, shamsiYear, shamsiMonth, todayIso]
  );

  const handleSelectDate = (iso: string) => {
    setSelectedDate(iso);
    const sh = isoToShamsi(iso);
    if (sh.jy !== shamsiYear || sh.jm !== shamsiMonth) {
      setShamsiYear(sh.jy);
      setShamsiMonth(sh.jm);
    }
  };

  // Optimistic 0ms daily log update
  const handleSaveDailyLog = async (payload: {
    worker_id: number;
    work_date: string;
    status: AttendanceStatus | 'clear';
    days_equiv?: number;
    overtime_hours?: number;
    bonus_amount?: number;
    project_name?: string;
    note?: string;
  }) => {
    const sh = isoToShamsi(payload.work_date);

    // 1. Update local state IMMEDIATELY (0ms latency)
    setAllLogs((prev) => {
      const filtered = prev.filter(
        (l) => !(l.worker_id === payload.worker_id && l.work_date === payload.work_date)
      );
      if (payload.status === 'clear') {
        return filtered;
      }
      const existing = prev.find(
        (l) => l.worker_id === payload.worker_id && l.work_date === payload.work_date
      );
      const computedDays =
        payload.days_equiv !== undefined
          ? Number(payload.days_equiv)
          : payload.status === 'present' || payload.status === 'paid_leave'
          ? 1
          : payload.status === 'half'
          ? 0.5
          : 0;

      const updatedLog: DailyLog = {
        id: existing?.id ?? Date.now(),
        worker_id: payload.worker_id,
        work_date: payload.work_date,
        shamsi_year: sh.jy,
        shamsi_month: sh.jm,
        shamsi_day: sh.jd,
        status: payload.status,
        days_equiv: computedDays,
        overtime_hours:
          payload.overtime_hours !== undefined
            ? Number(payload.overtime_hours)
            : existing?.overtime_hours ?? 0,
        bonus_amount:
          payload.bonus_amount !== undefined
            ? Number(payload.bonus_amount)
            : existing?.bonus_amount ?? 0,
        project_name:
          payload.project_name !== undefined
            ? payload.project_name
            : existing?.project_name ?? '',
        note: payload.note !== undefined ? payload.note : existing?.note ?? '',
      };
      return [...filtered, updatedLog];
    });

    // 2. Persist in SQLite in background
    fetch('/api/daily-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      setErrorMsg('خطا در ذخیره خودکار');
    });
  };

  // Optimistic 0ms bulk mark present
  const handleBulkMarkPresent = async (projectName: string) => {
    const sh = isoToShamsi(selectedDate);
    const activeWorkers = workers.filter((w) => w.active === 1);

    setAllLogs((prev) => {
      const next = [...prev];
      for (const w of activeWorkers) {
        const idx = next.findIndex(
          (l) => l.worker_id === w.id && l.work_date === selectedDate
        );
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            status: 'present',
            days_equiv: 1,
            project_name: next[idx].project_name || projectName,
          };
        } else {
          next.push({
            id: Date.now() + w.id,
            worker_id: w.id,
            work_date: selectedDate,
            shamsi_year: sh.jy,
            shamsi_month: sh.jm,
            shamsi_day: sh.jd,
            status: 'present',
            days_equiv: 1,
            overtime_hours: 0,
            bonus_amount: 0,
            project_name: projectName,
            note: '',
          });
        }
      }
      return next;
    });

    showToast('حضور تمام کارگران ثبت شد');

    fetch('/api/daily-log/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_date: selectedDate,
        status: 'present',
        project_name: projectName,
      }),
    }).catch(() => {
      setErrorMsg('خطا در ثبت گروهی');
    });
  };

  // Optimistic 0ms payment creation
  const handleAddPayment = async (payload: {
    worker_id: number;
    payment_date: string;
    shamsi_year: number;
    shamsi_month: number;
    amount: number;
    payment_type: 'advance' | 'salary' | 'deduction';
    note: string;
  }) => {
    const w = workers.find((x) => x.id === payload.worker_id);
    const optimisticPayment: PaymentRecord = {
      id: Date.now(),
      worker_id: payload.worker_id,
      worker_name: w?.name || '',
      worker_role: w?.role || '',
      payment_date: payload.payment_date,
      shamsi_year: payload.shamsi_year,
      shamsi_month: payload.shamsi_month,
      amount: payload.amount,
      payment_type: payload.payment_type,
      note: payload.note,
    };

    setAllPayments((prev) => [optimisticPayment, ...prev]);
    showToast('تراکنش مالی ثبت شد');

    fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(() => fetchAllData(selectedDate, shamsiYear, shamsiMonth))
      .catch(() => setErrorMsg('خطا در ثبت پرداخت'));
  };

  const handleQuickSettleWorker = (worker: Worker, amount: number) => {
    handleAddPayment({
      worker_id: worker.id,
      payment_date: getTodayIso(),
      shamsi_year: shamsiYear,
      shamsi_month: shamsiMonth,
      amount,
      payment_type: 'salary',
      note: 'تسویه کارکرد',
    });
  };

  const handleDeletePayment = async (id: number) => {
    setAllPayments((prev) => prev.filter((p) => p.id !== id));
    showToast('تراکنش حذف شد');
    fetch(`/api/payments/${id}`, { method: 'DELETE' }).catch(() =>
      setErrorMsg('خطا در حذف تراکنش')
    );
  };

  // Optimistic 0ms worker update
  const handleSaveWorker = async (payload: {
    id?: number;
    name: string;
    role: string;
    phone: string;
    wage_type: 'daily' | 'monthly';
    base_wage: number;
    overtime_rate: number;
    start_date: string;
    end_date: string | null;
    calc_mode?: CalcMode;
    manual_worked_days?: number | null;
    manual_absent_days?: number;
    manual_overtime_hours?: number | null;
    auto_count_days: number;
    active: number;
    notes: string;
  }) => {
    if (payload.id) {
      // Update worker immediately in memory (0ms latency)
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === payload.id
            ? {
                ...w,
                name: payload.name,
                role: payload.role,
                phone: payload.phone,
                wage_type: payload.wage_type,
                base_wage: payload.base_wage,
                overtime_rate: payload.overtime_rate,
                start_date: payload.start_date,
                end_date: payload.end_date,
                calc_mode: payload.calc_mode ?? w.calc_mode ?? 'to_today',
                manual_worked_days:
                  payload.manual_worked_days !== undefined
                    ? payload.manual_worked_days
                    : w.manual_worked_days,
                manual_absent_days:
                  payload.manual_absent_days !== undefined
                    ? payload.manual_absent_days
                    : w.manual_absent_days,
                manual_overtime_hours:
                  payload.manual_overtime_hours !== undefined
                    ? payload.manual_overtime_hours
                    : w.manual_overtime_hours,
                auto_count_days: payload.auto_count_days,
                active: payload.active,
                notes: payload.notes,
              }
            : w
        )
      );

      fetch(`/api/workers/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => setErrorMsg('خطا در ذخیره اطلاعات کارگر'));
    } else {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchAllData(selectedDate, shamsiYear, shamsiMonth);
        showToast('کارگر جدید اضافه شد');
      }
    }
  };

  const handleSaveWorkerRangeAndDays = (
    worker: Worker,
    updates: {
      start_date: string;
      end_date: string | null;
      calc_mode: CalcMode;
      manual_worked_days: number | null;
      manual_absent_days: number;
      manual_overtime_hours: number | null;
      auto_count_days: number;
    }
  ) => {
    handleSaveWorker({
      id: worker.id,
      name: worker.name,
      role: worker.role,
      phone: worker.phone,
      wage_type: worker.wage_type,
      base_wage: worker.base_wage,
      overtime_rate: worker.overtime_rate,
      start_date: updates.start_date,
      end_date: updates.end_date,
      calc_mode: updates.calc_mode,
      manual_worked_days: updates.manual_worked_days,
      manual_absent_days: updates.manual_absent_days,
      manual_overtime_hours: updates.manual_overtime_hours,
      auto_count_days: updates.auto_count_days,
      active: worker.active,
      notes: worker.notes,
    });
  };

  const handleDeleteWorker = async (id: number) => {
    setWorkers((prev) => prev.filter((w) => w.id !== id));
    showToast('کارگر حذف شد');
    fetch(`/api/workers/${id}`, { method: 'DELETE' }).catch(() =>
      setErrorMsg('خطا در حذف کارگر')
    );
  };

  const handleRestoreBackup = async (backupData: any) => {
    const res = await fetch('/api/restore/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupData),
    });
    if (!res.ok) throw new Error('خطا در بازیابی فایل پشتیبان');
    await fetchAllData(selectedDate, shamsiYear, shamsiMonth);
  };

  return (
    <div className="min-h-screen flex flex-col text-slate-900 pb-20 md:pb-10">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-emerald-100 shadow-2xs no-print">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-8 px-3.5 sm:px-5 h-13">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#monthly"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monthly');
            }}
            className="text-base sm:text-lg font-extrabold tracking-tight bg-gradient-to-l from-emerald-600 to-teal-700 bg-clip-text text-transparent whitespace-nowrap shrink-0"
          >
            کارکردیار
          </a>

          {/* Zone 2: 4 concise single-line text navigation links (Desktop) */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            <a
              href="#monthly"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('monthly');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'monthly'
                  ? 'text-emerald-700 font-bold underline underline-offset-8 decoration-2 decoration-emerald-500'
                  : 'hover:text-emerald-600'
              }`}
            >
              ورود و خروج و کارکرد
            </a>
            <a
              href="#daily"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('daily');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'daily'
                  ? 'text-emerald-700 font-bold underline underline-offset-8 decoration-2 decoration-emerald-500'
                  : 'hover:text-emerald-600'
              }`}
            >
              حضور روزانه
            </a>
            <a
              href="#payments"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('payments');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'payments'
                  ? 'text-emerald-700 font-bold underline underline-offset-8 decoration-2 decoration-emerald-500'
                  : 'hover:text-emerald-600'
              }`}
            >
              مساعده و تسویه
            </a>
            <a
              href="#workers"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('workers');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'workers'
                  ? 'text-emerald-700 font-bold underline underline-offset-8 decoration-2 decoration-emerald-500'
                  : 'hover:text-emerald-600'
              }`}
            >
              کارگران و دیتابیس
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <a
              href="/api/backup/sqlite"
              download
              className="h-8 px-3 text-[11px] font-bold text-white bg-gradient-to-l from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-600 hover:to-teal-700 shadow-2xs transition-all inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Download className="w-3 h-3" />
              <span>پشتیبان SQLite</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-5 pt-3.5 sm:pt-5">
        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => fetchAllData(selectedDate, shamsiYear, shamsiMonth)}
              className="px-3 py-1 rounded-lg bg-rose-600 text-white font-semibold"
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {toastMsg && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-700 text-white text-xs font-bold shadow-lg shadow-emerald-900/20">
            {toastMsg}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="h-28 rounded-2xl bg-emerald-100/50 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="h-40 rounded-2xl bg-sky-100/50 animate-pulse" />
              <div className="h-40 rounded-2xl bg-amber-100/50 animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'monthly' && (
              <MonthlySheetView
                shamsiYear={shamsiYear}
                shamsiMonth={shamsiMonth}
                onChangeMonth={(y, m) => {
                  setShamsiYear(y);
                  setShamsiMonth(m);
                }}
                workers={workers}
                summaries={summaries}
                accruedSummaries={accruedSummaries}
                monthLogs={monthLogs}
                payments={payments}
                onSaveDailyLog={handleSaveDailyLog}
                onSaveWorkerRangeAndDays={handleSaveWorkerRangeAndDays}
                onQuickSettleWorker={handleQuickSettleWorker}
              />
            )}

            {activeTab === 'daily' && (
              <DailyAttendanceView
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                workers={workers}
                dailyLogs={dailyLogs}
                accruedSummaries={accruedSummaries}
                onSaveDailyLog={handleSaveDailyLog}
                onBulkMarkPresent={handleBulkMarkPresent}
                onOpenNewWorker={() => setActiveTab('workers')}
                onOpenAccruedSheet={() => setActiveTab('monthly')}
                savingWorkerId={null}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentsView
                shamsiYear={shamsiYear}
                shamsiMonth={shamsiMonth}
                workers={workers}
                summaries={summaries}
                payments={payments}
                onAddPayment={handleAddPayment}
                onDeletePayment={handleDeletePayment}
              />
            )}

            {activeTab === 'workers' && (
              <WorkersView
                workers={workers}
                dbFileSizeKb={dbFileSizeKb}
                onSaveWorker={handleSaveWorker}
                onDeleteWorker={handleDeleteWorker}
                onRestoreBackup={handleRestoreBackup}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (Natural Thumb Zone) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-emerald-100 shadow-lg no-print">
        <div className="grid grid-cols-4 items-center h-16 px-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'monthly'
                ? 'text-emerald-700 font-bold bg-emerald-50/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarRange className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">ورود/خروج و کارکرد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'daily'
                ? 'text-emerald-700 font-bold bg-emerald-50/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarCheck className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">حضور روزانه</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'payments'
                ? 'text-emerald-700 font-bold bg-emerald-50/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">مساعده و مالی</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('workers')}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'workers'
                ? 'text-emerald-700 font-bold bg-emerald-50/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">کارگران</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
