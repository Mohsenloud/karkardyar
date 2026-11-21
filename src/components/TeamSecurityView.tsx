import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Users,
  History,
  CloudUpload,
  Trash2,
  Check,
  Download,
  RefreshCw,
  Send,
  KeyRound,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  AppUser,
  AuditLogRecord,
  AutoBackupFile,
  AutoBackupSettings,
  Project,
} from '../types';
import { downloadAuthenticatedFile, getAuthHeaders } from './AuthView';
import { toPersianDigits } from '../utils/jalali';

interface TeamSecurityViewProps {
  projects: Project[];
  currentUserId: number;
  onShowToast: (msg: string) => void;
}

export const TeamSecurityView: React.FC<TeamSecurityViewProps> = ({
  projects,
  currentUserId,
  onShowToast,
}) => {
  const [section, setSection] = useState<'users' | 'audit' | 'backup'>('users');

  // Users state
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'supervisor' | 'admin'>('supervisor');
  const [newAssignedProjId, setNewAssignedProjId] = useState<number>(projects[0]?.id || 1);
  const [userError, setUserError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditFilter, setAuditFilter] = useState<string>('');

  // Auto-backup state
  const [backupSettings, setBackupSettings] = useState<AutoBackupSettings>({
    enabled: false,
    intervalHours: 24,
    keepCount: 14,
    telegramEnabled: false,
    telegramChatId: '',
    hasTelegramToken: false,
    lastRunAt: null,
    lastStatus: null,
  });
  const [telegramTokenInput, setTelegramTokenInput] = useState('');
  const [autoFiles, setAutoFiles] = useState<AutoBackupFile[]>([]);
  const [savingBackup, setSavingBackup] = useState(false);
  const [runningBackupNow, setRunningBackupNow] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/users', {
        credentials: 'same-origin',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const q = auditFilter ? `?entity_type=${encodeURIComponent(auditFilter)}&limit=150` : '?limit=150';
      const res = await fetch(`/api/audit-logs${q}`, {
        credentials: 'same-origin',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } finally {
      setLoadingAudit(false);
    }
  }, [auditFilter]);

  const fetchBackupSettings = useCallback(async () => {
    const res = await fetch('/api/backup/settings', {
      credentials: 'same-origin',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.settings) setBackupSettings(data.settings);
      setAutoFiles(data.files || []);
    }
  }, []);

  useEffect(() => {
    if (section === 'users') fetchUsers();
    else if (section === 'audit') fetchAuditLogs();
    else if (section === 'backup') fetchBackupSettings();
  }, [section, fetchUsers, fetchAuditLogs, fetchBackupSettings]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    setSavingUser(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          username: newUsername.trim(),
          display_name: newDisplayName.trim() || newUsername.trim(),
          password: newPassword,
          role: newRole,
          assigned_project_id: newRole === 'supervisor' ? newAssignedProjId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUserError(data.error || 'خطا در ایجاد کاربر');
        return;
      }
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      onShowToast('کاربر جدید با موفقیت ایجاد شد');
      await fetchUsers();
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserActive = async (u: AppUser) => {
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ active: u.active === 1 ? 0 : 1 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setUserError(data.error || 'خطا در تغییر وضعیت کاربر');
      return;
    }
    onShowToast(u.active === 1 ? 'کاربر غیرفعال شد' : 'کاربر فعال شد');
    await fetchUsers();
  };

  const handleDeleteUser = async (u: AppUser) => {
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      setUserError(data.error || 'خطا در حذف کاربر');
      return;
    }
    onShowToast('کاربر حذف شد');
    await fetchUsers();
  };

  const handleSaveBackupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBackup(true);
    try {
      const res = await fetch('/api/backup/settings', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          enabled: backupSettings.enabled,
          intervalHours: backupSettings.intervalHours,
          keepCount: backupSettings.keepCount,
          telegramEnabled: backupSettings.telegramEnabled,
          telegramChatId: backupSettings.telegramChatId,
          telegramBotToken: telegramTokenInput.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setBackupSettings(data.settings);
        setTelegramTokenInput('');
        onShowToast('تنظیمات بکاپ خودکار ذخیره شد');
      }
    } finally {
      setSavingBackup(false);
    }
  };

  const handleRunBackupNow = async () => {
    setRunningBackupNow(true);
    try {
      const res = await fetch('/api/backup/run-now', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setAutoFiles(data.files || []);
        setBackupSettings((prev) => ({
          ...prev,
          lastRunAt: data.runAt || new Date().toISOString(),
          lastStatus: data.statusText || 'انجام شد',
        }));
        onShowToast(data.statusText || 'بکاپ خودکار ایجاد شد');
      }
    } finally {
      setRunningBackupNow(false);
    }
  };

  const handleDeleteAutoFile = async (filename: string) => {
    const res = await fetch(`/api/backup/auto-delete/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setAutoFiles(data.files || []);
      onShowToast('فایل بکاپ حذف شد');
    }
  };

  return (
    <div className="space-y-4">
      {/* Section Switcher */}
      <div className="grid grid-cols-3 bg-zinc-200/70 ring-1 ring-inset ring-zinc-950/5 p-1 rounded-xl gap-1 max-w-xl">
        <button
          type="button"
          onClick={() => setSection('users')}
          className={`h-9 px-2.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
            section === 'users'
              ? 'bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-950/5'
              : 'text-zinc-600 hover:text-zinc-950'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="truncate">کاربران و نقش‌ها</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('audit')}
          className={`h-9 px-2.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
            section === 'audit'
              ? 'bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-950/5'
              : 'text-zinc-600 hover:text-zinc-950'
          }`}
        >
          <History className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <span className="truncate">گزارش تغییرات</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('backup')}
          className={`h-9 px-2.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
            section === 'backup'
              ? 'bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-950/5'
              : 'text-zinc-600 hover:text-zinc-950'
          }`}
        >
          <CloudUpload className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="truncate">بکاپ خودکار</span>
        </button>
      </div>

      {/* TAB 1: Multi-User RBAC Management */}
      {section === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <form
            onSubmit={handleCreateUser}
            className="lg:col-span-5 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-zinc-950/5">
              <UserPlus className="w-4.5 h-4.5 text-emerald-600" />
              <div>
                <h3 className="text-sm font-extrabold text-zinc-950">افزودن کاربر جدید</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  سرپرست فقط به حضور و غیاب پروژه خودش دسترسی دارد و حقوق‌ها را نمی‌بیند.
                </p>
              </div>
            </div>

            {userError && (
              <div className="p-3 rounded-xl bg-rose-50 ring-1 ring-rose-500/20 text-rose-800 text-xs font-semibold">
                {userError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">نام کاربری *</label>
                <input
                  type="text"
                  dir="ltr"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="مثلاً: sarparast1"
                  className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs sm:text-sm text-right"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">نام نمایشی</label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="مثلاً: مهندس رضایی"
                  className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">رمز عبور *</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="حداقل ۶ کاراکتر"
                  className="w-full h-10 pr-9 pl-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs sm:text-sm text-right"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">نقش کاربری</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'supervisor' | 'admin')}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
                >
                  <option value="supervisor">سرپرست کارگاه (فقط حضور و غیاب)</option>
                  <option value="admin">مدیر کل (دسترسی کامل)</option>
                </select>
              </div>

              {newRole === 'supervisor' && (
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1.5">پروژه مجاز</label>
                  <select
                    value={newAssignedProjId}
                    onChange={(e) => setNewAssignedProjId(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-bold"
                  >
                    {projects.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={savingUser}
              className="w-full h-10 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white shadow-xs inset-ring inset-ring-white/10 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4 text-emerald-400" />
              <span>{savingUser ? 'در حال ایجاد...' : 'ایجاد حساب کاربری'}</span>
            </button>
          </form>

          <section className="lg:col-span-7 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 bg-zinc-50/70 border-b border-zinc-950/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-extrabold text-zinc-950">لیست اعضای سیستم</h3>
              </div>
              <span className="text-xs text-zinc-500 font-mono-num">
                {toPersianDigits(users.length)} کاربر
              </span>
            </div>

            {loadingUsers ? (
              <div className="p-8 text-center text-xs text-zinc-400">در حال بارگذاری...</div>
            ) : (
              <div className="divide-y divide-zinc-950/5">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className={`px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 ${
                      u.active === 0 ? 'opacity-55 bg-zinc-50/60' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-zinc-950">
                          {u.display_name || u.username}
                        </span>
                        <span className="text-xs font-mono-num text-zinc-400">({u.username})</span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            u.role === 'admin'
                              ? 'bg-zinc-950 text-white'
                              : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20'
                          }`}
                        >
                          {u.role === 'admin' ? 'مدیر کل' : 'سرپرست کارگاه'}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        {u.role === 'admin'
                          ? 'دسترسی کامل به همه پروژه‌ها، مالی و تنظیمات'
                          : `محدود به ثبت حضور و غیاب در پروژه: ${u.project_name || 'نامشخص'}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {u.id !== currentUserId && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleUserActive(u)}
                            className="h-8 px-2.5 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-xs font-bold text-zinc-700 inline-flex items-center gap-1"
                          >
                            {u.active === 1 ? (
                              <>
                                <Lock className="w-3.5 h-3.5 text-amber-600" />
                                <span>غیرفعال</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                                <span>فعال‌سازی</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="w-8 h-8 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                            title="حذف کاربر"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: Audit Log */}
      {section === 'audit' && (
        <section className="bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 bg-zinc-50/70 border-b border-zinc-950/5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-sky-600" />
              <div>
                <h3 className="text-sm font-extrabold text-zinc-950">گزارش تاریخچه تغییرات (Audit Log)</h3>
                <p className="text-[11px] text-zinc-500">
                  ثبت خودکار ویرایش‌ها، حضور روزانه، پرداخت‌ها، قفل ماه‌ها و ورود اعضا
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs font-semibold"
              >
                <option value="">همه رویدادها</option>
                <option value="payment">تراکنش‌های مالی</option>
                <option value="daily_log">حضور و غیاب</option>
                <option value="worker">کارگران</option>
                <option value="wage_history">تاریخچه دستمزد</option>
                <option value="month">قفل ماه‌ها</option>
                <option value="user">کاربران</option>
                <option value="auth">ورود و امنیت</option>
                <option value="backup">پشتیبان‌گیری</option>
              </select>

              <button
                type="button"
                onClick={fetchAuditLogs}
                className="h-9 w-9 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 flex items-center justify-center text-zinc-600"
                title="بروزرسانی"
              >
                <RefreshCw className={`w-4 h-4 ${loadingAudit ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-10 text-center text-xs text-zinc-500">
              هنوز رویدادی در تاریخچه ثبت نشده است.
            </div>
          ) : (
            <div className="divide-y divide-zinc-950/5 max-h-[540px] overflow-y-auto">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 hover:bg-zinc-50/70"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-zinc-950">{log.summary}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>
                        توسط: <strong className="text-zinc-800">{log.actor_username}</strong> (
                        {log.actor_role === 'admin' ? 'مدیر' : log.actor_role === 'supervisor' ? 'سرپرست' : 'سیستم'})
                      </span>
                      <span>· بخش: {log.entity_type}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono-num shrink-0" dir="ltr">
                    {log.created_at}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: Scheduled Auto-Backup & Telegram Delivery */}
      {section === 'backup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <form
            onSubmit={handleSaveBackupSettings}
            className="lg:col-span-6 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-950/5">
              <div className="flex items-center gap-2">
                <CloudUpload className="w-4.5 h-4.5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-extrabold text-zinc-950">تنظیمات بکاپ خودکار و تلگرام</h3>
                  <p className="text-[11px] text-zinc-500">
                    تهیه کپی زمان‌بندی‌شده از دیتابیس روی سرور و ارسال به ربات تلگرام
                  </p>
                </div>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-950/5 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-zinc-950 block">فعال‌سازی بکاپ خودکار دوره‌ای</span>
                <span className="text-[11px] text-zinc-500">
                  سرور به‌صورت خودکار در بازه انتخابی از SQLite نسخه پشتیبان می‌گیرد
                </span>
              </div>
              <input
                type="checkbox"
                checked={backupSettings.enabled}
                onChange={(e) =>
                  setBackupSettings((prev) => ({ ...prev, enabled: e.target.checked }))
                }
                className="w-4.5 h-4.5 rounded accent-emerald-600 cursor-pointer shrink-0"
              />
            </label>

            <div className="grid grid-cols-2 gap-3 font-mono-num">
              <div>
                <label className="block font-sans text-xs font-bold text-zinc-700 mb-1.5">
                  بازه زمانی (ساعت)
                </label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={backupSettings.intervalHours}
                  onChange={(e) =>
                    setBackupSettings((prev) => ({
                      ...prev,
                      intervalHours: Number(e.target.value) || 24,
                    }))
                  }
                  className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-bold"
                />
              </div>
              <div>
                <label className="block font-sans text-xs font-bold text-zinc-700 mb-1.5">
                  تعداد نگهداری آخرین فایل‌ها
                </label>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={backupSettings.keepCount}
                  onChange={(e) =>
                    setBackupSettings((prev) => ({
                      ...prev,
                      keepCount: Number(e.target.value) || 14,
                    }))
                  }
                  className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-bold"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-950/5 space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-xs font-bold text-zinc-900 inline-flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-600" />
                  <span>ارسال خودکار فایل بکاپ به ربات تلگرام</span>
                </span>
                <input
                  type="checkbox"
                  checked={backupSettings.telegramEnabled}
                  onChange={(e) =>
                    setBackupSettings((prev) => ({ ...prev, telegramEnabled: e.target.checked }))
                  }
                  className="w-4.5 h-4.5 rounded accent-sky-600 cursor-pointer"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    توکن ربات تلگرام {backupSettings.hasTelegramToken ? '(ذخیره‌شده)' : ''}
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    value={telegramTokenInput}
                    onChange={(e) => setTelegramTokenInput(e.target.value)}
                    placeholder={backupSettings.hasTelegramToken ? '•••••••• (برای تغییر وارد کنید)' : '123456:ABC-DEF...'}
                    className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    شناسه چت / کانال (Chat ID)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={backupSettings.telegramChatId}
                    onChange={(e) =>
                      setBackupSettings((prev) => ({ ...prev, telegramChatId: e.target.value }))
                    }
                    placeholder="مثلاً: 123456789"
                    className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs text-right"
                  />
                </div>
              </div>
            </div>

            {backupSettings.lastStatus && (
              <div className="p-3 rounded-xl bg-emerald-50/70 ring-1 ring-emerald-600/15 text-xs text-emerald-900">
                <div className="font-bold">آخرین وضعیت: {backupSettings.lastStatus}</div>
                {backupSettings.lastRunAt && (
                  <div className="text-[11px] text-emerald-700 font-mono-num mt-0.5" dir="ltr">
                    {backupSettings.lastRunAt}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={savingBackup}
                className="flex-1 h-10 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white shadow-xs inset-ring inset-ring-white/10 text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{savingBackup ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
              </button>

              <button
                type="button"
                disabled={runningBackupNow}
                onClick={handleRunBackupNow}
                className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${runningBackupNow ? 'animate-spin' : ''}`} />
                <span>{runningBackupNow ? 'در حال اجرا...' : 'اجرای بکاپ الان'}</span>
              </button>
            </div>
          </form>

          <section className="lg:col-span-6 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 bg-zinc-50/70 border-b border-zinc-950/5 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-zinc-950">بکاپ‌های ذخیره‌شده روی سرور</h3>
              <span className="text-xs text-zinc-500 font-mono-num">
                {toPersianDigits(autoFiles.length)} فایل
              </span>
            </div>

            {autoFiles.length === 0 ? (
              <div className="p-10 text-center text-xs text-zinc-500">
                هنوز نسخه خودکاری ایجاد نشده است. می‌توانید روی «اجرای بکاپ الان» کلیک کنید.
              </div>
            ) : (
              <div className="divide-y divide-zinc-950/5 max-h-96 overflow-y-auto">
                {autoFiles.map((f) => (
                  <div
                    key={f.filename}
                    className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2 hover:bg-zinc-50/70"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono-num font-bold text-zinc-900 truncate" dir="ltr">
                        {f.filename}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono-num mt-0.5">
                        {toPersianDigits(f.sizeKb)} کیلوبایت
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          downloadAuthenticatedFile(
                            `/api/backup/auto-download/${encodeURIComponent(f.filename)}`,
                            f.filename
                          )
                        }
                        className="h-8 px-2.5 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs hover:bg-zinc-50 text-xs font-bold text-zinc-700 inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>دانلود</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAutoFile(f.filename)}
                        className="w-8 h-8 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
