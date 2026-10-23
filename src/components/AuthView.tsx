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

export function withAuthQuery(url: string): string {
  const token = getStoredAuthToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
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
    colorClass: 'text-teal-700',
    barClass: 'bg-gradient-to-l from-emerald-500 to-teal-600 w-full',
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-slate-900">
      <div className="w-full max-w-md bg-white/95 backdrop-blur-md border border-emerald-200/80 rounded-3xl p-6 sm:p-7 shadow-xl shadow-emerald-950/5 space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-600/25">
            {isSetup ? <Lock className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
            {isSetup ? 'ورود امن به کارکردیار' : 'تعریف نام کاربری و رمز عبور اولیه'}
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isSetup
              ? 'برای دسترسی به اطلاعات پروژه‌ها، کارگران و حساب‌های مالی وارد شوید.'
              : 'برای محافظت از اطلاعات برنامه، یک نام کاربری و رمز عبور قوی تعریف کنید. این مشخصات به صورت رمزنگاری‌شده در دیتابیس امن سرور ذخیره می‌شود.'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>{errorMsg}</p>
              {lockedSeconds > 0 && (
                <p className="text-[11px] text-rose-600 font-mono-num">
                  زمان باقی‌مانده تا رفع مسدودیت: {toPersianDigits(Math.floor(lockedSeconds / 60))}:
                  {toPersianDigits(String(lockedSeconds % 60).padStart(2, '0'))}
                </p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
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
                placeholder={isSetup ? 'نام کاربری خود را وارد کنید' : 'مثلاً: admin یا نام دلخواه'}
                className="w-full h-11 pr-10 pl-3.5 rounded-xl border border-slate-300 bg-slate-50/70 focus:bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 text-right"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
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
                className="w-full h-11 pr-10 pl-10 rounded-xl border border-slate-300 bg-slate-50/70 focus:bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 text-right"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                title={showPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {!isSetup && password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">امنیت رمز عبور:</span>
                  <span className={`font-extrabold ${strength.colorClass}`}>{strength.label}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${strength.barClass}`} />
                </div>
              </div>
            )}
          </div>

          {!isSetup && (
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
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
                  className="w-full h-11 pr-10 pl-3.5 rounded-xl border border-slate-300 bg-slate-50/70 focus:bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 text-right"
                  required
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-0.5">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-600"
              />
              <span>مرا به خاطر بسپار ({toPersianDigits(30)} روز)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || lockedSeconds > 0}
            className="w-full h-11 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              {submitting
                ? 'در حال بررسی امنیتی...'
                : isSetup
                ? 'ورود به برنامه'
                : 'ثبت نام کاربری و رمز عبور و ورود'}
            </span>
          </button>
        </form>

        <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>رمزنگاری سطح بالا با الگوریتم scrypt + Salt و قفل خودکار ضد نفوذ</span>
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
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  currentUsername,
  onClose,
  onCredentialsChanged,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(currentUsername);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
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
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-emerald-100 rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                تنظیمات امنیتی و رمز ورود
              </h3>
              <p className="text-[11px] text-slate-500">
                کاربر فعال: <strong className="text-emerald-700">{currentUsername}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رمز عبور فعلی *
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              dir="ltr"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="رمز عبور فعلی خود را وارد کنید"
              className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs text-right focus:outline-none focus:border-emerald-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              نام کاربری جدید *
            </label>
            <input
              type="text"
              dir="ltr"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="نام کاربری جدید"
              className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs font-bold text-right focus:outline-none focus:border-emerald-600"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رمز عبور جدید *
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="حداقل ۶ کاراکتر"
                className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs text-right focus:outline-none focus:border-emerald-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تکرار رمز عبور جدید *
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                dir="ltr"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="تکرار رمز جدید"
                className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs text-right focus:outline-none focus:border-emerald-600"
                required
              />
            </div>
          </div>

          {newPassword.length > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">قدرت رمز جدید:</span>
              <span className={`font-extrabold ${strength.colorClass}`}>{strength.label}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showPass}
                onChange={(e) => setShowPass(e.target.checked)}
                className="rounded accent-emerald-600"
              />
              <span>نمایش رمزها</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="w-fit h-9 px-4 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? 'در حال ذخیره...' : 'ذخیره نام کاربری و رمز جدید'}</span>
            </button>
          </div>
        </form>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            قفل کردن برنامه و خروج از حساب فعلی:
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="w-fit h-8 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج از برنامه</span>
          </button>
        </div>
      </div>
    </div>
  );
};
