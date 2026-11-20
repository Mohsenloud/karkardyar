import React, { useState } from 'react';
import {
  UserPlus,
  Users,
  Edit2,
  Trash2,
  Phone,
  Database,
  Download,
  Upload,
  Server,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';
import { CalcMode, Project, Worker } from '../types';
import { downloadAuthenticatedFile } from './AuthView';
import {
  PERSIAN_MONTHS,
  formatShamsiDayMonth,
  formatToman,
  getShamsiMonthLength,
  getShamsiYearOptions,
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

interface WorkersViewProps {
  todayIso: string;
  projects: Project[];
  selectedProjectId: number | 'all';
  workers: Worker[];
  dbFileSizeKb: number;
  onSaveWorker: (
    payload: {
      id?: number;
      project_id: number;
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
      fridays_off?: number;
      active: number;
      notes: string;
    }
  ) => Promise<void>;
  onDeleteWorker: (id: number) => Promise<void>;
  onRestoreBackup: (data: any) => Promise<void>;
  onOpenSecurityModal?: () => void;
}

export const WorkersView: React.FC<WorkersViewProps> = ({
  todayIso,
  projects,
  selectedProjectId,
  workers,
  dbFileSizeKb,
  onSaveWorker,
  onDeleteWorker,
  onRestoreBackup,
  onOpenSecurityModal,
}) => {
  const todayShamsi = isoToShamsi(todayIso);

  const defaultProjectId =
    selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id ?? 1;

  const [showWorkersListModal, setShowWorkersListModal] = useState(false);
  const [mobileSection, setMobileSection] = useState<'list' | 'form' | 'db'>('list');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [workerProjectId, setWorkerProjectId] = useState<number>(defaultProjectId);

  React.useEffect(() => {
    if (!editingId) {
      setWorkerProjectId(defaultProjectId);
    }
  }, [defaultProjectId, editingId]);

  const [name, setName] = useState('');
  const [role, setRole] = useState('کارگر');
  const [phone, setPhone] = useState('');
  const [wageType, setWageType] = useState<'daily' | 'monthly'>('daily');
  const [baseWage, setBaseWage] = useState('1200000');
  const [overtimeRate, setOvertimeRate] = useState('150000');

  // Entry Date
  const [startJy, setStartJy] = useState<number>(todayShamsi.jy);
  const [startJm, setStartJm] = useState<number>(todayShamsi.jm);
  const [startJd, setStartJd] = useState<number>(todayShamsi.jd);

  // Exit Date
  const [hasEndDate, setHasEndDate] = useState<boolean>(false);
  const [endJy, setEndJy] = useState<number>(todayShamsi.jy);
  const [endJm, setEndJm] = useState<number>(todayShamsi.jm);
  const [endJd, setEndJd] = useState<number>(todayShamsi.jd);

  const [manualWorkedDays, setManualWorkedDays] = useState<string>('');
  const [autoCountDays, setAutoCountDays] = useState<number>(1);
  const [fridaysOff, setFridaysOff] = useState<boolean>(false);
  const [active, setActive] = useState(1);
  const [notes, setNotes] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [downloadingBackup, setDownloadingBackup] = useState<'sqlite' | 'json' | null>(null);

  const yearOptions = getShamsiYearOptions(todayShamsi.jy, [startJy, endJy]);
  const activeCount = workers.filter((w) => w.active === 1).length;

  const resetForm = () => {
    setEditingId(null);
    setWorkerProjectId(defaultProjectId);
    setName('');
    setRole('کارگر');
    setPhone('');
    setWageType('daily');
    setBaseWage('1200000');
    setOvertimeRate('150000');
    setStartJy(todayShamsi.jy);
    setStartJm(todayShamsi.jm);
    setStartJd(todayShamsi.jd);
    setHasEndDate(false);
    setEndJy(todayShamsi.jy);
    setEndJm(todayShamsi.jm);
    setEndJd(todayShamsi.jd);
    setManualWorkedDays('');
    setAutoCountDays(1);
    setFridaysOff(false);
    setActive(1);
    setNotes('');
  };

  const handleEdit = (w: Worker) => {
    setEditingId(w.id);
    setWorkerProjectId(w.project_id || defaultProjectId);
    setName(w.name);
    setRole(w.role);
    setPhone(w.phone || '');
    setWageType(w.wage_type);
    setBaseWage(String(w.base_wage));
    setOvertimeRate(String(w.overtime_rate));

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
    }

    setManualWorkedDays(
      w.manual_worked_days !== null && w.manual_worked_days !== undefined
        ? String(w.manual_worked_days)
        : ''
    );
    setAutoCountDays(w.auto_count_days ?? 1);
    setFridaysOff(Boolean(w.fridays_off));
    setActive(w.active);
    setNotes(w.notes || '');
    setShowWorkersListModal(false);
    setMobileSection('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const maxStartD = getShamsiMonthLength(startJy, startJm);
    const startIso = shamsiToIso(startJy, startJm, Math.min(startJd, maxStartD));

    let endIso: string | null = null;
    if (hasEndDate) {
      const maxEndD = getShamsiMonthLength(endJy, endJm);
      endIso = shamsiToIso(endJy, endJm, Math.min(endJd, maxEndD));
    }

    await onSaveWorker({
      id: editingId ?? undefined,
      project_id: workerProjectId || defaultProjectId,
      name: name.trim(),
      role: role.trim() || 'کارگر',
      phone: phone.trim(),
      wage_type: wageType,
      base_wage: Number(baseWage) || 0,
      overtime_rate: Number(overtimeRate) || 0,
      start_date: startIso,
      end_date: endIso,
      manual_worked_days:
        manualWorkedDays.trim() === '' ? null : Math.max(0, Number(manualWorkedDays)),
      auto_count_days: autoCountDays,
      fridays_off: wageType === 'daily' && fridaysOff ? 1 : 0,
      active,
      notes: notes.trim(),
    });
    resetForm();
    setMobileSection('list');
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        await onRestoreBackup(parsed);
        setRestoreMsg('فایل پشتیبان با موفقیت بازیابی شد.');
        setTimeout(() => setRestoreMsg(null), 4000);
      } catch {
        setRestoreMsg('خطا در خواندن فایل پشتیبان JSON');
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadBackup = async (kind: 'sqlite' | 'json') => {
    setDownloadingBackup(kind);
    try {
      const ok = await downloadAuthenticatedFile(
        kind === 'sqlite' ? '/api/backup/sqlite' : '/api/backup/json',
        kind === 'sqlite'
          ? `karkard-backup-${todayIso}.sqlite`
          : `karkard-backup-${todayIso}.json`
      );
      if (!ok) {
        setRestoreMsg('خطا در دانلود فایل پشتیبان. لطفاً مجدداً تلاش کنید.');
        setTimeout(() => setRestoreMsg(null), 4000);
      }
    } finally {
      setDownloadingBackup(null);
    }
  };

  return (
    <div className="space-y-3 lg:space-y-0">
      {/* Mobile 3-Tab Segmented Switcher (Workers Directory first) */}
      <div className="lg:hidden grid grid-cols-3 bg-slate-200/75 p-1 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => setMobileSection('list')}
          className={`h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
            mobileSection === 'list'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600'
          }`}
        >
          <span>کارگران</span>
          <span className="text-[11px] font-mono-num text-slate-400">
            ({toPersianDigits(workers.length)})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSection('form')}
          className={`h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
            mobileSection === 'form'
              ? editingId
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-emerald-700 text-white shadow-2xs'
              : 'text-slate-600'
          }`}
        >
          {editingId ? (
            <>
              <Edit2 className="w-3.5 h-3.5" />
              <span>ویرایش</span>
            </>
          ) : (
            <>
              <UserPlus className="w-3.5 h-3.5" />
              <span>افزودن</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setMobileSection('db')}
          className={`h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
            mobileSection === 'db'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>دیتابیس</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
        {/* Right Column (7 cols): Add / Edit Worker Form */}
        <form
          onSubmit={handleSubmit}
          className={`${
            mobileSection === 'form' ? 'block' : 'hidden lg:block'
          } lg:col-span-7 bg-white border rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 transition-colors ${
            editingId ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200/90'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <UserPlus
                className={`w-5 h-5 shrink-0 ${editingId ? 'text-amber-600' : 'text-emerald-700'}`}
              />
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                {editingId ? 'ویرایش مشخصات کارگر' : 'افزودن کارگر جدید'}
              </h2>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setMobileSection('list');
                }}
                className="h-8.5 px-3 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors shrink-0"
              >
                انصراف
              </button>
            )}
          </div>

        {/* Section 1: Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              پروژه مربوطه
            </label>
            <select
              value={workerProjectId}
              onChange={(e) => setWorkerProjectId(Number(e.target.value))}
              className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:border-emerald-600"
            >
              {projects.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              نام و نام خانوادگی *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: محمد حسینی"
              className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm focus:border-emerald-600"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              مهارت / سمت
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="مثلاً: استادکار، کارگر..."
              className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Section 2: Date Range */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800">
                تاریخ خروج (اختیاری)
              </label>
              <label className="text-xs text-slate-600 flex items-center gap-2 cursor-pointer select-none min-h-[32px]">
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
              <p className="text-xs text-slate-500">
                بدون تاریخ خروج مشخص — کارکرد از تاریخ ورود تا امروز محاسبه می‌شود.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              تعداد روز کارکرد دستی (خالی = محاسبه خودکار)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={manualWorkedDays}
              onChange={(e) => setManualWorkedDays(e.target.value)}
              placeholder="محاسبه خودکار از تقویم"
              className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-mono-num"
            />
          </div>
        </div>

        {/* Section 3: Contract & Wages */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-xs font-bold text-slate-800">نوع قرارداد</span>
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setWageType('daily')}
                className={`h-9 sm:h-8 px-4 rounded-lg text-xs font-bold transition-colors ${
                  wageType === 'daily'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                روزمزد
              </button>
              <button
                type="button"
                onClick={() => setWageType('monthly')}
                className={`h-9 sm:h-8 px-4 rounded-lg text-xs font-bold transition-colors ${
                  wageType === 'monthly'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ماهانه (۳۰ روز)
              </button>
            </div>
          </div>

          {wageType === 'daily' && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={fridaysOff}
                onChange={(e) => setFridaysOff(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded accent-amber-600 cursor-pointer shrink-0"
              />
              <div className="text-xs text-amber-950 leading-relaxed">
                <span className="font-bold block">تعطیلی خودکار جمعه‌ها (ویژه روزمزد)</span>
                <span className="text-[11px] text-amber-800">
                  جمعه‌ها ۰ روز محاسبه می‌شود؛ اگر کارگر جمعه‌ای کار کرد می‌توانید دستی فعال کنید.
                </span>
              </div>
            </label>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {wageType === 'daily' ? 'دستمزد هر روز (تومان)' : 'حقوق پایه ۳۰ روز (تومان)'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={baseWage}
                onChange={(e) => setBaseWage(e.target.value)}
                className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 text-sm font-mono-num font-bold"
                required
              />
              <span className="text-[11px] font-bold text-emerald-700 font-mono-num mt-1 block">
                {formatToman(Number(baseWage))} تومان
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                نرخ هر ساعت اضافه‌کاری (تومان)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={overtimeRate}
                onChange={(e) => setOvertimeRate(e.target.value)}
                className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 text-sm font-mono-num font-bold"
              />
              <span className="text-[11px] text-slate-500 font-mono-num mt-1 block">
                {formatToman(Number(overtimeRate))} تومان / ساعت
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                شماره موبایل
              </label>
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0912..."
                className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 text-sm font-mono-num text-right"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                وضعیت همکاری
              </label>
              <select
                value={active}
                onChange={(e) => setActive(Number(e.target.value))}
                className="w-full h-11 sm:h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-medium"
              >
                <option value={1}>فعال (مشغول به کار)</option>
                <option value={0}>بایگانی / تسویه‌شده</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-2 border-t border-slate-100">
          <button
            type="submit"
            className="w-full sm:w-fit h-11 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>{editingId ? 'ذخیره تغییرات کارگر' : 'ثبت کارگر جدید'}</span>
          </button>
        </div>
      </form>

      {/* Left Column (5 cols): Directory Quick List & Database Backup */}
      <div
        className={`${
          mobileSection === 'list' || mobileSection === 'db' ? 'block' : 'hidden lg:block'
        } lg:col-span-5 lg:sticky lg:top-20 space-y-4`}
      >
        {/* Workers Directory Card */}
        <section
          className={`${
            mobileSection === 'list' ? 'block' : 'hidden lg:block'
          } bg-white border border-slate-200/90 rounded-2xl overflow-hidden`}
        >
          <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[13px] sm:text-sm font-extrabold text-slate-900">
                فهرست کارگران
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 font-mono-num mt-0.5">
                {toPersianDigits(workers.length)} نفر · {toPersianDigits(activeCount)} فعال
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setMobileSection('form');
              }}
              className="lg:hidden h-8.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1 transition-colors shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>جدید</span>
            </button>
            <button
              type="button"
              onClick={() => setShowWorkersListModal(true)}
              className="hidden lg:inline-flex h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold items-center gap-1.5 transition-colors shrink-0"
            >
              <Users className="w-3.5 h-3.5 text-emerald-700" />
              <span>مشاهده همه</span>
            </button>
          </div>

          {workers.length === 0 ? (
            <div className="p-8 text-center space-y-2.5">
              <p className="text-xs text-slate-500">هنوز کارگری در این پروژه ثبت نشده است.</p>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setMobileSection('form');
                }}
                className="lg:hidden h-9 px-4 rounded-xl bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>افزودن اولین کارگر</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 lg:max-h-72 lg:overflow-y-auto">
              {workers.map((w, idx) => {
                const avatarTone = AVATAR_TONES[idx % AVATAR_TONES.length];
                return (
                  <div
                    key={w.id}
                    className={`px-3.5 sm:px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 transition-colors ${
                      w.active === 0 ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`hidden sm:flex w-8 h-8 rounded-lg border ${avatarTone} font-extrabold text-xs items-center justify-center shrink-0`}
                      >
                        {w.name.trim().charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[13px] sm:text-sm font-extrabold text-slate-900 truncate">
                            {w.name}
                          </span>
                          {w.active === 0 && (
                            <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                              · بایگانی
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num truncate mt-0.5">
                          {w.role} ·{' '}
                          {w.wage_type === 'daily' ? 'روزمزد' : 'ماهانه'}{' '}
                          {formatToman(w.base_wage)} ت
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {w.phone && (
                        <a
                          href={`tel:${w.phone}`}
                          title={`تماس با ${w.name}`}
                          aria-label={`تماس با ${w.name}`}
                          className="lg:hidden h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => handleEdit(w)}
                        title="ویرایش مشخصات"
                        aria-label="ویرایش مشخصات"
                        className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                        <span className="hidden sm:inline">ویرایش</span>
                      </button>

                      {/* Inline delete on mobile so no separate modal is needed */}
                      <div className="lg:hidden">
                        {confirmDeleteId === w.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteWorker(w.id);
                                setConfirmDeleteId(null);
                              }}
                              className="h-8 px-2 rounded-lg bg-rose-600 text-white text-[11px] font-bold"
                            >
                              حذف؟
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="h-8 px-2 rounded-lg bg-slate-100 text-[11px] text-slate-600 font-semibold"
                            >
                              لغو
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(w.id)}
                            title="حذف کارگر"
                            aria-label="حذف کارگر"
                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SQLite Database Backup & VPS Card */}
        <section
          className={`${
            mobileSection === 'db' ? 'block' : 'hidden lg:block'
          } bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4`}
        >
          <div className="flex items-start gap-2.5">
            <Database className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900">
                دیتابیس SQLite و پشتیبان‌گیری
              </h3>
              <p className="text-xs text-slate-500 font-mono-num mt-0.5 break-all">
                حجم دیتابیس: {toPersianDigits(dbFileSizeKb)} کیلوبایت
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={downloadingBackup !== null}
              onClick={() => handleDownloadBackup('sqlite')}
              className="h-10 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingBackup === 'sqlite' ? 'در حال دانلود...' : 'دانلود SQLite'}</span>
            </button>

            <button
              type="button"
              disabled={downloadingBackup !== null}
              onClick={() => handleDownloadBackup('json')}
              className="h-10 px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-50 whitespace-nowrap disabled:opacity-60 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingBackup === 'json' ? 'در حال دانلود...' : 'پشتیبان JSON'}</span>
            </button>

            <label className="h-10 px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-50 cursor-pointer whitespace-nowrap transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>بازیابی JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleJsonUpload}
                className="hidden"
              />
            </label>

            {onOpenSecurityModal && (
              <button
                type="button"
                onClick={onOpenSecurityModal}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-100 whitespace-nowrap transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>رمز و امنیت</span>
              </button>
            )}
          </div>

          {restoreMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
              {restoreMsg}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Server className="w-3.5 h-3.5 text-slate-500" />
              <span>بروزرسانی امن روی سرور VPS:</span>
            </div>
            <div
              dir="ltr"
              className="px-3 py-2 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto"
            >
              chmod +x deploy.sh && ./deploy.sh
            </div>
          </div>
        </section>
      </div>

      {/* Full Workers List Modal */}
      {showWorkersListModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setShowWorkersListModal(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-xl w-full max-h-[90dvh] flex flex-col shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
              <span className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  فهرست کامل کارگران ({toPersianDigits(workers.length)} نفر)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ویرایش اطلاعات، دستمزد یا حذف کارگر
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWorkersListModal(false)}
                aria-label="بستن"
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 overflow-y-auto">
              {workers.length === 0 ? (
                <p className="text-xs sm:text-sm text-slate-500 text-center py-10">
                  هیچ کارگری ثبت نشده است.
                </p>
              ) : (
                workers.map((w, idx) => {
                  const avatarTone = AVATAR_TONES[idx % AVATAR_TONES.length];
                  return (
                    <div
                      key={w.id}
                      className={`px-5 py-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors ${
                        w.active === 0 ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl border ${avatarTone} font-extrabold text-sm flex items-center justify-center shrink-0`}
                        >
                          {w.name.trim().charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-extrabold text-slate-900 truncate">
                              {w.name}
                            </span>
                            <span className="text-xs text-slate-500">
                              · {w.role}
                              {w.project_name ? ` · ${w.project_name}` : ''}
                              {w.active === 0 ? ' · غیرفعال' : ''}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono-num mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>ورود: {formatShamsiDayMonth(w.start_date)}</span>
                            {w.end_date && (
                              <span>· خروج: {formatShamsiDayMonth(w.end_date)}</span>
                            )}
                            <span>
                              ·{' '}
                              {w.wage_type === 'daily'
                                ? `روزمزد ${formatToman(w.base_wage)} ت`
                                : `ماهانه ${formatToman(w.base_wage)} ت`}
                            </span>
                            {w.phone && (
                              <a
                                href={`tel:${w.phone}`}
                                className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
                              >
                                <Phone className="w-3 h-3" />
                                <span>{toPersianDigits(w.phone)}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEdit(w)}
                          className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>ویرایش</span>
                        </button>

                        {confirmDeleteId === w.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteWorker(w.id);
                                setConfirmDeleteId(null);
                              }}
                              className="h-9 px-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold"
                            >
                              تایید حذف
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="h-9 px-2.5 rounded-xl bg-slate-100 text-xs text-slate-600 font-semibold"
                            >
                              لغو
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(w.id)}
                            className="h-9 w-9 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                            title="حذف کارگر"
                            aria-label="حذف کارگر"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowWorkersListModal(false)}
                className="h-10 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
