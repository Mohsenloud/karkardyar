import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Check,
  X,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { toPersianDigits } from '../utils/jalali';

export const AUTH_TOKEN_STORAGE_KEY = 'karkard_auth_token';

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getStoredAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function downloadAuthenticatedFile(
  url: string,
  fallbackFilename: string
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'same-origin',
    });
    if (!res.ok) return false;

    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1].trim()) : fallbackFilename;

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    return true;
  } catch {
    return false;
  }
}

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  colorClass: string;
  barClass: string;
} {
  if (!password) {
    return { score: 0, label: 'وارد نشده', colorClass: 'text-slate-400', barClass: 'bg-slate-200' };
  }
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (password.length < 6) {
    return {
      score: 1,
      label: 'کوتاه (حداقل ۶ کاراکتر)',
      colorClass: 'text-rose-600',
      barClass: 'bg-rose-500 w-1/4',
    };
  }
  if (score <= 2) {
    return {
      score: 2,
      label: 'معمولی',
      colorClass: 'text-amber-600',
      barClass: 'bg-amber-500 w-2/4',
    };
  }
  if (score === 3) {
    return {
      score: 3,
      label: 'قوی',
      colorClass: 'text-emerald-600',
      barClass: 'bg-emerald-500 w-3/4',
    };
  }
  return {
    score: 4,
    label: 'بسیار امن',
    colorClass: 'text-emerald-700',
    barClass: 'bg-emerald-600 w-full',
  };
}

interface AuthViewProps {
  isSetup: boolean;
  onAuthenticated: (username: string, token: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ isSetup, onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockedSeconds, setLockedSeconds] = useState<number>(0);

  useEffect(() => {
    if (lockedSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockedSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedSeconds]);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUser = username.trim();
    if (cleanUser.length < 3) {
      setErrorMsg('نام کاربری باید حداقل ۳ کاراکتر باشد.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('رمز عبور باید حداقل ۶ کاراکتر باشد.');
      return;
    }

    if (!isSetup && password !== confirmPassword) {
      setErrorMsg('رمز عبور و تکرار آن یکسان نیستند.');
      return;
    }

    try {
      setSubmitting(true);
      const endpoint = isSetup ? '/api/auth/login' : '/api/auth/setup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          password,
          rememberMe,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.lockedSeconds) {
          setLockedSeconds(Number(data.lockedSeconds));
        }
        setErrorMsg(data.error || 'خطا در احراز هویت');
        return;
      }

      if (data.token) {
        setStoredAuthToken(data.token);
      }
      onAuthenticated(data.username || cleanUser, data.token || '');
    } catch {
      setErrorMsg('خطا در برقراری ارتباط با سرور');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900">
      <div className="w-full max-w-[420px] bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        {/* Brand & Heading */}
        <div className="text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center mx-auto">
            {isSetup ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-700 tracking-tight mb-1">کارکردیار</p>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              {isSetup ? 'ورود به سامانه مدیریت کارکرد' : 'تنظیم حساب مدیر سامانه'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            {isSetup
              ? 'برای دسترسی به پروژه‌ها، حضور روزانه و حساب‌های مالی وارد شوید.'
              : 'یک نام کاربری و رمز عبور مطمئن تعریف کنید تا اطلاعات دیتابیس محافظت شود.'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>{errorMsg}</p>
              {lockedSeconds > 0 && (
                <p className="text-[11px] text-rose-600 font-mono-num">
                  زمان باقی‌مانده: {toPersianDigits(Math.floor(lockedSeconds / 60))}:
                  {toPersianDigits(String(lockedSeconds % 60).padStart(2, '0'))}
                </p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              نام کاربری
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isSetup ? 'نام کاربری' : 'مثلاً: admin'}
                className="w-full h-11 pr-10 pl-3.5 rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white text-sm font-medium text-slate-900 focus:border-emerald-600 transition-colors text-right"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              رمز عبور
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete={isSetup ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="حداقل ۶ کاراکتر"
                className="w-full h-11 pr-10 pl-11 rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white text-sm font-medium text-slate-900 focus:border-emerald-600 transition-colors text-right"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
                title={showPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
                aria-label={showPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {!isSetup && password.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">قدرت رمز عبور</span>
                  <span className={`font-bold ${strength.colorClass}`}>{strength.label}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${strength.barClass}`} />
                </div>
              </div>
            )}
          </div>

          {!isSetup && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                تکرار رمز عبور
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="تکرار رمز عبور"
                  className="w-full h-11 pr-10 pl-3.5 rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white text-sm font-medium text-slate-900 focus:border-emerald-600 transition-colors text-right"
                  required
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-0.5">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none min-h-[36px]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-700 cursor-pointer"
              />
              <span>مرا به خاطر بسپار ({toPersianDigits(30)} روز)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || lockedSeconds > 0}
            className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              {submitting
                ? 'در حال بررسی...'
                : isSetup
                ? 'ورود به سامانه'
                : 'ذخیره و ورود به سامانه'}
            </span>
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 text-center">
          محافظت‌شده با رمزنگاری scrypt و قفل خودکار ضد نفوذ
        </div>
      </div>
    </div>
  );
};

interface SecurityModalProps {
  currentUsername: string;
  onClose: () => void;
  onCredentialsChanged: (newUsername: string, newToken: string) => void;
  onLogout: () => void;
  onDownloadSqliteBackup?: () => Promise<void>;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  currentUsername,
  onClose,
  onCredentialsChanged,
  onLogout,
  onDownloadSqliteBackup,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(currentUsername);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const strength = getPasswordStrength(newPassword);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg('وارد کردن رمز عبور فعلی الزامی است.');
      return;
    }
    if (newUsername.trim().length < 3) {
      setErrorMsg('نام کاربری جدید باید حداقل ۳ کاراکتر باشد.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('رمز عبور جدید و تکرار آن یکسان نیستند.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/auth/change-credentials', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          currentPassword,
          newUsername: newUsername.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'خطا در تغییر نام کاربری و رمز عبور');
        return;
      }
      if (data.token) {
        setStoredAuthToken(data.token);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccessMsg('نام کاربری و رمز عبور با موفقیت تغییر یافت.');
      onCredentialsChanged(data.username || newUsername.trim(), data.token || '');
    } catch {
      setErrorMsg('خطا در ارتباط با سرور');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Sheet Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              حساب کاربری و امنیت
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              کاربر فعال: <strong className="text-slate-800">{currentUsername}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                رمز عبور فعلی
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                dir="ltr"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="رمز عبور فعلی خود را وارد کنید"
                className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 text-sm text-right focus:border-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                نام کاربری جدید
              </label>
              <input
                type="text"
                dir="ltr"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="نام کاربری جدید"
                className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-semibold text-right focus:border-emerald-600"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رمز عبور جدید
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="حداقل ۶ کاراکتر"
                  className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 text-sm text-right focus:border-emerald-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  تکرار رمز جدید
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  dir="ltr"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="تکرار رمز جدید"
                  className="w-full h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 text-sm text-right focus:border-emerald-600"
                  required
                />
              </div>
            </div>

            {newPassword.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">قدرت رمز جدید</span>
                <span className={`font-bold ${strength.colorClass}`}>{strength.label}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer min-h-[36px]">
                <input
                  type="checkbox"
                  checked={showPass}
                  onChange={(e) => setShowPass(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-700 cursor-pointer"
                />
                <span>نمایش رمزها</span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="h-11 sm:h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{saving ? 'در حال ذخیره...' : 'ذخیره اطلاعات جدید'}</span>
              </button>
            </div>
          </form>

          {/* Quick Actions Footer: Backup & Logout */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
            {onDownloadSqliteBackup && (
              <button
                type="button"
                disabled={downloadingBackup}
                onClick={async () => {
                  setDownloadingBackup(true);
                  try {
                    await onDownloadSqliteBackup();
                  } finally {
                    setDownloadingBackup(false);
                  }
                }}
                className="h-10 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>{downloadingBackup ? 'در حال دانلود...' : 'پشتیبان SQLite'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="h-10 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors mr-auto"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج از حساب</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
