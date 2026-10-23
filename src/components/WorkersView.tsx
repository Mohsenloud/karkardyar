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
} from 'lucide-react';
import { CalcMode, Project, Worker } from '../types';
import {
  PERSIAN_MONTHS,
  formatShamsiDayMonth,
  formatToman,
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
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
  },
  {
    cardBg: 'bg-gradient-to-br from-sky-50 via-blue-50/90 to-indigo-50/80',
    cardBorder: 'border-sky-200',
    avatarBg: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white',
  },
  {
    cardBg: 'bg-gradient-to-br from-amber-50 via-orange-50/85 to-yellow-50/80',
    cardBorder: 'border-amber-200',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
  },
  {
    cardBg: 'bg-gradient-to-br from-violet-50 via-indigo-50/90 to-purple-50/80',
    cardBorder: 'border-violet-200',
    avatarBg: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white',
  },
  {
    cardBg: 'bg-gradient-to-br from-rose-50 via-pink-50/85 to-red-50/75',
    cardBorder: 'border-rose-200',
    avatarBg: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white',
  },
];

interface WorkersViewProps {
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
      active: number;
      notes: string;
    }
  ) => Promise<void>;
  onDeleteWorker: (id: number) => Promise<void>;
  onRestoreBackup: (data: any) => Promise<void>;
}

export const WorkersView: React.FC<WorkersViewProps> = ({
  projects,
  selectedProjectId,
  workers,
  dbFileSizeKb,
  onSaveWorker,
  onDeleteWorker,
  onRestoreBackup,
}) => {
  const todayIso = getTodayIso();
  const todayShamsi = isoToShamsi(todayIso);

  const defaultProjectId =
    selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id ?? 1;

  const [showWorkersListModal, setShowWorkersListModal] = useState(false);

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

  // Entry Date (تاریخ ورود - مثلاً ۵ مهر)
  const [startJy, setStartJy] = useState<number>(todayShamsi.jy);
  const [startJm, setStartJm] = useState<number>(7);
  const [startJd, setStartJd] = useState<number>(5);

  // Exit Date (تاریخ خروج - مثلاً ۲۳ آبان)
  const [hasEndDate, setHasEndDate] = useState<boolean>(true);
  const [endJy, setEndJy] = useState<number>(todayShamsi.jy);
  const [endJm, setEndJm] = useState<number>(8);
  const [endJd, setEndJd] = useState<number>(23);

  const [manualWorkedDays, setManualWorkedDays] = useState<string>('');
  const [autoCountDays, setAutoCountDays] = useState<number>(1);
  const [active, setActive] = useState(1);
  const [notes, setNotes] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

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
    setStartJm(7);
    setStartJd(5);
    setHasEndDate(true);
    setEndJy(todayShamsi.jy);
    setEndJm(8);
    setEndJd(23);
    setManualWorkedDays('');
    setAutoCountDays(1);
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
    setActive(w.active);
    setNotes(w.notes || '');
    setShowWorkersListModal(false);
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
      active,
      notes: notes.trim(),
    });
    resetForm();
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Add / Edit Worker Form Card + Button to Open Workers List Modal */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-emerald-100 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              {editingId ? 'ویرایش مشخصات کارگر' : 'افزودن کارگر جدید'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="w-fit h-8 px-2.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100"
              >
                انصراف
              </button>
            )}

            {/* Trigger Button to Open Workers List in Separate Modal Window */}
            <button
              type="button"
              onClick={() => setShowWorkersListModal(true)}
              className="w-fit h-8 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>فهرست کارگران ({toPersianDigits(workers.length)} نفر)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              پروژه مربوطه *
            </label>
            <select
              value={workerProjectId}
              onChange={(e) => setWorkerProjectId(Number(e.target.value))}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-emerald-800 focus:outline-none focus:border-emerald-600"
            >
              {projects.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              نام و نام خانوادگی *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: محمد حسینی"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-emerald-600"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              مهارت / سمت
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="مثلاً: استادکار، کارگر ساده..."
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Entry & Exit Date Range */}
        <div className="p-3 rounded-xl bg-emerald-50/40 border border-emerald-200/70 space-y-2.5">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              تاریخ ورود (شروع کار — مثلاً ۵ مهر)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={startJd}
                onChange={(e) => setStartJd(Number(e.target.value))}
                className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
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
                className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs"
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

          <div className="pt-2 border-t border-emerald-200/60">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800">
                تاریخ خروج (پایان دوره — مثلاً ۲۳ آبان)
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
                  className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
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
                  className="h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs"
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
              <p className="text-[11px] text-slate-500">
                بدون تاریخ خروج مشخص (کارکرد از تاریخ ورود تا امروز محاسبه می‌شود)
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-emerald-200/60">
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              تعداد روز کارکرد دستی (اختیاری — خالی = محاسبه خودکار)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={manualWorkedDays}
              onChange={(e) => setManualWorkedDays(e.target.value)}
              placeholder="محاسبه خودکار"
              className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-num"
            />
          </div>
        </div>

        {/* Wage Type & Rates */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">نوع قرارداد:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWageType('daily')}
              className={`w-fit h-8 px-3 rounded-lg text-xs font-bold border transition-all ${
                wageType === 'daily'
                  ? 'bg-gradient-to-l from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              روزمزد
            </button>
            <button
              type="button"
              onClick={() => setWageType('monthly')}
              className={`w-fit h-8 px-3 rounded-lg text-xs font-bold border transition-all ${
                wageType === 'monthly'
                  ? 'bg-gradient-to-l from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              ماهانه (۳۰ روز)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {wageType === 'daily' ? 'دستمزد هر روز (تومان)' : 'حقوق پایه ۳۰ روز (تومان)'}
            </label>
            <input
              type="number"
              step="50000"
              value={baseWage}
              onChange={(e) => setBaseWage(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono-num"
              required
            />
            <span className="text-[10px] font-bold text-emerald-700 font-mono-num mt-0.5 block">
              {formatToman(Number(baseWage))} تومان
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              نرخ هر ساعت اضافه‌کاری (تومان)
            </label>
            <input
              type="number"
              step="10000"
              value={overtimeRate}
              onChange={(e) => setOvertimeRate(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono-num"
            />
            <span className="text-[10px] text-slate-500 font-mono-num mt-0.5 block">
              {formatToman(Number(overtimeRate))} تومان / ساعت
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">شماره موبایل</label>
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912..."
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono-num text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">وضعیت همکاری</label>
            <select
              value={active}
              onChange={(e) => setActive(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
            >
              <option value={1}>فعال (مشغول به کار)</option>
              <option value={0}>بایگانی / تسویه‌شده</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            className="w-fit h-9 px-5 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs shadow-emerald-600/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{editingId ? 'ذخیره تغییرات کارگر' : 'ثبت کارگر جدید'}</span>
          </button>
        </div>
      </form>

      {/* SQLite Database Backup & VPS Guide Section */}
      <section className="bg-white border border-emerald-100 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                دیتابیس SQLite و پشتیبان‌گیری روی VPS
              </h3>
              <p className="text-[11px] text-slate-500 font-mono-num">
                مسیر: <code dir="ltr">./data/karkard.sqlite</code> · حجم:{' '}
                {toPersianDigits(dbFileSizeKb)} کیلوبایت
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href="/api/backup/sqlite"
              download
              className="w-fit h-8 px-3 rounded-lg bg-gradient-to-l from-emerald-500 to-teal-600 text-white text-[11px] font-bold inline-flex items-center gap-1 hover:from-emerald-600 hover:to-teal-700 shadow-2xs whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود SQLite</span>
            </a>

            <a
              href="/api/backup/json"
              download
              className="w-fit h-8 px-3 rounded-lg border border-slate-200 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-slate-100 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>پشتیبان JSON</span>
            </a>

            <label className="w-fit h-8 px-3 rounded-lg border border-slate-200 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-slate-100 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              <span>بازیابی</span>
              <input
                type="file"
                accept=".json"
                onChange={handleJsonUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {restoreMsg && (
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-900 text-xs font-medium">
            {restoreMsg}
          </div>
        )}

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <Server className="w-3.5 h-3.5 text-slate-600" />
            <span>راهنمای اجرای دائمی روی سرور شخصی (VPS):</span>
          </div>
          <div
            dir="ltr"
            className="p-2 rounded-lg bg-slate-900 text-slate-100 font-mono text-[10px] overflow-x-auto"
          >
            docker compose up -d --build
          </div>
        </div>
      </section>

      {/* Separate Modal Window for Workers List (فهرست کارگران) */}
      {showWorkersListModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowWorkersListModal(false)}
        >
          <div
            className="bg-white border border-emerald-100 rounded-2xl max-w-lg w-full p-4 sm:p-5 space-y-3.5 max-h-[85vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  فهرست کارگران ({toPersianDigits(workers.length)} نفر)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWorkersListModal(false)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto pr-0.5">
              {workers.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  هیچ کارگری ثبت نشده است.
                </p>
              ) : (
                workers.map((w, idx) => {
                  const theme = WORKER_LIGHT_THEMES[idx % WORKER_LIGHT_THEMES.length];
                  return (
                    <div
                      key={w.id}
                      className={`${theme.cardBg} border ${theme.cardBorder} rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 ${
                        w.active === 0 ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl ${theme.avatarBg} font-extrabold text-sm flex items-center justify-center shrink-0`}
                        >
                          {w.name.trim().charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-extrabold text-slate-900 truncate">
                              {w.name}
                            </span>
                            {w.project_name && (
                              <span className="w-fit px-1.5 py-0.5 rounded-md bg-white/90 border border-slate-200 text-[9px] font-bold text-slate-700">
                                {w.project_name}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-500">
                              · {w.role} {w.active === 0 ? '(غیرفعال)' : ''}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono-num mt-0.5 flex flex-wrap items-center gap-1.5">
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
                                className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold hover:underline"
                              >
                                <Phone className="w-2.5 h-2.5" />
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
                          className="w-fit h-8 px-2.5 rounded-lg bg-white border border-white text-[11px] font-bold text-slate-700 hover:text-emerald-700 inline-flex items-center gap-1 shadow-2xs"
                        >
                          <Edit2 className="w-3 h-3 text-emerald-600" />
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
                              className="w-fit h-8 px-2 rounded-lg bg-rose-600 text-white text-[11px] font-bold"
                            >
                              حذف
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="w-fit h-8 px-2 rounded-lg bg-white text-[11px] text-slate-600"
                            >
                              لغو
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(w.id)}
                            className="h-8 w-8 rounded-lg bg-white/90 text-slate-400 hover:text-rose-600 flex items-center justify-center shadow-2xs"
                            title="حذف کارگر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowWorkersListModal(false)}
                className="w-fit h-8 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                بستن پنجره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
