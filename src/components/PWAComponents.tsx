import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X, Share } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          compact
            ? 'h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
            : 'w-full h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs inset-ring inset-ring-white/15 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap'
        }
        title="نصب کارکردیار روی گوشی یا دسکتاپ"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>نصب اپلیکیشن</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'h-8 px-2.5 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-zinc-800 text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
              : 'w-full h-9 px-3 rounded-lg bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs text-zinc-800 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap'
          }
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>نصب روی آیفون</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="bg-white ring-1 ring-zinc-950/10 rounded-t-3xl sm:rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
                <span className="w-10 h-1 rounded-full bg-zinc-300" />
              </div>

              <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-950/5">
                <h3 className="text-sm font-extrabold text-zinc-950">
                  نصب کارکردیار روی آیفون و آیپد
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="بستن"
                  className="w-8 h-8 rounded-lg ring-1 ring-zinc-950/10 flex items-center justify-center text-zinc-500 hover:bg-zinc-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3 text-xs text-zinc-600 leading-relaxed">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-950/5">
                  <Share className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p>
                    ۱. در نوار پایین مرورگر سافاری روی دکمه{' '}
                    <strong className="text-zinc-950">Share (اشتراک‌گذاری)</strong> بزنید.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-950/5">
                  <Smartphone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p>
                    ۲. صفحه را به پایین بکشید و گزینه{' '}
                    <strong className="text-zinc-950">Add to Home Screen</strong> را انتخاب کنید.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="w-full h-10 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold shadow-xs inset-ring inset-ring-white/10 transition-colors"
                >
                  متوجه شدم
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

interface OfflineIndicatorProps {
  pendingCount?: number;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ pendingCount = 0 }) => {
  const isOnline = useOnlineStatus();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className="fixed bottom-16 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg ring-1 ring-white/15 no-print">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {!isOnline
          ? pendingCount > 0
            ? `حالت آفلاین — ${pendingCount} تغییر در صف همگام‌سازی`
            : 'حالت آفلاین — نمایش اطلاعات ذخیره‌شده'
          : `در حال همگام‌سازی ${pendingCount} تغییر آفلاین...`}
      </span>
    </div>
  );
};
