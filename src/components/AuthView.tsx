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
import { CurrentUserInfo } from '../types';
import { toPersianDigits } from '../utils/jalali';

// Keep Bearer token strictly in JS memory (never persisted to localStorage/sessionStorage);
// HttpOnly cookie maintains login across reloads.
let inMemoryAuthToken: string | null = null;

export function getStoredAuthToken(): string | null {
  return inMemoryAuthToken;
}

export function setStoredAuthToken(token: string | null): void {
  inMemoryAuthToken = token ? String(token) : null;
  // Clean up any legacy localStorage token if previously saved
  try {
    localStorage.removeItem('karkard_auth_token');
  } catch {
    // ignore
  }
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(extra || {}),
  };
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
    return { score: 0, label: 'وارد نشده', colorClass: 'text-zinc-400', barClass: 'bg-zinc-200' };
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
  onAuthenticated: (user: CurrentUserInfo, token: string) => void;
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
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
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
      const userObj: CurrentUserInfo = data.user || {
        id: 1,
        username: data.username || cleanUser,
        displayName: data.username || cleanUser,
        role: 'admin',
        assignedProjectId: null,
      };
      onAuthenticated(userObj, data.token || '');
    } catch {
      setErrorMsg('خطا در برقراری ارتباط با سرور');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 bg-catalyst-grid flex flex-col items-center justify-center p-4 sm:p-6 text-zinc-950">
      <div className="w-full max-w-[410px] bg-white ring-1 ring-zinc-950/10 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-zinc-950 text-white flex items-center justify-center shadow-xs inset-ring inset-ring-white/15">
                {isSetup ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
              </div>
              <span className="text-sm font-extrabold tracking-tight text-zinc-950">کارکردیار</span>
            </div>
            <span className="text-[11px] font-medium text-zinc-400">
              {isSetup ? 'ورود اعضا' : 'راه‌اندازی اولیه'}
            </span>
          </div>

          <div className="pt-1">
            <h1 className="text-lg sm:text-xl font-extrabold text-zinc-950 tracking-tight text-balance">
              {isSetup ? 'ورود به پنل مدیریت کارکرد' : 'تنظیم حساب مدیر سامانه'}
            </h1>
            <p className="text-xs text-zinc-500 leading-relaxed mt-1">
              {isSetup
                ? 'مدیر کل یا سرپرست کارگاه با نام کاربری و رمز عبور خود وارد شوند.'
                : 'یک نام کاربری و رمز عبور مطمئن برای مدیر کل تعریف کنید.'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-500/20 text-rose-800 text-xs font-semibold flex items-start gap-2.5">
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
            <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
              نام کاربری
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isSetup ? 'نام کاربری' : 'مثلاً: admin'}
                className="w-full h-10 pr-9 pl-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-medium text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/25 focus:border-zinc-950 transition-colors text-right"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
              رمز عبور
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete={isSetup ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="حداقل ۶ کاراکتر"
                className="w-full h-10 pr-9 pl-10 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-medium text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/25 focus:border-zinc-950 transition-colors text-right"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 flex items-center justify-center transition-colors"
                title={showPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
                aria-label={showPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {!isSetup && password.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500">قدرت رمز عبور</span>
                  <span className={`font-bold ${strength.colorClass}`}>{strength.label}</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${strength.barClass}`} />
                </div>
              </div>
            )}
          </div>

          {!isSetup && (
            <div>
              <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
                تکرار رمز عبور
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="تکرار رمز عبور"
                  className="w-full h-10 pr-9 pl-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-medium text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/25 focus:border-zinc-950 transition-colors text-right"
                  required
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-0.5">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-600 cursor-pointer select-none min-h-[34px]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded accent-zinc-900 cursor-pointer"
              />
              <span>مرا به خاطر بسپار ({toPersianDigits(30)} روز)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || lockedSeconds > 0}
            className="w-full h-10.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50 text-white text-sm font-semibold shadow-xs inset-ring inset-ring-white/10 flex items-center justify-center gap-2 transition-all"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              {submitting
                ? 'در حال بررسی...'
                : isSetup
                ? 'ورود به سامانه'
                : 'ذخیره و ورود به سامانه'}
            </span>
          </button>
        </form>

        <div className="pt-4 border-t border-zinc-950/5 text-[11px] text-zinc-400 text-center">
          محافظت‌شده با رمزنگاری scrypt، نشست امن HttpOnly و کنترل نقش‌ها
        </div>
      </div>
    </div>
  );
};

interface SecurityModalProps {
  currentUser: CurrentUserInfo;
  onClose: () => void;
  onCredentialsChanged: (newUsername: string, newToken: string) => void;
  onLogout: () => void;
  onDownloadSqliteBackup?: () => Promise<void>;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  currentUser,
  onClose,
  onCredentialsChanged,
  onLogout,
  onDownloadSqliteBackup,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(currentUser.username);
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
        credentials: 'same-origin',
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
      className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white ring-1 ring-zinc-950/10 rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-zinc-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-950/5 shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-zinc-950">
              حساب کاربری و امنیت
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              کاربر فعال: <strong className="text-zinc-900">{currentUser.username}</strong> ·{' '}
              <span className="text-emerald-700 font-semibold">
                {currentUser.role === 'admin' ? 'مدیر کل' : 'سرپرست کارگاه'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-9 h-9 rounded-lg ring-1 ring-zinc-950/10 flex items-center justify-center text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-500/20 text-rose-800 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-500/20 text-emerald-800 text-xs font-semibold">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
                رمز عبور فعلی
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                dir="ltr"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="رمز عبور فعلی خود را وارد کنید"
                className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm text-right hover:border-zinc-950/25 focus:border-zinc-950 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
                نام کاربری جدید
              </label>
              <input
                type="text"
                dir="ltr"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="نام کاربری جدید"
                className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm font-semibold text-right hover:border-zinc-950/25 focus:border-zinc-950 transition-colors"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
                  رمز عبور جدید
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="حداقل ۶ کاراکتر"
                  className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm text-right hover:border-zinc-950/25 focus:border-zinc-950 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-900 mb-1.5">
                  تکرار رمز جدید
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  dir="ltr"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="تکرار رمز جدید"
                  className="w-full h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-sm text-right hover:border-zinc-950/25 focus:border-zinc-950 transition-colors"
                  required
                />
              </div>
            </div>

            {newPassword.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">قدرت رمز جدید</span>
                <span className={`font-bold ${strength.colorClass}`}>{strength.label}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-600 cursor-pointer min-h-[34px]">
                <input
                  type="checkbox"
                  checked={showPass}
                  onChange={(e) => setShowPass(e.target.checked)}
                  className="w-4 h-4 rounded accent-zinc-900 cursor-pointer"
                />
                <span>نمایش رمزها</span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="h-10 px-4 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold shadow-xs inset-ring inset-ring-white/10 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{saving ? 'در حال ذخیره...' : 'ذخیره اطلاعات جدید'}</span>
              </button>
            </div>
          </form>

          <div className="pt-4 border-t border-zinc-950/5 flex flex-wrap items-center justify-between gap-2.5">
            {currentUser.role === 'admin' && onDownloadSqliteBackup && (
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
                className="h-9.5 px-3.5 rounded-lg bg-white ring-1 ring-zinc-950/10 hover:bg-zinc-50 text-zinc-900 text-xs font-semibold shadow-2xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>{downloadingBackup ? 'در حال دانلود...' : 'پشتیبان SQLite'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="h-9.5 px-3.5 rounded-lg bg-rose-50 hover:bg-rose-100 ring-1 ring-inset ring-rose-500/20 text-rose-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors mr-auto"
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
