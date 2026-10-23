import React, { useState } from 'react';
import { Plus, Trash2, Wallet, Filter, Calendar } from 'lucide-react';
import { PaymentRecord, Worker, WorkerMonthlySummary } from '../types';
import {
  PERSIAN_MONTHS,
  formatShamsiDayMonth,
  formatShamsiShort,
  formatToman,
  getShamsiMonthLength,
  getTodayIso,
  isoToShamsi,
  shamsiToIso,
  toPersianDigits,
} from '../utils/jalali';

interface PaymentsViewProps {
  activeProjectName?: string;
  shamsiYear: number;
  shamsiMonth: number;
  workers: Worker[];
  summaries: WorkerMonthlySummary[];
  payments: PaymentRecord[];
  onAddPayment: (payload: {
    worker_id: number;
    payment_date: string;
    shamsi_year: number;
    shamsi_month: number;
    amount: number;
    payment_type: 'advance' | 'salary' | 'deduction';
    note: string;
  }) => Promise<void>;
  onDeletePayment: (id: number) => Promise<void>;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  activeProjectName = 'همه پروژه‌ها',
  shamsiYear,
  shamsiMonth,
  workers,
  summaries,
  payments,
  onAddPayment,
  onDeletePayment,
}) => {
  const todayIso = getTodayIso();
  const initialSh = isoToShamsi(todayIso);

  const activeWorkers = workers.filter((w) => w.active === 1);
  const [workerId, setWorkerId] = useState<string>(
    activeWorkers[0] ? String(activeWorkers[0].id) : ''
  );

  React.useEffect(() => {
    if (!workers.some((w) => String(w.id) === workerId)) {
      setWorkerId(activeWorkers[0] ? String(activeWorkers[0].id) : '');
    }
    setFilterWorkerId('all');
  }, [workers]);

  const [paymentType, setPaymentType] = useState<'advance' | 'salary' | 'deduction'>('advance');
  const [payJy, setPayJy] = useState<number>(initialSh.jy);
  const [payJm, setPayJm] = useState<number>(initialSh.jm);
  const [payJd, setPayJd] = useState<number>(initialSh.jd);
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [filterWorkerId, setFilterWorkerId] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);

  const selectedWorkerSummary = summaries.find((s) => s.workerId === Number(workerId));
  const monthName = PERSIAN_MONTHS[shamsiMonth - 1];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      const maxD = getShamsiMonthLength(payJy, payJm);
      const safeJd = Math.min(payJd, maxD);
      const paymentDateIso = shamsiToIso(payJy, payJm, safeJd);

      await onAddPayment({
        worker_id: Number(workerId),
        payment_date: paymentDateIso,
        shamsi_year: payJy,
        shamsi_month: payJm,
        amount: Number(amount),
        payment_type: paymentType,
        note: note.trim(),
      });
      setAmount('');
      setNote('');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPayments =
    filterWorkerId === 'all'
      ? payments
      : payments.filter((p) => p.worker_id === Number(filterWorkerId));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* New Payment / Advance Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 bg-white border border-emerald-100 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xs"
      >
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-600" />
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
            ثبت مساعده یا تسویه — «{activeProjectName}»
          </h2>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">انتخاب کارگر</label>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm"
            required
          >
            <option value="">انتخاب کنید...</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.role})
              </option>
            ))}
          </select>
        </div>

        {/* Selected Worker Quick Balance Hint */}
        {selectedWorkerSummary && (
          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between text-xs font-mono-num">
            <span className="text-slate-600">مانده طلب در {monthName}:</span>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-emerald-800">
                {formatToman(selectedWorkerSummary.remainingBalance)} تومان
              </span>
              {selectedWorkerSummary.remainingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAmount(String(selectedWorkerSummary.remainingBalance));
                    setPaymentType('salary');
                    setNote(`تسویه کامل ${monthName}`);
                  }}
                  className="text-[11px] font-bold underline text-emerald-700 hover:text-emerald-900"
                >
                  درج کل مانده
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">نوع تراکنش</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentType('advance')}
              className={`min-h-[42px] rounded-xl text-xs font-bold border transition-all ${
                paymentType === 'advance'
                  ? 'bg-gradient-to-l from-amber-500 to-orange-500 text-white border-amber-500 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              مساعده (علی‌الحساب)
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('salary')}
              className={`min-h-[42px] rounded-xl text-xs font-bold border transition-all ${
                paymentType === 'salary'
                  ? 'bg-gradient-to-l from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              تسویه حقوق
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('deduction')}
              className={`min-h-[42px] rounded-xl text-xs font-bold border transition-all ${
                paymentType === 'deduction'
                  ? 'bg-gradient-to-l from-rose-500 to-red-600 text-white border-rose-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              کسر / خسارت
            </button>
          </div>
        </div>

        {/* Payment Date Selector */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>تاریخ پرداخت</span>
            </label>
            <button
              type="button"
              onClick={() => {
                const sh = isoToShamsi(todayIso);
                setPayJy(sh.jy);
                setPayJm(sh.jm);
                setPayJd(sh.jd);
              }}
              className="w-fit px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold transition-colors"
            >
              امروز ({formatShamsiDayMonth(todayIso)})
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono-num">
            <select
              value={payJd}
              onChange={(e) => setPayJd(Number(e.target.value))}
              className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
            >
              {Array.from(
                { length: getShamsiMonthLength(payJy, payJm) },
                (_, i) => i + 1
              ).map((d) => (
                <option key={d} value={d}>
                  روز {toPersianDigits(d)}
                </option>
              ))}
            </select>
            <select
              value={payJm}
              onChange={(e) => setPayJm(Number(e.target.value))}
              className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
            >
              {PERSIAN_MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={payJy}
              onChange={(e) => setPayJy(Number(e.target.value))}
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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-700">مبلغ (تومان)</label>
            {amount && Number(amount) > 0 && (
              <span className="text-xs font-bold text-emerald-700 font-mono-num">
                {formatToman(Number(amount))} تومان
              </span>
            )}
          </div>
          <input
            type="number"
            step="50000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="مثلاً: 2000000"
            className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:border-emerald-600"
            required
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[500000, 1000000, 2000000, 5000000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[11px] font-mono-num font-semibold text-emerald-800"
              >
                +{formatToman(preset)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            توضیحات (شماره پیگیری، کارت به کارت، نقدی...)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثلاً: واریز به کارت بانک ملت"
            className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-emerald-600"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !workerId || !amount}
          className="w-full min-h-[46px] rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs shadow-emerald-600/20 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت در دیتابیس</span>
        </button>
      </form>

      {/* Payments History List */}
      <div className="lg:col-span-7 bg-white border border-emerald-100 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">
            لیست پرداختی‌ها و مساعده‌های «{activeProjectName}»
          </h3>

          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterWorkerId}
              onChange={(e) => setFilterWorkerId(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
            >
              <option value="all">همه کارگران</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            هیچ مساعده یا پرداختی ثبت نشده است.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPayments.map((p) => (
              <div
                key={p.id}
                className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-xl transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{p.worker_name}</span>
                    <span className="text-xs text-slate-500">
                      ·{' '}
                      {p.payment_type === 'advance'
                        ? 'مساعده'
                        : p.payment_type === 'salary'
                        ? 'تسویه حقوق'
                        : 'کسر / جریمه'}{' '}
                      · {formatShamsiShort(p.payment_date)}
                    </span>
                  </div>
                  {p.note && <p className="text-xs text-slate-500 mt-0.5">{p.note}</p>}
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-bold font-mono-num ${
                      p.payment_type === 'deduction'
                        ? 'text-rose-700'
                        : p.payment_type === 'salary'
                        ? 'text-teal-800'
                        : 'text-amber-700'
                    }`}
                  >
                    {formatToman(p.amount)} ت
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeletePayment(p.id)}
                    title="حذف این تراکنش"
                    className="min-h-[38px] min-w-[38px] rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
