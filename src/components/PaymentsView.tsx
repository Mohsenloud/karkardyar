import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Wallet,
  Filter,
  Calendar,
  Edit2,
  Check,
  X,
  Camera,
  Image as ImageIcon,
  Lock,
} from 'lucide-react';
import {
  AccruedToTodaySummary,
  LockedMonthRecord,
  PaymentRecord,
  PaymentType,
  Worker,
} from '../types';
import { getAuthHeaders } from './AuthView';
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

const PAYMENT_CATEGORIES = [
  { value: 'general', label: 'عمومی' },
  { value: 'food_transport', label: 'غذا و ایاب‌وذهاب' },
  { value: 'bonus', label: 'پاداش / حق مسئولیت' },
  { value: 'insurance', label: 'بیمه / کسورات قانونی' },
  { value: 'damage', label: 'خسارت / جریمه' },
];

interface PaymentsViewProps {
  activeProjectName?: string;
  selectedProjectId: number | 'all';
  todayIso: string;
  workers: Worker[];
  accruedSummaries: AccruedToTodaySummary[];
  payments: PaymentRecord[];
  lockedMonths?: LockedMonthRecord[];
  onAddPayment: (payload: {
    worker_id: number;
    payment_date: string;
    shamsi_year: number;
    shamsi_month: number;
    amount: number;
    payment_type: PaymentType;
    category?: string;
    note: string;
    receipt_data?: string | null;
  }) => Promise<void>;
  onUpdatePayment: (payload: {
    id: number;
    worker_id: number;
    payment_date: string;
    shamsi_year: number;
    shamsi_month: number;
    amount: number;
    payment_type: PaymentType;
    category?: string;
    note: string;
    receipt_data?: string | null;
    remove_receipt?: boolean;
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
  lockedMonths = [],
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

  const [paymentType, setPaymentType] = useState<PaymentType>('advance');
  const [category, setCategory] = useState<string>('general');
  const [payJy, setPayJy] = useState<number>(initialSh.jy);
  const [payJm, setPayJm] = useState<number>(initialSh.jm);
  const [payJd, setPayJd] = useState<number>(initialSh.jd);
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [receiptData, setReceiptData] = useState<string | null>(null);
  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const [filterWorkerId, setFilterWorkerId] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);
  const [mobileSection, setMobileSection] = useState<'list' | 'form'>('list');

  // Receipt lightbox state
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  const [viewingReceiptTitle, setViewingReceiptTitle] = useState<string>('');
  const [loadingReceipt, setLoadingReceipt] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (viewingReceiptUrl) {
        URL.revokeObjectURL(viewingReceiptUrl);
      }
    };
  }, [viewingReceiptUrl]);

  // Reset filter & editing mode only when switching project
  useEffect(() => {
    setFilterWorkerId('all');
    setEditingPaymentId(null);
  }, [selectedProjectId]);

  // Keep selected worker valid if the worker list changes
  useEffect(() => {
    if (!workers.some((w) => String(w.id) === workerId)) {
      const firstActive = workers.find((w) => w.active === 1) || workers[0];
      setWorkerId(firstActive ? String(firstActive.id) : '');
    }
    if (filterWorkerId !== 'all' && !workers.some((w) => String(w.id) === filterWorkerId)) {
      setFilterWorkerId('all');
    }
  }, [workers, workerId, filterWorkerId]);

  const selectedWorker = workers.find((w) => String(w.id) === workerId);
  const selectedWorkerAccrued = accruedSummaries.find((a) => a.workerId === Number(workerId));
  const yearOptions = getShamsiYearOptions(initialSh.jy, [payJy]);

  const targetProjectId =
    selectedWorker?.project_id || (selectedProjectId !== 'all' ? selectedProjectId : 0);

  const isSelectedMonthLocked = lockedMonths.some(
    (l) =>
      l.shamsi_year === payJy &&
      l.shamsi_month === payJm &&
      (l.project_id === 0 || l.project_id === targetProjectId)
  );

  const isPaymentLocked = (p: PaymentRecord): boolean =>
    lockedMonths.some(
      (l) =>
        l.shamsi_year === p.shamsi_year &&
        l.shamsi_month === p.shamsi_month &&
        (l.project_id === 0 || l.project_id === (p.project_id || 0))
    );

  const handleOpenReceipt = async (receiptPath: string, label: string) => {
    setLoadingReceipt(true);
    setViewingReceiptTitle(label);
    try {
      const res = await fetch(`/api/receipts/${encodeURIComponent(receiptPath)}`, {
        headers: getAuthHeaders(),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setReceiptError('خطا در بارگذاری تصویر رسید');
        return;
      }
      const blob = await res.blob();
      if (viewingReceiptUrl) {
        URL.revokeObjectURL(viewingReceiptUrl);
      }
      setViewingReceiptUrl(URL.createObjectURL(blob));
    } catch {
      setReceiptError('امکان مشاهده تصویر رسید وجود ندارد');
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleCloseReceiptModal = () => {
    if (viewingReceiptUrl) {
      URL.revokeObjectURL(viewingReceiptUrl);
    }
    setViewingReceiptUrl(null);
    setViewingReceiptTitle('');
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setReceiptError(null);
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setReceiptError('فقط تصاویر JPG، PNG یا WebP مجاز هستند.');
      return;
    }
    if (file.size > 4.5 * 1024 * 1024) {
      setReceiptError('حجم تصویر رسید نباید بیشتر از ۴٫۵ مگابایت باشد.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resStr = typeof reader.result === 'string' ? reader.result : null;
      if (resStr) {
        setReceiptData(resStr);
        setRemoveReceipt(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStartEdit = (p: PaymentRecord) => {
    setEditingPaymentId(p.id);
    setWorkerId(String(p.worker_id));
    setPaymentType(p.payment_type);
    setCategory(p.category || 'general');
    const sh = isoToShamsi(p.payment_date || todayIso);
    setPayJy(sh.jy);
    setPayJm(sh.jm);
    setPayJd(sh.jd);
    setAmount(String(p.amount));
    setNote(p.note || '');
    setReceiptData(null);
    setExistingReceiptPath(p.receipt_path || null);
    setRemoveReceipt(false);
    setReceiptError(null);
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
    setCategory('general');
    setReceiptData(null);
    setExistingReceiptPath(null);
    setRemoveReceipt(false);
    setReceiptError(null);
    setMobileSection('list');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !amount || Number(amount) <= 0 || isSelectedMonthLocked) return;
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
          category,
          note: note.trim(),
          receipt_data: receiptData,
          remove_receipt: removeReceipt,
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
          category,
          note: note.trim(),
          receipt_data: receiptData,
        });
      }
      setAmount('');
      setNote('');
      setCategory('general');
      setReceiptData(null);
      setExistingReceiptPath(null);
      setRemoveReceipt(false);
      setReceiptError(null);
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
      {/* Mobile Segmented Switcher */}
      <div className="lg:hidden grid grid-cols-2 bg-zinc-200/70 ring-1 ring-inset ring-zinc-950/5 p-1 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => setMobileSection('list')}
          className={`h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
            mobileSection === 'list'
              ? 'bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-950/5'
              : 'text-zinc-600'
          }`}
        >
          <span>لیست پرداختی‌ها</span>
          <span className="text-[11px] font-mono-num text-zinc-400">
            ({toPersianDigits(payments.length)})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSection('form')}
          className={`h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
            mobileSection === 'form'
              ? editingPaymentId !== null
                ? 'bg-amber-600 text-white shadow-xs inset-ring inset-ring-white/15'
                : 'bg-zinc-950 text-white shadow-xs inset-ring inset-ring-white/10'
              : 'text-zinc-600'
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
        {/* New / Edit Payment Form */}
        <form
          onSubmit={handleSubmit}
          className={`${
            mobileSection === 'form' ? 'block' : 'hidden lg:block'
          } lg:col-span-5 lg:sticky lg:top-6 bg-white rounded-2xl p-4 sm:p-5 space-y-3.5 sm:space-y-4 transition-all shadow-2xs ${
            editingPaymentId !== null
              ? 'ring-2 ring-amber-500/40'
              : 'ring-1 ring-zinc-950/10'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-950/5">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet
                className={`w-4.5 h-4.5 shrink-0 ${
                  editingPaymentId !== null ? 'text-amber-600' : 'text-emerald-600'
                }`}
              />
              <h2 className="text-sm sm:text-[15px] font-extrabold text-zinc-950 tracking-tight truncate">
                {editingPaymentId !== null
                  ? 'ویرایش تراکنش مالی'
                  : `ثبت تراکنش — ${activeProjectName}`}
              </h2>
            </div>

            {editingPaymentId !== null && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="h-8 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 text-xs font-bold inline-flex items-center gap-1 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>انصراف</span>
              </button>
            )}
          </div>

          {isSelectedMonthLocked && (
            <div className="p-3 rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-600/20 text-amber-900 text-xs font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                ماه {PERSIAN_MONTHS[payJm - 1]} {toPersianDigits(payJy)} قفل است؛ برای ثبت تراکنش در
                این ماه ابتدا قفل را باز کنید.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1.5">انتخاب کارگر</label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="w-full h-10.5 px-3.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-medium hover:border-zinc-950/25 focus:border-zinc-950"
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
            <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 ring-1 ring-inset ring-emerald-600/15 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-num">
              <span className="text-zinc-600">مانده تا امروز:</span>
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
            <label className="block text-xs font-bold text-zinc-700 mb-1.5">نوع تراکنش</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setPaymentType('advance')}
                className={`min-h-[38px] px-2 rounded-lg text-xs font-bold transition-colors ${
                  paymentType === 'advance'
                    ? 'bg-amber-600 text-white shadow-xs inset-ring inset-ring-white/15'
                    : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100'
                }`}
              >
                مساعده
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('salary')}
                className={`min-h-[38px] px-2 rounded-lg text-xs font-bold transition-colors ${
                  paymentType === 'salary'
                    ? 'bg-emerald-600 text-white shadow-xs inset-ring inset-ring-white/15'
                    : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100'
                }`}
              >
                تسویه
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('allowance')}
                className={`min-h-[38px] px-2 rounded-lg text-xs font-bold transition-colors ${
                  paymentType === 'allowance'
                    ? 'bg-sky-600 text-white shadow-xs inset-ring inset-ring-white/15'
                    : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100'
                }`}
              >
                مزایا / پاداش
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('deduction')}
                className={`min-h-[38px] px-2 rounded-lg text-xs font-bold transition-colors ${
                  paymentType === 'deduction'
                    ? 'bg-rose-600 text-white shadow-xs inset-ring inset-ring-white/15'
                    : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100'
                }`}
              >
                کسر / خسارت
              </button>
            </div>
          </div>

          {/* Payment Date Selector */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-700 inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <span>تاریخ ثبت</span>
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
                className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
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
                className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
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
                className="h-10 px-2.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
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
              <label className="text-xs font-bold text-zinc-700">مبلغ (تومان)</label>
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
              className="w-full h-10.5 px-3.5 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-bold font-mono-num hover:border-zinc-950/25 focus:border-zinc-950"
              required
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[500000, 1000000, 2000000, 5000000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className="h-8 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-xs font-mono-num font-semibold text-zinc-700 transition-colors"
                >
                  {formatToman(preset)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">بابت / دسته‌بندی</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold text-zinc-800"
              >
                {PAYMENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">توضیحات</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="کارت به کارت، نقدی..."
                className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs sm:text-sm hover:border-zinc-950/25 focus:border-zinc-950"
              />
            </div>
          </div>

          {/* Receipt Image Attachment */}
          <div className="pt-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-zinc-700 inline-flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-zinc-500" />
                <span>تصویر رسید پرداخت (اختیاری)</span>
              </label>
              <label className="h-8 px-2.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 ring-1 ring-zinc-950/10 text-xs font-bold text-zinc-700 inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>{receiptData ? 'تغییر تصویر' : 'انتخاب عکس'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleReceiptFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {receiptError && (
              <p className="text-[11px] font-semibold text-rose-600">{receiptError}</p>
            )}

            {receiptData && (
              <div className="relative rounded-xl overflow-hidden ring-1 ring-zinc-950/10 bg-zinc-50 p-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={receiptData}
                    alt="پیش‌نمایش رسید"
                    className="w-12 h-12 rounded-lg object-cover ring-1 ring-zinc-950/10 shrink-0"
                  />
                  <span className="text-xs font-semibold text-zinc-700 truncate">
                    تصویر رسید آماده ذخیره
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReceiptData(null)}
                  className="h-8 px-2.5 rounded-lg bg-white ring-1 ring-zinc-950/10 text-rose-600 hover:bg-rose-50 text-xs font-bold shrink-0"
                >
                  حذف
                </button>
              </div>
            )}

            {!receiptData && existingReceiptPath && !removeReceipt && (
              <div className="rounded-xl ring-1 ring-zinc-950/10 bg-zinc-50 px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleOpenReceipt(existingReceiptPath, 'رسید ثبت‌شده')}
                  className="font-bold text-emerald-700 hover:underline inline-flex items-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>مشاهده رسید فعلی</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveReceipt(true)}
                  className="text-rose-600 font-bold hover:underline"
                >
                  حذف رسید
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || !workerId || !amount || isSelectedMonthLocked}
              className={`flex-1 min-h-[44px] rounded-lg text-white shadow-xs inset-ring inset-ring-white/15 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                editingPaymentId !== null
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-zinc-950 hover:bg-zinc-800'
              }`}
            >
              {editingPaymentId !== null ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>ذخیره تغییرات</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>ثبت تراکنش</span>
                </>
              )}
            </button>

            {editingPaymentId !== null && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="min-h-[44px] px-4 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-zinc-700 text-xs font-bold transition-colors"
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
          } lg:col-span-7 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl overflow-hidden`}
        >
          <div className="px-3.5 sm:px-5 py-3 sm:py-4 bg-zinc-50/70 border-b border-zinc-950/5 flex items-center justify-between gap-2.5">
            <div className="min-w-0">
              <h3 className="text-[13px] sm:text-[15px] font-extrabold text-zinc-950 tracking-tight truncate">
                <span className="sm:hidden">تراکنش‌های مالی</span>
                <span className="hidden sm:inline">تراکنش‌های مالی — {activeProjectName}</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-zinc-500 font-mono-num mt-0.5 truncate">
                {toPersianDigits(filteredPayments.length)} رکورد ·{' '}
                <strong className="text-zinc-900">{formatToman(filteredTotal)} ت</strong>
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0 hidden sm:block" />
              <select
                value={filterWorkerId}
                onChange={(e) => setFilterWorkerId(e.target.value)}
                aria-label="فیلتر بر اساس کارگر"
                className="h-9 px-2.5 sm:px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold text-zinc-700 max-w-[135px] sm:max-w-none truncate"
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
              <p className="text-xs sm:text-sm text-zinc-500">
                هیچ مساعده یا پرداختی در این بخش ثبت نشده است.
              </p>
              <button
                type="button"
                onClick={() => setMobileSection('form')}
                className="lg:hidden h-9 px-4 rounded-lg bg-zinc-950 text-white shadow-xs inset-ring inset-ring-white/10 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>ثبت اولین تراکنش</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-950/5">
              {filteredPayments.map((p) => {
                const isBeingEdited = editingPaymentId === p.id;
                const locked = isPaymentLocked(p);
                const typeText =
                  p.payment_type === 'advance'
                    ? 'مساعده'
                    : p.payment_type === 'salary'
                    ? 'تسویه'
                    : p.payment_type === 'allowance'
                    ? 'مزایا'
                    : 'کسر';
                const amountColor =
                  p.payment_type === 'deduction'
                    ? 'text-rose-700'
                    : p.payment_type === 'salary'
                    ? 'text-emerald-700'
                    : p.payment_type === 'allowance'
                    ? 'text-sky-700'
                    : 'text-amber-700';

                return (
                  <div
                    key={p.id}
                    className={`px-3.5 sm:px-5 py-3 sm:py-3.5 transition-colors ${
                      isBeingEdited
                        ? 'bg-amber-50/70'
                        : p.period_archived
                        ? 'bg-zinc-50/40 opacity-80'
                        : 'hover:bg-zinc-50/70'
                    }`}
                  >
                    {/* Top Line: Worker + Type (Right) | Amount (Left) */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="text-[13px] sm:text-sm font-extrabold text-zinc-950 truncate">
                          {p.worker_name}
                        </span>
                        <span className="text-[11px] text-zinc-400 shrink-0">· {typeText}</span>
                        {p.period_archived === 1 && (
                          <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                            دوره قبل
                          </span>
                        )}
                        {locked && (
                          <span className="text-[10px] font-semibold text-amber-700 inline-flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" />
                            قفل
                          </span>
                        )}
                        {isBeingEdited && (
                          <span className="text-[11px] font-bold text-amber-700 shrink-0">
                            · ویرایش
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-[13px] sm:text-sm font-extrabold font-mono-num shrink-0 ${amountColor}`}
                      >
                        {p.payment_type === 'allowance' ? '+' : ''}
                        {formatToman(p.amount)}{' '}
                        <span className="text-[10px] sm:text-[11px] font-normal text-zinc-400">
                          <span className="sm:hidden">ت</span>
                          <span className="hidden sm:inline">تومان</span>
                        </span>
                      </span>
                    </div>

                    {/* Bottom Line: Date + Note (Right) | Actions (Left) */}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 text-[11px] text-zinc-500 font-mono-num truncate">
                        <span>{formatShamsiShort(p.payment_date)}</span>
                        {p.note && <span className="font-sans"> · {p.note}</span>}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {p.receipt_path && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenReceipt(
                                p.receipt_path!,
                                `رسید ${p.worker_name} — ${formatShamsiShort(p.payment_date)}`
                              )
                            }
                            title="مشاهده عکس رسید"
                            aria-label="مشاهده عکس رسید"
                            className="h-8 px-2 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-inset ring-emerald-600/20 inline-flex items-center gap-1 transition-colors"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">رسید</span>
                          </button>
                        )}
                        {!locked && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(p)}
                              title="ویرایش این تراکنش"
                              aria-label="ویرایش این تراکنش"
                              className={`h-8 px-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors ${
                                isBeingEdited
                                  ? 'bg-amber-600 text-white shadow-xs'
                                  : 'text-zinc-700 bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50'
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
                              className="h-8 w-8 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Receipt Image Lightbox Modal */}
      {(viewingReceiptUrl || loadingReceipt) && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={handleCloseReceiptModal}
        >
          <div
            className="bg-white ring-1 ring-zinc-950/10 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-950/5">
              <h3 className="text-xs sm:text-sm font-extrabold text-zinc-950 truncate">
                {viewingReceiptTitle || 'تصویر رسید پرداخت'}
              </h3>
              <button
                type="button"
                onClick={handleCloseReceiptModal}
                aria-label="بستن"
                className="w-8 h-8 rounded-lg ring-1 ring-zinc-950/10 flex items-center justify-center text-zinc-500 hover:bg-zinc-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-zinc-50 flex items-center justify-center min-h-[220px]">
              {loadingReceipt ? (
                <span className="text-xs text-zinc-500">در حال بارگذاری تصویر رسید...</span>
              ) : viewingReceiptUrl ? (
                <img
                  src={viewingReceiptUrl}
                  alt={viewingReceiptTitle}
                  className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-sm"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
