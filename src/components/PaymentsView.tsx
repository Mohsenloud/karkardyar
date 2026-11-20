import React, { useState } from 'react';
import { Plus, Trash2, Wallet, Filter, Calendar, Edit2, Check, X } from 'lucide-react';
import { AccruedToTodaySummary, PaymentRecord, Worker } from '../types';
import {
  PERSIAN_MONTHS,
  formatShamsiDayMonth,
  formatShamsiShort,
  formatToman,
  getShamsiMonthLength,
  getShamsiYearOptions,
  isoToShamsi,
  shamsiToIso,
  toPersianDigits,
} from '../utils/jalali';

interface PaymentsViewProps {
  activeProjectName?: string;
  selectedProjectId: number | 'all';
  todayIso: string;
  workers: Worker[];
  accruedSummaries: AccruedToTodaySummary[];
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
  onUpdatePayment: (payload: {
    id: number;
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
  selectedProjectId,
  todayIso,
  workers,
  accruedSummaries,
  payments,
  onAddPayment,
  onUpdatePayment,
  onDeletePayment,
}) => {
  const initialSh = isoToShamsi(todayIso);

  const activeWorkers = workers.filter((w) => w.active === 1);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [workerId, setWorkerId] = useState<string>(
    activeWorkers[0] ? String(activeWorkers[0].id) : ''
  );

  const [paymentType, setPaymentType] = useState<'advance' | 'salary' | 'deduction'>('advance');
  const [payJy, setPayJy] = useState<number>(initialSh.jy);
  const [payJm, setPayJm] = useState<number>(initialSh.jm);
  const [payJd, setPayJd] = useState<number>(initialSh.jd);
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [filterWorkerId, setFilterWorkerId] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);
  const [mobileSection, setMobileSection] = useState<'list' | 'form'>('list');

  // Reset filter & editing mode only when switching project
  React.useEffect(() => {
    setFilterWorkerId('all');
    setEditingPaymentId(null);
  }, [selectedProjectId]);

  // Keep selected worker valid if the worker list changes
  React.useEffect(() => {
    if (!workers.some((w) => String(w.id) === workerId)) {
      const firstActive = workers.find((w) => w.active === 1) || workers[0];
      setWorkerId(firstActive ? String(firstActive.id) : '');
    }
    if (filterWorkerId !== 'all' && !workers.some((w) => String(w.id) === filterWorkerId)) {
      setFilterWorkerId('all');
    }
  }, [workers, workerId, filterWorkerId]);

  const selectedWorkerAccrued = accruedSummaries.find((a) => a.workerId === Number(workerId));
  const yearOptions = getShamsiYearOptions(initialSh.jy, [payJy]);

  const handleStartEdit = (p: PaymentRecord) => {
    setEditingPaymentId(p.id);
    setWorkerId(String(p.worker_id));
    setPaymentType(p.payment_type);
    const sh = isoToShamsi(p.payment_date || todayIso);
    setPayJy(sh.jy);
    setPayJm(sh.jm);
    setPayJd(sh.jd);
    setAmount(String(p.amount));
    setNote(p.note || '');
    setMobileSection('form');
  };

  const handleCancelEdit = () => {
    setEditingPaymentId(null);
    const sh = isoToShamsi(todayIso);
    setPayJy(sh.jy);
    setPayJm(sh.jm);
    setPayJd(sh.jd);
    setAmount('');
    setNote('');
    setMobileSection('list');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      const maxD = getShamsiMonthLength(payJy, payJm);
      const safeJd = Math.min(payJd, maxD);
      const paymentDateIso = shamsiToIso(payJy, payJm, safeJd);

      if (editingPaymentId !== null) {
        await onUpdatePayment({
          id: editingPaymentId,
          worker_id: Number(workerId),
          payment_date: paymentDateIso,
          shamsi_year: payJy,
          shamsi_month: payJm,
          amount: Number(amount),
          payment_type: paymentType,
          note: note.trim(),
        });
        setEditingPaymentId(null);
      } else {
        await onAddPayment({
          worker_id: Number(workerId),
          payment_date: paymentDateIso,
          shamsi_year: payJy,
          shamsi_month: payJm,
          amount: Number(amount),
          payment_type: paymentType,
          note: note.trim(),
        });
      }
      setAmount('');
      setNote('');
      setMobileSection('list');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPayments =
    filterWorkerId === 'all'
      ? payments
      : payments.filter((p) => p.worker_id === Number(filterWorkerId));

  const filteredTotal = filteredPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div className="space-y-3 lg:space-y-0">
      {/* Mobile Segmented Switcher (List first for calm, zero-scroll browsing) */}
      <div className="lg:hidden grid grid-cols-2 bg-slate-200/75 p-1 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => setMobileSection('list')}
          className={`h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
            mobileSection === 'list'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600'
          }`}
        >
          <span>لیست پرداختی‌ها</span>
          <span className="text-[11px] font-mono-num text-slate-400">
            ({toPersianDigits(payments.length)})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSection('form')}
          className={`h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
            mobileSection === 'form'
              ? editingPaymentId !== null
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-emerald-700 text-white shadow-2xs'
              : 'text-slate-600'
          }`}
        >
          {editingPaymentId !== null ? (
            <>
              <Edit2 className="w-3.5 h-3.5" />
              <span>ویرایش تراکنش</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت جدید</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
        {/* New / Edit Payment Form (Sticky on Desktop) */}
        <form
          onSubmit={handleSubmit}
          className={`${
            mobileSection === 'form' ? 'block' : 'hidden lg:block'
          } lg:col-span-5 lg:sticky lg:top-20 bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 sm:space-y-4 transition-colors ${
            editingPaymentId !== null
              ? 'border-amber-400 ring-2 ring-amber-100'
              : 'border-slate-200/90'
          }`}
        >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet
              className={`w-5 h-5 shrink-0 ${
                editingPaymentId !== null ? 'text-amber-600' : 'text-emerald-700'
              }`}
            />
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
              {editingPaymentId !== null
                ? 'ویرایش تراکنش مالی'
                : `ثبت مساعده یا تسویه — ${activeProjectName}`}
            </h2>
          </div>

          {editingPaymentId !== null && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>انصراف</span>
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">انتخاب کارگر</label>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm font-medium focus:border-emerald-600"
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
        {selectedWorkerAccrued && (
          <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-num">
            <span className="text-slate-600">مانده تا امروز:</span>
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold text-emerald-800">
                {formatToman(selectedWorkerAccrued.netPayableToToday)} تومان
              </span>
              {selectedWorkerAccrued.netPayableToToday > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAmount(String(selectedWorkerAccrued.netPayableToToday));
                    setPaymentType('salary');
                    setNote(`تسویه کامل کارکرد تا ${formatShamsiDayMonth(todayIso)}`);
                  }}
                  className="text-xs font-bold underline text-emerald-700 hover:text-emerald-900"
                >
                  درج کل مانده
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع تراکنش</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentType('advance')}
              className={`min-h-[42px] px-2 rounded-xl text-xs font-bold border transition-colors ${
                paymentType === 'advance'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              مساعده
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('salary')}
              className={`min-h-[42px] px-2 rounded-xl text-xs font-bold border transition-colors ${
                paymentType === 'salary'
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              تسویه حقوق
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('deduction')}
              className={`min-h-[42px] px-2 rounded-xl text-xs font-bold border transition-colors ${
                paymentType === 'deduction'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              کسر / خسارت
            </button>
          </div>
        </div>

        {/* Payment Date Selector */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
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
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              امروز ({formatShamsiDayMonth(todayIso)})
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono-num">
            <select
              value={payJd}
              onChange={(e) => setPayJd(Number(e.target.value))}
              className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
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
              onChange={(e) => {
                const nextM = Number(e.target.value);
                setPayJm(nextM);
                setPayJd((prev) => Math.min(prev, getShamsiMonthLength(payJy, nextM)));
              }}
              className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
            >
              {PERSIAN_MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={payJy}
              onChange={(e) => {
                const nextY = Number(e.target.value);
                setPayJy(nextY);
                setPayJd((prev) => Math.min(prev, getShamsiMonthLength(nextY, payJm)));
              }}
              className="h-11 sm:h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {toPersianDigits(y)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">مبلغ (تومان)</label>
            {amount && Number(amount) > 0 && (
              <span className="text-xs font-extrabold text-emerald-700 font-mono-num">
                {formatToman(Number(amount))} تومان
              </span>
            )}
          </div>
          <input
            type="number"
            step="any"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="مثلاً: 1500000"
            className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-bold font-mono-num focus:border-emerald-600"
            required
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[500000, 1000000, 2000000, 5000000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-mono-num font-semibold text-slate-700 transition-colors"
              >
                {formatToman(preset)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            توضیحات (کارت به کارت، نقدی، شماره پیگیری...)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثلاً: واریز به کارت بانک ملت"
            className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:border-emerald-600"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting || !workerId || !amount}
            className={`flex-1 min-h-[46px] rounded-xl text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
              editingPaymentId !== null
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-700 hover:bg-emerald-800'
            }`}
          >
            {editingPaymentId !== null ? (
              <>
                <Check className="w-4 h-4" />
                <span>ذخیره تغییرات</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>ثبت تراکنش</span>
              </>
            )}
          </button>

          {editingPaymentId !== null && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="min-h-[46px] px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors"
            >
              انصراف
            </button>
          )}
        </div>
      </form>

      {/* Payments History List */}
      <div
        className={`${
          mobileSection === 'list' ? 'block' : 'hidden lg:block'
        } lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl overflow-hidden`}
      >
        <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h3 className="text-[13px] sm:text-base font-extrabold text-slate-900 truncate">
              <span className="sm:hidden">تراکنش‌های مالی</span>
              <span className="hidden sm:inline">تراکنش‌های مالی — {activeProjectName}</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 font-mono-num mt-0.5 truncate">
              {toPersianDigits(filteredPayments.length)} رکورد ·{' '}
              <strong className="text-slate-800">{formatToman(filteredTotal)} ت</strong>
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
            <select
              value={filterWorkerId}
              onChange={(e) => setFilterWorkerId(e.target.value)}
              aria-label="فیلتر بر اساس کارگر"
              className="h-9 px-2.5 sm:px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 max-w-[135px] sm:max-w-none truncate"
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
          <div className="py-12 px-4 text-center space-y-2.5">
            <p className="text-xs sm:text-sm text-slate-500">
              هیچ مساعده یا پرداختی در این بخش ثبت نشده است.
            </p>
            <button
              type="button"
              onClick={() => setMobileSection('form')}
              className="lg:hidden h-9 px-4 rounded-xl bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت اولین تراکنش</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPayments.map((p) => {
              const isBeingEdited = editingPaymentId === p.id;
              const typeText =
                p.payment_type === 'advance'
                  ? 'مساعده'
                  : p.payment_type === 'salary'
                  ? 'تسویه'
                  : 'کسر';
              const amountColor =
                p.payment_type === 'deduction'
                  ? 'text-rose-700'
                  : p.payment_type === 'salary'
                  ? 'text-emerald-700'
                  : 'text-amber-700';

              return (
                <div
                  key={p.id}
                  className={`px-3.5 sm:px-5 py-3 sm:py-3.5 transition-colors ${
                    isBeingEdited ? 'bg-amber-50/70' : 'hover:bg-slate-50/70'
                  }`}
                >
                  {/* Top Line: Worker + Type (Right) | Amount (Left) */}
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] sm:text-sm font-extrabold text-slate-900 truncate">
                        {p.worker_name}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">· {typeText}</span>
                      {isBeingEdited && (
                        <span className="text-[11px] font-bold text-amber-700 shrink-0">
                          · ویرایش
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-[13px] sm:text-sm font-extrabold font-mono-num shrink-0 ${amountColor}`}
                    >
                      {formatToman(p.amount)}{' '}
                      <span className="text-[10px] sm:text-[11px] font-normal text-slate-400">
                        <span className="sm:hidden">ت</span>
                        <span className="hidden sm:inline">تومان</span>
                      </span>
                    </span>
                  </div>

                  {/* Bottom Line: Date + Note (Right) | Actions (Left) */}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 text-[11px] text-slate-500 font-mono-num truncate">
                      <span>{formatShamsiShort(p.payment_date)}</span>
                      {p.note && <span className="font-sans"> · {p.note}</span>}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(p)}
                        title="ویرایش این تراکنش"
                        aria-label="ویرایش این تراکنش"
                        className={`h-8 sm:h-8.5 px-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors ${
                          isBeingEdited
                            ? 'bg-amber-600 text-white'
                            : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">ویرایش</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingPaymentId === p.id) {
                            handleCancelEdit();
                          }
                          onDeletePayment(p.id);
                        }}
                        title="حذف این تراکنش"
                        aria-label="حذف این تراکنش"
                        className="h-8 w-8 sm:h-8.5 sm:w-8.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
