import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarRange,
  Wallet,
  Users,
  FolderKanban,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  ShieldCheck,
  ChevronDown,
  BarChart3,
  Shield,
  MoreHorizontal,
} from 'lucide-react';
import {
  AttendanceStatus,
  BootstrapResponse,
  CalcMode,
  CurrentUserInfo,
  DailyLog,
  LockedMonthRecord,
  PaymentRecord,
  PaymentType,
  Project,
  WageHistoryRecord,
  Worker,
} from './types';
import {
  formatToman,
  getTodayIso,
  isoToShamsi,
  toPersianDigits,
} from './utils/jalali';
import { computeWorkerAccruedSummary } from './utils/calculations';
import { DailyAttendanceView } from './components/DailyAttendanceView';
import { MonthlySheetView } from './components/MonthlySheetView';
import { PaymentsView } from './components/PaymentsView';
import { WorkersView } from './components/WorkersView';
import { AnalyticsView } from './components/AnalyticsView';
import { TeamSecurityView } from './components/TeamSecurityView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAComponents';
import {
  AuthView,
  SecurityModal,
  downloadAuthenticatedFile,
  getAuthHeaders,
  setStoredAuthToken,
} from './components/AuthView';
import {
  PROJECT_COLOR_KEYS,
  PROJECT_THEMES,
  ProjectColorKey,
  getProjectTheme,
} from './utils/projectThemes';

type ActiveTab = 'monthly' | 'daily' | 'payments' | 'workers' | 'analytics' | 'security';

interface QueuedDailyLogPayload {
  worker_id: number;
  work_date: string;
  status: AttendanceStatus | 'clear';
  days_equiv?: number;
  overtime_hours?: number;
  bonus_amount?: number;
  project_name?: string;
  note?: string;
}

const OFFLINE_CACHE_KEY = 'karkard_offline_bootstrap_v1';
const PENDING_LOGS_KEY = 'karkard_pending_daily_logs_v1';

function readPendingLogsQueue(): QueuedDailyLogPayload[] {
  try {
    const raw = localStorage.getItem(PENDING_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingLogsQueue(items: QueuedDailyLogPayload[]) {
  try {
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

export default function App() {
  const [serverTodayIso, setServerTodayIso] = useState<string>(() => getTodayIso());
  const todayIso = serverTodayIso;

  const [activeTab, setActiveTab] = useState<ActiveTab>('monthly');
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayIso());

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | 'all'>(1);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [allLogs, setAllLogs] = useState<DailyLog[]>([]);
  const [allPayments, setAllPayments] = useState<PaymentRecord[]>([]);
  const [wageHistory, setWageHistory] = useState<WageHistoryRecord[]>([]);
  const [lockedMonths, setLockedMonths] = useState<LockedMonthRecord[]>([]);
  const [dbFileSizeKb, setDbFileSizeKb] = useState<number>(0);

  // Offline queue count for PWA indicator
  const [pendingLogsCount, setPendingLogsCount] = useState<number>(
    () => readPendingLogsQueue().length
  );

  // Mobile "More" menu drawer
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState<boolean>(false);

  // Worker display mode: 'card' (2-col grid) or 'row' (horizontal rows)
  const [workerViewMode, setWorkerViewMode] = useState<'card' | 'row'>(() => {
    try {
      return localStorage.getItem('karkard_worker_view_mode') === 'row' ? 'row' : 'card';
    } catch {
      return 'card';
    }
  });

  const handleChangeWorkerViewMode = (mode: 'card' | 'row') => {
    setWorkerViewMode(mode);
    try {
      localStorage.setItem('karkard_worker_view_mode', mode);
    } catch {
      // ignore
    }
  };

  // Projects Management Modal & Dropdown State
  const [showProjectsModal, setShowProjectsModal] = useState<boolean>(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState<boolean>(false);
  const desktopProjectDropdownRef = useRef<HTMLDivElement | null>(null);
  const mobileProjectDropdownRef = useRef<HTMLDivElement | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [projectNameInput, setProjectNameInput] = useState<string>('');
  const [projectDescInput, setProjectDescInput] = useState<string>('');
  const [projectColorInput, setProjectColorInput] = useState<ProjectColorKey>('violet');
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<number | null>(null);

  useEffect(() => {
    const handleOutsideClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      const inDesktop = desktopProjectDropdownRef.current?.contains(target);
      const inMobile = mobileProjectDropdownRef.current?.contains(target);
      if (!inDesktop && !inMobile) {
        setShowProjectDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Authentication & Security State
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [isAuthSetup, setIsAuthSetup] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<CurrentUserInfo>({
    id: 1,
    username: 'admin',
    displayName: 'مدیر کل',
    role: 'admin',
    assignedProjectId: null,
  });
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);

  const isSupervisor = currentUser.role === 'supervisor';

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const apiRequest = useCallback(async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: getAuthHeaders(options.headers as Record<string, string> | undefined),
    });

    if (res.status === 401) {
      const errBody = await res.json().catch(() => ({}));
      if (errBody.requireSetup) {
        setIsAuthSetup(false);
      }
      setIsAuthenticated(false);
      throw new Error(errBody.error || 'نشست امنیتی شما منقضی شده است. لطفاً مجدداً وارد شوید.');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'خطا در ارتباط با سرور');
    }
    return data;
  }, []);

  const applyBootstrapData = useCallback(
    (data: BootstrapResponse) => {
      if (data.todayIso) {
        setServerTodayIso((prev) => {
          if (selectedDate === prev && data.todayIso !== prev) {
            setSelectedDate(data.todayIso);
          }
          return data.todayIso;
        });
      }
      if (data.currentUser) {
        setCurrentUser(data.currentUser);
        if (data.currentUser.role === 'supervisor') {
          setActiveTab('daily');
          if (data.currentUser.assignedProjectId) {
            setSelectedProjectId(data.currentUser.assignedProjectId);
          }
        }
      }
      const loadedProjects = data.projects || [];
      setProjects(loadedProjects);
      setSelectedProjectId((prev) => {
        if (data.currentUser?.role === 'supervisor' && data.currentUser.assignedProjectId) {
          return data.currentUser.assignedProjectId;
        }
        if (prev === 'all') return 'all';
        if (loadedProjects.some((p) => p.id === prev)) return prev;
        return loadedProjects[0]?.id ?? 'all';
      });
      setWorkers(data.workers || []);
      setAllLogs(data.allLogs || []);
      setAllPayments(data.allPayments || []);
      setWageHistory(data.wageHistory || []);
      setLockedMonths(data.lockedMonths || []);
      setDbFileSizeKb(data.dbFileSizeKb || 0);
    },
    [selectedDate]
  );

  const fetchAllData = useCallback(async () => {
    try {
      setErrorMsg(null);
      const data: BootstrapResponse = await apiRequest('/api/bootstrap');
      applyBootstrapData(data);
      try {
        localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(data));
      } catch {
        // ignore quota errors
      }
    } catch (err: any) {
      // Fallback to cached snapshot if offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        try {
          const cached = localStorage.getItem(OFFLINE_CACHE_KEY);
          if (cached) {
            applyBootstrapData(JSON.parse(cached));
            setErrorMsg(null);
            return;
          }
        } catch {
          // ignore
        }
      }
      setErrorMsg(err.message || 'خطا در بارگذاری اطلاعات');
    } finally {
      setLoading(false);
    }
  }, [apiRequest, applyBootstrapData]);

  // Auto-sync queued offline attendance logs when returning online
  const flushPendingOfflineLogs = useCallback(async () => {
    const queue = readPendingLogsQueue();
    if (queue.length === 0) return;

    const remaining: QueuedDailyLogPayload[] = [];
    let syncedCount = 0;
    for (const item of queue) {
      try {
        await apiRequest('/api/daily-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        syncedCount += 1;
      } catch {
        remaining.push(item);
      }
    }
    writePendingLogsQueue(remaining);
    setPendingLogsCount(remaining.length);
    if (syncedCount > 0) {
      showToast(`${toPersianDigits(syncedCount)} مورد حضور آفلاین با سرور همگام‌سازی شد`);
      fetchAllData();
    }
  }, [apiRequest, fetchAllData, showToast]);

  useEffect(() => {
    const handleOnline = () => {
      if (isAuthenticated) {
        flushPendingOfflineLogs();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isAuthenticated, flushPendingOfflineLogs]);

  // Enforce supervisor tab restriction
  useEffect(() => {
    if (isSupervisor && activeTab !== 'daily') {
      setActiveTab('daily');
    }
    if (isSupervisor && currentUser.assignedProjectId && selectedProjectId !== currentUser.assignedProjectId) {
      setSelectedProjectId(currentUser.assignedProjectId);
    }
  }, [isSupervisor, activeTab, currentUser.assignedProjectId, selectedProjectId]);

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        const res = await fetch('/api/auth/status', {
          headers: getAuthHeaders(),
          credentials: 'same-origin',
        });
        if (res.ok) {
          const status = await res.json();
          setIsAuthSetup(Boolean(status.isSetup));
          setIsAuthenticated(Boolean(status.authenticated));
          if (status.user) {
            setCurrentUser(status.user);
            if (status.user.role === 'supervisor') {
              setActiveTab('daily');
              if (status.user.assignedProjectId) {
                setSelectedProjectId(status.user.assignedProjectId);
              }
            }
          } else if (status.username) {
            setCurrentUser((prev) => ({ ...prev, username: status.username }));
          }
          setAuthChecked(true);
          if (status.isSetup && status.authenticated) {
            await fetchAllData();
          } else {
            setLoading(false);
          }
        } else {
          setAuthChecked(true);
          setLoading(false);
        }
      } catch {
        // Offline fallback when PWA launched offline
        try {
          const cached = localStorage.getItem(OFFLINE_CACHE_KEY);
          if (cached && typeof navigator !== 'undefined' && !navigator.onLine) {
            applyBootstrapData(JSON.parse(cached));
            setIsAuthSetup(true);
            setIsAuthenticated(true);
          }
        } catch {
          // ignore
        }
        setAuthChecked(true);
        setLoading(false);
      }
    };
    checkAuthAndLoad();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(OFFLINE_CACHE_KEY);
    } catch {
      // ignore
    }
    setStoredAuthToken(null);
    setShowSecurityModal(false);
    setIsAuthenticated(false);
    setIsAuthSetup(true);
  };

  const activeProjectName = useMemo(() => {
    if (selectedProjectId === 'all') return 'همه پروژه‌ها';
    return projects.find((p) => p.id === selectedProjectId)?.name || 'پروژه';
  }, [projects, selectedProjectId]);

  const activeProjectColor = useMemo(() => {
    if (selectedProjectId === 'all') return 'indigo';
    const idx = projects.findIndex((p) => p.id === selectedProjectId);
    const pr = idx >= 0 ? projects[idx] : undefined;
    return getProjectTheme(pr?.color, Math.max(0, idx)).key;
  }, [projects, selectedProjectId]);

  // Filter workers by selected project
  const projectWorkers = useMemo(() => {
    const withProjectName = workers.map((w) => {
      const pIdx = projects.findIndex((p) => p.id === w.project_id);
      const pr = pIdx >= 0 ? projects[pIdx] : undefined;
      return {
        ...w,
        project_name: pr?.name || w.project_name || 'پروژه الف',
        project_color: getProjectTheme(pr?.color || w.project_color, Math.max(0, pIdx)).key,
      };
    });
    if (selectedProjectId === 'all') return withProjectName;
    return withProjectName.filter((w) => (w.project_id || 1) === selectedProjectId);
  }, [workers, projects, selectedProjectId]);

  const projectWorkerIds = useMemo(
    () => new Set(projectWorkers.map((w) => w.id)),
    [projectWorkers]
  );

  // Instant 0ms derived state using useMemo
  const dailyLogs = useMemo(
    () =>
      allLogs.filter(
        (l) => l.work_date === selectedDate && projectWorkerIds.has(l.worker_id)
      ),
    [allLogs, selectedDate, projectWorkerIds]
  );

  const payments = useMemo(
    () => allPayments.filter((p) => projectWorkerIds.has(p.worker_id)),
    [allPayments, projectWorkerIds]
  );

  // Check if selectedDate is locked for current project
  const isSelectedDateLocked = useMemo(() => {
    const sh = isoToShamsi(selectedDate);
    if (selectedProjectId === 'all') {
      return lockedMonths.some(
        (l) => l.shamsi_year === sh.jy && l.shamsi_month === sh.jm && l.project_id === 0
      );
    }
    return lockedMonths.some(
      (l) =>
        l.shamsi_year === sh.jy &&
        l.shamsi_month === sh.jm &&
        (l.project_id === 0 || l.project_id === selectedProjectId)
    );
  }, [lockedMonths, selectedDate, selectedProjectId]);

  // All accrued summaries across all workers (applying effective-date wageHistory)
  const allWorkersAccruedSummaries = useMemo(
    () =>
      workers.map((w) =>
        computeWorkerAccruedSummary(
          w,
          allLogs,
          allPayments,
          todayIso,
          wageHistory.filter((h) => h.worker_id === w.id)
        )
      ),
    [workers, allLogs, allPayments, todayIso, wageHistory]
  );

  // Accrued summaries for the currently selected project
  const accruedSummaries = useMemo(
    () =>
      allWorkersAccruedSummaries.filter((a) => projectWorkerIds.has(a.workerId)),
    [allWorkersAccruedSummaries, projectWorkerIds]
  );

  // Per-project statistics
  const projectStatsList = useMemo(() => {
    return projects.map((pr) => {
      const prWorkers = workers.filter((w) => (w.project_id || 1) === pr.id);
      const prWorkerIds = new Set(prWorkers.map((w) => w.id));
      const prAccrued = allWorkersAccruedSummaries.filter((a) =>
        prWorkerIds.has(a.workerId)
      );
      const totalDays = prAccrued.reduce((s, a) => s + a.effectiveDaysToToday, 0);
      const totalGross = prAccrued.reduce((s, a) => s + a.grossEarnedToToday, 0);
      const totalPaid = prAccrued.reduce((s, a) => s + a.paidToToday, 0);
      const netPayable = prAccrued.reduce((s, a) => s + a.netPayableToToday, 0);
      return {
        project: pr,
        workersCount: prWorkers.length,
        totalDays,
        totalGross,
        totalPaid,
        netPayable,
      };
    });
  }, [projects, workers, allWorkersAccruedSummaries]);

  const handleSelectDate = (iso: string) => {
    setSelectedDate(iso);
  };

  // Project CRUD handlers
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectNameInput.trim()) return;

    if (editingProjectId) {
      const targetId = editingProjectId;
      const updatedName = projectNameInput.trim();
      const updatedDesc = projectDescInput.trim();
      const updatedColor = projectColorInput;
      setProjects((prev) =>
        prev.map((p) =>
          p.id === targetId
            ? { ...p, name: updatedName, description: updatedDesc, color: updatedColor }
            : p
        )
      );
      setEditingProjectId(null);
      setProjectNameInput('');
      setProjectDescInput('');

      try {
        await apiRequest(`/api/projects/${targetId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: updatedName,
            description: updatedDesc,
            color: updatedColor,
          }),
        });
        showToast('مشخصات و رنگ پروژه ویرایش شد');
      } catch (err: any) {
        setErrorMsg(err.message || 'خطا در ویرایش پروژه');
        fetchAllData();
      }
    } else {
      try {
        const created = await apiRequest('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: projectNameInput.trim(),
            description: projectDescInput.trim(),
            color: projectColorInput,
          }),
        });
        await fetchAllData();
        if (created?.id) {
          setSelectedProjectId(Number(created.id));
        }
        setProjectNameInput('');
        setProjectDescInput('');
        showToast('پروژه جدید ایجاد شد');
      } catch (err: any) {
        setErrorMsg(err.message || 'خطا در ایجاد پروژه');
      }
    }
  };

  const handleDeleteProject = async (id: number) => {
    if (projects.length <= 1) {
      showToast('حداقل یک پروژه باید باقی بماند');
      return;
    }
    try {
      await apiRequest(`/api/projects/${id}`, { method: 'DELETE' });
      setConfirmDeleteProjectId(null);
      await fetchAllData();
      showToast('پروژه و حساب‌های آن حذف شد');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در حذف پروژه');
    }
  };

  // Optimistic 0ms daily log update with offline queue fallback
  const handleSaveDailyLog = async (payload: QueuedDailyLogPayload) => {
    const sh = isoToShamsi(payload.work_date);

    setAllLogs((prev) => {
      const filtered = prev.filter(
        (l) => !(l.worker_id === payload.worker_id && l.work_date === payload.work_date)
      );
      if (payload.status === 'clear') {
        return filtered;
      }
      const existing = prev.find(
        (l) => l.worker_id === payload.worker_id && l.work_date === payload.work_date
      );
      const computedDays =
        payload.days_equiv !== undefined
          ? Number(payload.days_equiv)
          : payload.status === 'present' || payload.status === 'paid_leave'
          ? 1
          : payload.status === 'half'
          ? 0.5
          : 0;

      const updatedLog: DailyLog = {
        id: existing?.id ?? Date.now(),
        worker_id: payload.worker_id,
        work_date: payload.work_date,
        shamsi_year: sh.jy,
        shamsi_month: sh.jm,
        shamsi_day: sh.jd,
        status: payload.status,
        days_equiv: computedDays,
        overtime_hours:
          payload.overtime_hours !== undefined
            ? Number(payload.overtime_hours)
            : existing?.overtime_hours ?? 0,
        bonus_amount:
          payload.bonus_amount !== undefined
            ? Number(payload.bonus_amount)
            : existing?.bonus_amount ?? 0,
        project_name:
          payload.project_name !== undefined
            ? payload.project_name
            : existing?.project_name ?? activeProjectName,
        note: payload.note !== undefined ? payload.note : existing?.note ?? '',
      };
      return [...filtered, updatedLog];
    });

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queue = readPendingLogsQueue().filter(
        (q) => !(q.worker_id === payload.worker_id && q.work_date === payload.work_date)
      );
      queue.push(payload);
      writePendingLogsQueue(queue);
      setPendingLogsCount(queue.length);
      showToast('آفلاین ذخیره شد؛ پس از اتصال همگام‌سازی می‌شود');
      return;
    }

    try {
      await apiRequest('/api/daily-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ذخیره خودکار');
      fetchAllData();
    }
  };

  // Optimistic 0ms bulk mark present for active project workers
  const handleBulkMarkPresent = async (projectName: string) => {
    const sh = isoToShamsi(selectedDate);
    const activeWorkers = projectWorkers.filter((w) => w.active === 1);

    setAllLogs((prev) => {
      const next = [...prev];
      for (const w of activeWorkers) {
        const idx = next.findIndex(
          (l) => l.worker_id === w.id && l.work_date === selectedDate
        );
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            status: 'present',
            days_equiv: 1,
            project_name: next[idx].project_name || projectName || activeProjectName,
          };
        } else {
          next.push({
            id: Date.now() + w.id,
            worker_id: w.id,
            work_date: selectedDate,
            shamsi_year: sh.jy,
            shamsi_month: sh.jm,
            shamsi_day: sh.jd,
            status: 'present',
            days_equiv: 1,
            overtime_hours: 0,
            bonus_amount: 0,
            project_name: projectName || activeProjectName,
            note: '',
          });
        }
      }
      return next;
    });

    try {
      await apiRequest('/api/daily-log/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date: selectedDate,
          status: 'present',
          project_name: projectName || activeProjectName,
          project_id: selectedProjectId === 'all' ? undefined : selectedProjectId,
        }),
      });
      showToast(`حضور کارگران «${activeProjectName}» ثبت شد`);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ثبت گروهی');
      fetchAllData();
    }
  };

  // Copy previous day's attendance statuses & overtime
  const handleCopyPreviousDay = async () => {
    try {
      const res = await apiRequest('/api/daily-log/copy-previous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_date: selectedDate,
          project_id: selectedProjectId,
        }),
      });
      await fetchAllData();
      showToast(
        `وضعیت حضور ${toPersianDigits(res.count || 0)} نفر از روز قبل کپی شد`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در کپی از روز قبل');
    }
  };

  // Payment creation with category & receipt image support
  const handleAddPayment = async (payload: {
    worker_id: number;
    payment_date: string;
    shamsi_year: number;
    shamsi_month: number;
    amount: number;
    payment_type: PaymentType;
    category?: string;
    note: string;
    receipt_data?: string | null;
  }) => {
    const w = workers.find((x) => x.id === payload.worker_id);
    const resolvedProjectId =
      w?.project_id || (selectedProjectId !== 'all' ? selectedProjectId : 1);

    try {
      const result = await apiRequest('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, project_id: resolvedProjectId }),
      });

      const realId = Number(result?.id);
      if (realId) {
        const createdPayment: PaymentRecord = {
          id: realId,
          project_id: resolvedProjectId,
          worker_id: payload.worker_id,
          worker_name: w?.name || '',
          worker_role: w?.role || '',
          payment_date: payload.payment_date,
          shamsi_year: payload.shamsi_year,
          shamsi_month: payload.shamsi_month,
          amount: payload.amount,
          payment_type: payload.payment_type,
          category: payload.category || 'general',
          receipt_path: result?.receipt_path || '',
          period_archived: 0,
          note: payload.note,
        };
        setAllPayments((prev) => [createdPayment, ...prev]);
      } else {
        await fetchAllData();
      }
      showToast('تراکنش مالی ثبت شد');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ثبت پرداخت');
      fetchAllData();
    }
  };

  const handleQuickSettleWorker = (
    worker: Worker,
    amount: number,
    paymentType: PaymentType = 'salary',
    customNote?: string,
    paymentDateIso?: string
  ) => {
    const chosenDate = paymentDateIso || todayIso;
    const sh = isoToShamsi(chosenDate);
    const defaultNote =
      paymentType === 'advance'
        ? `مساعده علی‌الحساب (${worker.project_name || activeProjectName})`
        : paymentType === 'salary'
        ? `تسویه کارکرد (${worker.project_name || activeProjectName})`
        : paymentType === 'allowance'
        ? `مزایا / پاداش (${worker.project_name || activeProjectName})`
        : `کسر / خسارت (${worker.project_name || activeProjectName})`;

    handleAddPayment({
      worker_id: worker.id,
      payment_date: chosenDate,
      shamsi_year: sh.jy,
      shamsi_month: sh.jm,
      amount,
      payment_type: paymentType,
      note: customNote?.trim() || defaultNote,
    });
  };

  const handleUpdatePayment = async (payload: {
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
  }) => {
    const w = workers.find((x) => x.id === payload.worker_id);
    const resolvedProjectId =
      w?.project_id || (selectedProjectId === 'all' ? 1 : selectedProjectId);

    try {
      const result = await apiRequest(`/api/payments/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, project_id: resolvedProjectId }),
      });

      setAllPayments((prev) =>
        prev.map((p) =>
          p.id === payload.id
            ? {
                ...p,
                project_id: resolvedProjectId,
                worker_id: payload.worker_id,
                worker_name: w?.name || p.worker_name,
                worker_role: w?.role || p.worker_role,
                payment_date: payload.payment_date,
                shamsi_year: payload.shamsi_year,
                shamsi_month: payload.shamsi_month,
                amount: payload.amount,
                payment_type: payload.payment_type,
                category: payload.category || p.category,
                receipt_path:
                  result?.receipt_path !== undefined ? result.receipt_path : p.receipt_path,
                note: payload.note,
              }
            : p
        )
      );
      showToast('تراکنش ویرایش شد');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ویرایش تراکنش');
      fetchAllData();
    }
  };

  const handleDeletePayment = async (id: number) => {
    setAllPayments((prev) => prev.filter((p) => p.id !== id));
    try {
      await apiRequest(`/api/payments/${id}`, { method: 'DELETE' });
      showToast('تراکنش حذف شد');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در حذف تراکنش');
      fetchAllData();
    }
  };

  // Optimistic 0ms worker update
  const handleSaveWorker = async (payload: {
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
    carry_over_balance?: number;
    fixed_allowance?: number;
    fixed_allowance_label?: string;
    fixed_deduction?: number;
    fixed_deduction_label?: string;
    active: number;
    notes: string;
  }) => {
    const projName =
      projects.find((p) => p.id === payload.project_id)?.name || 'پروژه الف';

    if (payload.id) {
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === payload.id
            ? {
                ...w,
                project_id: payload.project_id,
                project_name: projName,
                name: payload.name,
                role: payload.role,
                phone: payload.phone,
                wage_type: payload.wage_type,
                base_wage: payload.base_wage,
                overtime_rate: payload.overtime_rate,
                start_date: payload.start_date,
                end_date: payload.end_date,
                calc_mode: payload.calc_mode ?? w.calc_mode ?? 'to_today',
                manual_worked_days:
                  payload.manual_worked_days !== undefined
                    ? payload.manual_worked_days
                    : w.manual_worked_days,
                manual_absent_days:
                  payload.manual_absent_days !== undefined
                    ? payload.manual_absent_days
                    : w.manual_absent_days,
                manual_overtime_hours:
                  payload.manual_overtime_hours !== undefined
                    ? payload.manual_overtime_hours
                    : w.manual_overtime_hours,
                auto_count_days: payload.auto_count_days,
                fridays_off:
                  payload.fridays_off !== undefined
                    ? payload.fridays_off
                    : w.fridays_off ?? 0,
                carry_over_balance:
                  payload.carry_over_balance !== undefined
                    ? payload.carry_over_balance
                    : w.carry_over_balance ?? 0,
                fixed_allowance:
                  payload.fixed_allowance !== undefined
                    ? payload.fixed_allowance
                    : w.fixed_allowance ?? 0,
                fixed_allowance_label:
                  payload.fixed_allowance_label !== undefined
                    ? payload.fixed_allowance_label
                    : w.fixed_allowance_label ?? 'حق غذا و ایاب‌وذهاب',
                fixed_deduction:
                  payload.fixed_deduction !== undefined
                    ? payload.fixed_deduction
                    : w.fixed_deduction ?? 0,
                fixed_deduction_label:
                  payload.fixed_deduction_label !== undefined
                    ? payload.fixed_deduction_label
                    : w.fixed_deduction_label ?? 'بیمه / کسورات ثابت',
                active: payload.active,
                notes: payload.notes,
              }
            : w
        )
      );

      try {
        await apiRequest(`/api/workers/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        setErrorMsg(err.message || 'خطا در ذخیره اطلاعات کارگر');
        fetchAllData();
      }
    } else {
      try {
        await apiRequest('/api/workers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        await fetchAllData();
        showToast(`کارگر جدید در «${projName}» ثبت شد`);
      } catch (err: any) {
        setErrorMsg(err.message || 'خطا در ثبت کارگر جدید');
      }
    }
  };

  const handleSaveWorkerRangeAndDays = (
    worker: Worker,
    updates: {
      start_date: string;
      end_date: string | null;
      calc_mode: CalcMode;
      manual_worked_days: number | null;
      manual_absent_days: number;
      manual_overtime_hours: number | null;
      auto_count_days: number;
      fridays_off?: number;
    }
  ) => {
    handleSaveWorker({
      id: worker.id,
      project_id: worker.project_id || 1,
      name: worker.name,
      role: worker.role,
      phone: worker.phone,
      wage_type: worker.wage_type,
      base_wage: worker.base_wage,
      overtime_rate: worker.overtime_rate,
      start_date: updates.start_date,
      end_date: updates.end_date,
      calc_mode: updates.calc_mode,
      manual_worked_days: updates.manual_worked_days,
      manual_absent_days: updates.manual_absent_days,
      manual_overtime_hours: updates.manual_overtime_hours,
      auto_count_days: updates.auto_count_days,
      fridays_off:
        updates.fridays_off !== undefined ? updates.fridays_off : worker.fridays_off ?? 0,
      carry_over_balance: worker.carry_over_balance ?? 0,
      fixed_allowance: worker.fixed_allowance ?? 0,
      fixed_allowance_label: worker.fixed_allowance_label,
      fixed_deduction: worker.fixed_deduction ?? 0,
      fixed_deduction_label: worker.fixed_deduction_label,
      active: worker.active,
      notes: worker.notes,
    });
  };

  // Wage History handlers
  const handleAddWageHistory = async (
    workerId: number,
    payload: {
      effective_date: string;
      wage_type: 'daily' | 'monthly';
      base_wage: number;
      overtime_rate: number;
      note: string;
    }
  ) => {
    try {
      await apiRequest(`/api/workers/${workerId}/wage-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await fetchAllData();
      showToast('نرخ دستمزد جدید در تاریخچه ثبت شد');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ثبت تاریخچه دستمزد');
    }
  };

  const handleDeleteWageHistory = async (id: number) => {
    try {
      await apiRequest(`/api/wage-history/${id}`, { method: 'DELETE' });
      await fetchAllData();
      showToast('رکورد تاریخچه دستمزد حذف شد');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در حذف رکورد تاریخچه');
    }
  };

  // Month Lock handler
  const handleToggleMonthLock = async (payload: {
    project_id: number;
    shamsi_year: number;
    shamsi_month: number;
    locked: boolean;
    note?: string;
  }) => {
    try {
      const targetProjectIds =
        payload.project_id === 0 ? projects.map((p) => p.id) : [payload.project_id];
      for (const pid of targetProjectIds) {
        await apiRequest('/api/locks/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: pid,
            shamsi_year: payload.shamsi_year,
            shamsi_month: payload.shamsi_month,
            lock: payload.locked,
            note: payload.note || '',
          }),
        });
      }
      await fetchAllData();
      showToast(payload.locked ? 'ماه انتخاب‌شده قفل شد' : 'قفل ماه باز شد');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در تغییر وضعیت قفل ماه');
    }
  };

  // Close Period & Carry-Over Balance handler
  const handleClosePeriod = async (payload: {
    project_id: number | 'all';
    next_start_date: string;
    lock_current_month: boolean;
    shamsi_year: number;
    shamsi_month: number;
  }) => {
    try {
      const targetProjectIds =
        payload.project_id === 'all' ? projects.map((p) => p.id) : [payload.project_id];

      for (const pid of targetProjectIds) {
        const prWorkers = workers.filter((w) => (w.project_id || 1) === pid);
        const workerCarryOvers = prWorkers.map((w) => {
          const acc = allWorkersAccruedSummaries.find((a) => a.workerId === w.id);
          return {
            worker_id: w.id,
            carry_over_balance: Math.round(acc?.netPayableToToday ?? 0),
          };
        });
        if (workerCarryOvers.length === 0) continue;

        await apiRequest('/api/periods/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: pid,
            shamsi_year: payload.shamsi_year,
            shamsi_month: payload.shamsi_month,
            next_start_date: payload.next_start_date,
            worker_carry_overs: workerCarryOvers,
            lock_month: payload.lock_current_month,
          }),
        });
      }
      await fetchAllData();
      showToast('دوره بسته شد و مانده حساب کارگران به دوره جدید منتقل گردید');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در بستن دوره');
    }
  };

  // Toggle Friday holiday mode for all daily-wage workers in the active project
  const handleToggleAllDailyWorkersFridaysOff = async (enabled: boolean) => {
    const dailyInProject = projectWorkers.filter((w) => w.wage_type === 'daily');
    if (dailyInProject.length === 0) return;

    const targetIds = new Set(dailyInProject.map((w) => w.id));
    const flag = enabled ? 1 : 0;

    setWorkers((prev) =>
      prev.map((w) =>
        targetIds.has(w.id)
          ? {
              ...w,
              fridays_off: flag,
              manual_worked_days: null,
            }
          : w
      )
    );

    try {
      await apiRequest('/api/workers/bulk-fridays-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: selectedProjectId,
          enabled,
        }),
      });
      showToast(
        enabled
          ? 'جمعه‌ها برای کارگران روزمزد تعطیل در نظر گرفته شد'
          : 'جمعه‌ها به حالت کاری عادی برگشت'
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در بروزرسانی وضعیت جمعه‌ها');
      fetchAllData();
    }
  };

  const handleDeleteWorker = async (id: number) => {
    setWorkers((prev) => prev.filter((w) => w.id !== id));
    setAllLogs((prev) => prev.filter((l) => l.worker_id !== id));
    setAllPayments((prev) => prev.filter((p) => p.worker_id !== id));
    try {
      await apiRequest(`/api/workers/${id}`, { method: 'DELETE' });
      showToast('کارگر حذف شد');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در حذف کارگر');
      fetchAllData();
    }
  };

  const handleRestoreBackup = async (backupData: any) => {
    await apiRequest('/api/restore/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupData),
    });
    await fetchAllData();
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
        <div className="w-11 h-11 rounded-2xl bg-zinc-200 animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthView
        isSetup={isAuthSetup}
        onAuthenticated={async (userObj) => {
          setCurrentUser(userObj);
          setIsAuthSetup(true);
          setIsAuthenticated(true);
          if (userObj.role === 'supervisor') {
            setActiveTab('daily');
            if (userObj.assignedProjectId) {
              setSelectedProjectId(userObj.assignedProjectId);
            }
          }
          setLoading(true);
          await fetchAllData();
        }}
      />
    );
  }

  const isAllProjects = selectedProjectId === 'all';
  const activeProjIdx = projects.findIndex((p) => p.id === selectedProjectId);
  const activeProjRecord = activeProjIdx >= 0 ? projects[activeProjIdx] : undefined;
  const activeProjTheme = getProjectTheme(
    activeProjRecord?.color,
    Math.max(0, activeProjIdx)
  );
  const activeProjWorkerCount = isAllProjects
    ? workers.length
    : workers.filter((w) => (w.project_id || 1) === selectedProjectId).length;

  const openNewProjectModal = () => {
    setEditingProjectId(null);
    setProjectNameInput('');
    setProjectDescInput('');
    const nextColor = PROJECT_COLOR_KEYS[projects.length % PROJECT_COLOR_KEYS.length];
    setProjectColorInput(nextColor);
    setShowProjectsModal(true);
  };

  const activeTabMeta: Record<ActiveTab, { title: string; subtitle: string }> = {
    monthly: {
      title: 'ورود و خروج و کارکرد',
      subtitle: 'تراز مالی، بستن دوره، قفل ماه و صدور صورت‌حساب یکجا',
    },
    daily: {
      title: 'حضور و غیاب روزانه',
      subtitle: 'ثبت سریع حضور، کپی از روز قبل، مرخصی، غیبت و اضافه‌کاری',
    },
    payments: {
      title: 'مساعده، مزایا و تسویه',
      subtitle: 'ثبت پرداختی‌ها، مزایا، کسورات و آرشیو تصویر رسیدها',
    },
    workers: {
      title: 'کارگران و دیتابیس',
      subtitle: 'پرونده کارگران، تاریخچه نرخ دستمزد و پشتیبان‌گیری SQLite',
    },
    analytics: {
      title: 'داشبورد تحلیلی و گزارش‌ها',
      subtitle: 'مقایسه هزینه پروژه‌ها، روند ماهانه پرداخت‌ها و آمار حضور',
    },
    security: {
      title: 'تیم، گزارش رویدادها و بکاپ خودکار',
      subtitle: 'نقش‌های کاربری، تاریخچه تغییرات و ارسال خودکار بکاپ به تلگرام',
    },
  };

  const allNavItems: {
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'monthly', label: 'کارکرد و تراز مالی', shortLabel: 'کارکرد', icon: CalendarRange },
    { id: 'daily', label: 'حضور روزانه', shortLabel: 'حضور', icon: CalendarCheck },
    { id: 'payments', label: 'مساعده و تسویه', shortLabel: 'مالی', icon: Wallet },
    { id: 'workers', label: 'کارگران و دیتابیس', shortLabel: 'کارگران', icon: Users },
    { id: 'analytics', label: 'داشبورد تحلیلی', shortLabel: 'تحلیل', icon: BarChart3 },
    { id: 'security', label: 'تیم، گزارش و بکاپ', shortLabel: 'تیم', icon: Shield },
  ];

  const desktopNavItems = isSupervisor
    ? allNavItems.filter((item) => item.id === 'daily')
    : allNavItems;

  const mobilePrimaryTabs = isSupervisor
    ? allNavItems.filter((item) => item.id === 'daily')
    : allNavItems.slice(0, 4);

  const renderProjectDropdownMenu = (widthClass: string) => (
    <div
      className={`absolute right-0 top-full mt-2 z-50 ${widthClass} bg-white ring-1 ring-zinc-950/10 rounded-xl shadow-xl p-1.5 space-y-1`}
    >
      <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
        <span>انتخاب پروژه</span>
        <span>کارگران</span>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {projects.map((pr, idx) => {
          const isSelected = selectedProjectId === pr.id;
          const prTheme = getProjectTheme(pr.color, idx);
          const prWorkersCount = workers.filter(
            (w) => (w.project_id || 1) === pr.id
          ).length;

          return (
            <button
              key={pr.id}
              type="button"
              onClick={() => {
                setSelectedProjectId(pr.id);
                setShowProjectDropdown(false);
              }}
              className={`w-full min-h-[38px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
                isSelected
                  ? `${prTheme.lightBg} ${prTheme.lightText}`
                  : 'text-zinc-700 hover:bg-zinc-100/80'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${prTheme.dotClass}`} />
                <span className="truncate">{pr.name}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-mono-num font-medium text-zinc-500">
                  {toPersianDigits(prWorkersCount)}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </div>
            </button>
          );
        })}
      </div>

      {!isSupervisor && projects.length > 1 && (
        <div className="pt-1.5 mt-1 border-t border-zinc-950/5">
          <button
            type="button"
            onClick={() => {
              setSelectedProjectId('all');
              setShowProjectDropdown(false);
            }}
            className={`w-full min-h-[38px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
              selectedProjectId === 'all'
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-700 hover:bg-zinc-100/80'
            }`}
          >
            <span>همه پروژه‌ها (مجموع کل)</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[11px] font-mono-num font-medium ${
                  selectedProjectId === 'all' ? 'text-zinc-300' : 'text-zinc-500'
                }`}
              >
                {toPersianDigits(workers.length)}
              </span>
              {selectedProjectId === 'all' && <Check className="w-3.5 h-3.5 shrink-0" />}
            </div>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 lg:bg-zinc-100 text-zinc-950 pb-20 lg:pb-0">
      {/* Desktop Catalyst Sidebar (Fixed Right in RTL) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:right-0 bg-zinc-100 z-30 no-print">
        {/* Sidebar Header: Brand + Workspace Switcher */}
        <div className="p-4 space-y-3 border-b border-zinc-950/5">
          <a
            href={isSupervisor ? '#daily' : '#monthly'}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(isSupervisor ? 'daily' : 'monthly');
            }}
            className="flex items-center gap-2.5 px-1.5 py-0.5 rounded-lg group"
          >
            <span className="w-8 h-8 rounded-lg bg-zinc-950 text-white shadow-xs inset-ring inset-ring-white/15 flex items-center justify-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400" />
            </span>
            <div className="min-w-0">
              <span className="block text-sm font-extrabold tracking-tight text-zinc-950 leading-none">
                کارکردیار
              </span>
              <span className="block text-[11px] text-zinc-500 mt-1 leading-none">
                {isSupervisor ? 'پنل سرپرست کارگاه' : 'مدیریت کارکرد و دستمزد'}
              </span>
            </div>
          </a>

          {/* Catalyst Workspace / Project Switcher */}
          <div className="relative" ref={desktopProjectDropdownRef}>
            <button
              type="button"
              disabled={isSupervisor}
              onClick={() => !isSupervisor && setShowProjectDropdown((prev) => !prev)}
              className="w-full h-10 px-3 rounded-xl bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs flex items-center justify-between gap-2 transition-colors disabled:opacity-85 disabled:cursor-default"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isAllProjects ? 'bg-zinc-900' : activeProjTheme.dotClass
                  }`}
                />
                <span className="text-xs font-bold text-zinc-950 truncate">
                  {activeProjectName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-mono-num text-zinc-500">
                  {toPersianDigits(activeProjWorkerCount)}
                </span>
                {!isSupervisor && (
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                      showProjectDropdown ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </div>
            </button>

            {!isSupervisor && showProjectDropdown && renderProjectDropdownMenu('w-full')}
          </div>
        </div>

        {/* Sidebar Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          <div className="space-y-1">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full h-10 px-3 rounded-lg text-[13px] flex items-center gap-2.5 transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-zinc-950 font-bold shadow-2xs ring-1 ring-zinc-950/5'
                      : 'text-zinc-600 font-medium hover:bg-zinc-950/5 hover:text-zinc-950'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-emerald-600' : 'text-zinc-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {!isSupervisor && (
            <div className="space-y-1 pt-4 border-t border-zinc-950/5">
              <div className="px-3 pb-1 text-[11px] font-semibold text-zinc-400">
                پروژه‌ها
              </div>
              <button
                type="button"
                onClick={openNewProjectModal}
                className="w-full h-9 px-3 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 flex items-center gap-2.5 transition-colors whitespace-nowrap"
              >
                <FolderKanban className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>مدیریت و حساب پروژه‌ها</span>
              </button>
            </div>
          )}
        </nav>

        {/* Sidebar Pinned Footer: PWA Install + Account & Security */}
        <div className="p-3 border-t border-zinc-950/5 space-y-2">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => setShowSecurityModal(true)}
            className="w-full px-3 py-2.5 rounded-xl hover:bg-zinc-950/5 flex items-center justify-between gap-2 transition-colors text-right"
            title="تنظیمات حساب، رمز ورود و پشتیبان‌گیری"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-white ring-1 ring-zinc-950/10 shadow-2xs flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-bold text-zinc-950 truncate">
                  {currentUser.displayName || currentUser.username}
                </span>
                <span className="block text-[11px] text-zinc-500 truncate">
                  {isSupervisor ? 'سرپرست کارگاه' : 'مدیر کل · امنیت'}
                </span>
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* Mobile Compact Sticky Top Bar (< lg) */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-zinc-950/10 no-print">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 h-12">
          <a
            href={isSupervisor ? '#daily' : '#monthly'}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(isSupervisor ? 'daily' : 'monthly');
            }}
            className="inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <span className="w-6 h-6 rounded-md bg-zinc-950 text-white flex items-center justify-center shrink-0">
              <span className="w-2 h-2 rounded-[2px] bg-emerald-400" />
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-zinc-950">
              کارکردیار
            </span>
          </a>

          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => setShowSecurityModal(true)}
              className="h-8 px-2.5 text-xs font-bold text-zinc-700 bg-white hover:bg-zinc-50 ring-1 ring-zinc-950/10 shadow-2xs rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="تنظیمات حساب و امنیت"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>حساب</span>
            </button>
          </div>
        </div>
      </header>

      {/* Framed Catalyst Content Container */}
      <div className="flex-1 flex flex-col min-w-0 lg:pr-64 lg:p-2.5">
        <div className="flex-1 flex flex-col min-w-0 lg:bg-white lg:rounded-2xl lg:ring-1 lg:ring-zinc-950/5 lg:shadow-xs">
          {/* Desktop Page Header inside the Framed White Canvas */}
          <div className="hidden lg:flex items-center justify-between gap-4 px-7 py-4 border-b border-zinc-950/5 no-print">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-extrabold tracking-tight text-zinc-950 truncate">
                  {activeTabMeta[activeTab].title}
                </h1>
                <span className="text-zinc-300">/</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 truncate">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isAllProjects ? 'bg-zinc-900' : activeProjTheme.dotClass
                    }`}
                  />
                  <span className="truncate">{activeProjectName}</span>
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 truncate">
                {activeTabMeta[activeTab].subtitle}
              </p>
            </div>

            {!isSupervisor && (
              <button
                type="button"
                onClick={openNewProjectModal}
                className="h-9 px-3.5 rounded-lg bg-white hover:bg-zinc-50 text-zinc-900 ring-1 ring-zinc-950/10 shadow-2xs text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>تعریف و حساب پروژه‌ها</span>
              </button>
            )}
          </div>

          {/* Main Workspace Area */}
          <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-5 lg:px-7 py-2.5 sm:py-4 lg:py-6 space-y-3 sm:space-y-4">
            {/* Offline & Pending Sync Indicator */}
            <OfflineIndicator pendingCount={pendingLogsCount} />

            {/* Mobile Compact Project Selector Bar (< lg) */}
            <section className="lg:hidden relative z-20 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 no-print">
              <div className="flex items-center gap-2 min-w-0" ref={mobileProjectDropdownRef}>
                <div className="relative min-w-0">
                  <button
                    type="button"
                    disabled={isSupervisor}
                    onClick={() => !isSupervisor && setShowProjectDropdown((prev) => !prev)}
                    className={`h-8.5 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap max-w-full ${
                      isAllProjects
                        ? 'bg-zinc-950 text-white hover:bg-zinc-800 shadow-xs inset-ring inset-ring-white/10'
                        : activeProjTheme.activeTabBtn
                    }`}
                  >
                    <span className="truncate max-w-[145px] sm:max-w-[240px]">
                      {activeProjectName}
                    </span>
                    <span className="text-[11px] font-normal font-mono-num text-white/80 shrink-0">
                      · {toPersianDigits(activeProjWorkerCount)}
                    </span>
                    {!isSupervisor && (
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 text-white/85 transition-transform duration-200 ${
                          showProjectDropdown ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </button>

                  {!isSupervisor && showProjectDropdown && renderProjectDropdownMenu('w-64 sm:w-72')}
                </div>
              </div>

              {!isSupervisor ? (
                <button
                  type="button"
                  onClick={openNewProjectModal}
                  className="h-8.5 px-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white shadow-xs inset-ring inset-ring-white/10 text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>پروژه‌ها</span>
                </button>
              ) : (
                <span className="text-[11px] font-bold text-zinc-500 px-2">سرپرست کارگاه</span>
              )}
            </section>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 ring-1 ring-rose-600/20 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => fetchAllData()}
                  className="h-8 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs inset-ring inset-ring-white/15 whitespace-nowrap shrink-0 transition-colors"
                >
                  تلاش مجدد
                </button>
              </div>
            )}

            {toastMsg && (
              <div className="fixed top-14 lg:top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-zinc-950 text-white ring-1 ring-white/10 text-xs font-bold shadow-xl whitespace-nowrap">
                {toastMsg}
              </div>
            )}

            {loading ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="h-28 sm:h-32 rounded-2xl bg-zinc-200/70 animate-pulse" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  <div className="h-40 rounded-2xl bg-zinc-200/60 animate-pulse" />
                  <div className="h-40 rounded-2xl bg-zinc-200/60 animate-pulse" />
                </div>
              </div>
            ) : (
              <>
                {!isSupervisor && activeTab === 'monthly' && (
                  <MonthlySheetView
                    activeProjectName={activeProjectName}
                    activeProjectColor={activeProjectColor}
                    selectedProjectId={selectedProjectId}
                    todayIso={todayIso}
                    workers={projectWorkers}
                    accruedSummaries={accruedSummaries}
                    payments={payments}
                    lockedMonths={lockedMonths}
                    viewMode={workerViewMode}
                    onChangeViewMode={handleChangeWorkerViewMode}
                    onToggleAllDailyFridaysOff={handleToggleAllDailyWorkersFridaysOff}
                    onSaveDailyLog={handleSaveDailyLog}
                    onSaveWorkerRangeAndDays={handleSaveWorkerRangeAndDays}
                    onQuickSettleWorker={handleQuickSettleWorker}
                    onToggleMonthLock={handleToggleMonthLock}
                    onClosePeriod={handleClosePeriod}
                    onShowToast={showToast}
                    onOpenWorkersTab={() => setActiveTab('workers')}
                  />
                )}

                {activeTab === 'daily' && (
                  <DailyAttendanceView
                    todayIso={todayIso}
                    selectedDate={selectedDate}
                    onSelectDate={handleSelectDate}
                    workers={projectWorkers}
                    dailyLogs={dailyLogs}
                    accruedSummaries={accruedSummaries}
                    viewMode={workerViewMode}
                    onChangeViewMode={handleChangeWorkerViewMode}
                    onSaveDailyLog={handleSaveDailyLog}
                    onBulkMarkPresent={handleBulkMarkPresent}
                    onCopyPreviousDay={handleCopyPreviousDay}
                    isMonthLocked={isSelectedDateLocked}
                    isSupervisor={isSupervisor}
                    onOpenNewWorker={() => setActiveTab('workers')}
                    onOpenAccruedSheet={() => setActiveTab('monthly')}
                  />
                )}

                {!isSupervisor && activeTab === 'payments' && (
                  <PaymentsView
                    activeProjectName={activeProjectName}
                    selectedProjectId={selectedProjectId}
                    todayIso={todayIso}
                    workers={projectWorkers}
                    accruedSummaries={accruedSummaries}
                    payments={payments}
                    lockedMonths={lockedMonths}
                    onAddPayment={handleAddPayment}
                    onUpdatePayment={handleUpdatePayment}
                    onDeletePayment={handleDeletePayment}
                  />
                )}

                {!isSupervisor && activeTab === 'workers' && (
                  <WorkersView
                    todayIso={todayIso}
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    workers={projectWorkers}
                    wageHistory={wageHistory}
                    dbFileSizeKb={dbFileSizeKb}
                    onSaveWorker={handleSaveWorker}
                    onDeleteWorker={handleDeleteWorker}
                    onAddWageHistory={handleAddWageHistory}
                    onDeleteWageHistory={handleDeleteWageHistory}
                    onRestoreBackup={handleRestoreBackup}
                    onOpenSecurityModal={() => setShowSecurityModal(true)}
                  />
                )}

                {!isSupervisor && activeTab === 'analytics' && (
                  <AnalyticsView
                    todayIso={todayIso}
                    projects={projects}
                    workers={workers}
                    allLogs={allLogs}
                    allPayments={allPayments}
                    allAccruedSummaries={allWorkersAccruedSummaries}
                  />
                )}

                {!isSupervisor && activeTab === 'security' && (
                  <TeamSecurityView
                    projects={projects}
                    currentUserId={currentUser.id}
                    onShowToast={showToast}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* Projects Management & Isolated Accounts Modal */}
      {!isSupervisor && showProjectsModal && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setShowProjectsModal(false)}
        >
          <div
            className="bg-white ring-1 ring-zinc-950/10 rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
              <span className="w-10 h-1 rounded-full bg-zinc-300" />
            </div>

            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-zinc-950/5 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-950 tracking-tight">
                  مدیریت پروژه‌ها و حساب‌ها
                </h3>
                <p className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">
                  تعریف پروژه جدید و مشاهده تراز مالی هر پروژه
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProjectsModal(false)}
                aria-label="بستن"
                className="w-9 h-9 rounded-lg ring-1 ring-zinc-950/10 bg-white flex items-center justify-center text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 overflow-y-auto">
              <form
                onSubmit={handleSaveProject}
                className="bg-zinc-50/80 ring-1 ring-zinc-950/5 rounded-xl p-3.5 sm:p-4 space-y-2.5 sm:space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-zinc-950">
                    {editingProjectId ? 'ویرایش مشخصات پروژه' : 'تعریف پروژه جدید'}
                  </span>
                  {editingProjectId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProjectId(null);
                        setProjectNameInput('');
                        setProjectDescInput('');
                      }}
                      className="text-xs font-semibold text-zinc-500 hover:text-zinc-900"
                    >
                      انصراف
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={projectNameInput}
                    onChange={(e) => setProjectNameInput(e.target.value)}
                    placeholder="نام پروژه (مثلاً: پروژه ولنجک)"
                    className="h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs sm:text-sm hover:border-zinc-950/25 focus:border-zinc-950"
                    required
                  />
                  <input
                    type="text"
                    value={projectDescInput}
                    onChange={(e) => setProjectDescInput(e.target.value)}
                    placeholder="توضیح یا آدرس (اختیاری)"
                    className="h-10 px-3 rounded-lg border border-zinc-950/15 bg-white shadow-2xs text-xs sm:text-sm hover:border-zinc-950/25 focus:border-zinc-950"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PROJECT_COLOR_KEYS.map((cKey) => {
                      const palette = PROJECT_THEMES[cKey];
                      const isPicked = projectColorInput === cKey;
                      return (
                        <button
                          key={cKey}
                          type="button"
                          onClick={() => setProjectColorInput(cKey)}
                          title={palette.label}
                          className={`h-8 px-2 sm:px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors ${
                            isPicked
                              ? `${palette.swatchClass} text-white shadow-xs inset-ring inset-ring-white/15`
                              : 'bg-white text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-zinc-50'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isPicked ? 'bg-white' : palette.dotClass
                            }`}
                          />
                          <span className="hidden sm:inline">{palette.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="submit"
                    className="h-9 px-3.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white shadow-xs inset-ring inset-ring-white/10 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{editingProjectId ? 'ذخیره' : 'ثبت پروژه'}</span>
                  </button>
                </div>
              </form>

              <div className="space-y-2.5 font-mono-num">
                {projectStatsList.map((item, idx) => {
                  const isCurrent = selectedProjectId === item.project.id;
                  const prTheme = getProjectTheme(item.project.color, idx);
                  return (
                    <div
                      key={item.project.id}
                      className={`bg-white rounded-xl p-3.5 sm:p-4 transition-colors space-y-2.5 shadow-2xs ${
                        isCurrent
                          ? `ring-1 ${prTheme.cardBorder} bg-zinc-50/40`
                          : 'ring-1 ring-zinc-950/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${prTheme.dotClass}`}
                            />
                            <h4 className="text-sm font-extrabold text-zinc-950 truncate">
                              {item.project.name}
                            </h4>
                            {isCurrent && (
                              <span className="text-[11px] font-bold text-emerald-700 shrink-0">
                                · فعال
                              </span>
                            )}
                          </div>
                          {item.project.description && (
                            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                              {item.project.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(item.project.id);
                              setShowProjectsModal(false);
                            }}
                            className={`h-8 px-2.5 rounded-lg text-xs font-bold transition-colors ${prTheme.activeTabBtn}`}
                          >
                            مشاهده
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingProjectId(item.project.id);
                              setProjectNameInput(item.project.name);
                              setProjectDescInput(item.project.description || '');
                              setProjectColorInput(prTheme.key);
                            }}
                            className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-600 hover:text-zinc-950 flex items-center justify-center transition-colors"
                            title="ویرایش پروژه"
                            aria-label="ویرایش پروژه"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {projects.length > 1 && (
                            <>
                              {confirmDeleteProjectId === item.project.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProject(item.project.id)}
                                    className="h-8 px-2 rounded-lg bg-rose-600 text-white text-[11px] font-bold"
                                  >
                                    حذف
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteProjectId(null)}
                                    className="h-8 px-2 rounded-lg bg-zinc-100 text-[11px] text-zinc-600 font-semibold"
                                  >
                                    لغو
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteProjectId(item.project.id)}
                                  className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                                  title="حذف پروژه"
                                  aria-label="حذف پروژه"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 border-t border-zinc-950/5 text-right">
                        <div>
                          <span className="text-[10px] text-zinc-500 block">کارگران</span>
                          <span className="text-xs font-bold text-zinc-950">
                            {toPersianDigits(item.workersCount)} نفر
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block">مجموع کارکرد</span>
                          <span className="text-xs font-bold text-zinc-950">
                            {toPersianDigits(item.totalDays)} روز
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block">مساعده</span>
                          <span className="text-xs font-bold text-amber-700">
                            {formatToman(item.totalPaid)} ت
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block">مانده حساب</span>
                          <span className={`text-xs font-extrabold ${prTheme.accentText}`}>
                            {formatToman(item.netPayable)} ت
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSecurityModal && (
        <SecurityModal
          currentUser={currentUser}
          onClose={() => setShowSecurityModal(false)}
          onCredentialsChanged={(newUser) => {
            setCurrentUser((prev) => ({ ...prev, username: newUser }));
            showToast('نام کاربری و رمز عبور بروزرسانی شد');
          }}
          onLogout={handleLogout}
          onDownloadSqliteBackup={
            !isSupervisor
              ? async () => {
                  const ok = await downloadAuthenticatedFile(
                    '/api/backup/sqlite',
                    `karkard-backup-${todayIso}.sqlite`
                  );
                  if (!ok) {
                    setErrorMsg('خطا در دانلود فایل پشتیبان SQLite');
                  } else {
                    showToast('فایل پشتیبان SQLite دانلود شد');
                  }
                }
              : undefined
          }
        />
      )}

      {/* Mobile "More" Bottom Sheet for Analytics & Team/Security */}
      {!isSupervisor && showMobileMoreMenu && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-xs flex items-end justify-center"
          onClick={() => setShowMobileMoreMenu(false)}
        >
          <div
            className="bg-white ring-1 ring-zinc-950/10 rounded-t-3xl w-full p-4 pb-6 space-y-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pb-2 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-zinc-300" />
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('analytics');
                setShowMobileMoreMenu(false);
              }}
              className={`w-full h-12 px-4 rounded-xl flex items-center gap-3 text-sm font-bold transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20'
                  : 'bg-zinc-50 text-zinc-800 hover:bg-zinc-100'
              }`}
            >
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              <span>داشبورد تحلیلی و نمودارها</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('security');
                setShowMobileMoreMenu(false);
              }}
              className={`w-full h-12 px-4 rounded-xl flex items-center gap-3 text-sm font-bold transition-colors ${
                activeTab === 'security'
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20'
                  : 'bg-zinc-50 text-zinc-800 hover:bg-zinc-100'
              }`}
            >
              <Shield className="w-5 h-5 text-emerald-600" />
              <span>تیم، گزارش تغییرات و بکاپ تلگرام</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar (< lg) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-950/10 pb-safe no-print">
        <div
          className={`grid ${
            isSupervisor ? 'grid-cols-1' : 'grid-cols-5'
          } items-stretch h-[58px]`}
        >
          {mobilePrimaryTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative min-h-[44px] flex flex-col items-center justify-center transition-colors ${
                  isActive
                    ? 'text-zinc-950 font-bold'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 inset-x-4 h-0.5 bg-emerald-600 rounded-b-full" />
                )}
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : ''}`} />
                <span className="text-[11px] mt-1 whitespace-nowrap">{item.shortLabel}</span>
              </button>
            );
          })}

          {!isSupervisor && (
            <button
              type="button"
              onClick={() => setShowMobileMoreMenu(true)}
              className={`relative min-h-[44px] flex flex-col items-center justify-center transition-colors ${
                activeTab === 'analytics' || activeTab === 'security'
                  ? 'text-zinc-950 font-bold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {(activeTab === 'analytics' || activeTab === 'security') && (
                <span className="absolute top-0 inset-x-4 h-0.5 bg-emerald-600 rounded-b-full" />
              )}
              <MoreHorizontal
                className={`w-5 h-5 ${
                  activeTab === 'analytics' || activeTab === 'security' ? 'text-emerald-600' : ''
                }`}
              />
              <span className="text-[11px] mt-1 whitespace-nowrap">بیشتر</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
