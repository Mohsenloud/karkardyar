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
} from 'lucide-react';
import {
  AttendanceStatus,
  BootstrapResponse,
  CalcMode,
  DailyLog,
  PaymentRecord,
  Project,
  Worker,
} from './types';
import {
  formatToman,
  getTodayIso,
  isoToShamsi,
  toPersianDigits,
} from './utils/jalali';
import {
  computeWorkerAccruedSummary,
} from './utils/calculations';
import { DailyAttendanceView } from './components/DailyAttendanceView';
import { MonthlySheetView } from './components/MonthlySheetView';
import { PaymentsView } from './components/PaymentsView';
import { WorkersView } from './components/WorkersView';
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

type ActiveTab = 'monthly' | 'daily' | 'payments' | 'workers';

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
  const [dbFileSizeKb, setDbFileSizeKb] = useState<number>(0);

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
  const projectDropdownRef = useRef<HTMLDivElement | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [projectNameInput, setProjectNameInput] = useState<string>('');
  const [projectDescInput, setProjectDescInput] = useState<string>('');
  const [projectColorInput, setProjectColorInput] = useState<ProjectColorKey>('violet');
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<number | null>(null);

  useEffect(() => {
    const handleOutsideClick = (ev: MouseEvent) => {
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(ev.target as Node)
      ) {
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
  const [currentUsername, setCurrentUsername] = useState<string>('admin');
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2200);
  };

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

  const fetchAllData = useCallback(async () => {
    try {
      setErrorMsg(null);
      const data: BootstrapResponse = await apiRequest('/api/bootstrap');
      if (data.todayIso) {
        setServerTodayIso((prev) => {
          if (selectedDate === prev && data.todayIso !== prev) {
            setSelectedDate(data.todayIso);
          }
          return data.todayIso;
        });
      }
      const loadedProjects = data.projects || [];
      setProjects(loadedProjects);
      setSelectedProjectId((prev) => {
        if (prev === 'all') return 'all';
        if (loadedProjects.some((p) => p.id === prev)) return prev;
        return loadedProjects[0]?.id ?? 'all';
      });
      setWorkers(data.workers || []);
      setAllLogs(data.allLogs || []);
      setAllPayments(data.allPayments || []);
      setDbFileSizeKb(data.dbFileSizeKb || 0);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در بارگذاری اطلاعات');
    } finally {
      setLoading(false);
    }
  }, [apiRequest, selectedDate]);

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
          if (status.username) {
            setCurrentUsername(status.username);
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

  // All accrued summaries across all workers (used for per-project overview cards in modal)
  const allWorkersAccruedSummaries = useMemo(
    () =>
      workers.map((w) =>
        computeWorkerAccruedSummary(w, allLogs, allPayments, todayIso)
      ),
    [workers, allLogs, allPayments, todayIso]
  );

  // Accrued summaries for the currently selected project
  const accruedSummaries = useMemo(
    () =>
      allWorkersAccruedSummaries.filter((a) => projectWorkerIds.has(a.workerId)),
    [allWorkersAccruedSummaries, projectWorkerIds]
  );

  // Per-project statistics (how many workers, how many worked days, total earned, total paid, net payable)
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

  // Optimistic 0ms daily log update
  const handleSaveDailyLog = async (payload: {
    worker_id: number;
    work_date: string;
    status: AttendanceStatus | 'clear';
    days_equiv?: number;
    overtime_hours?: number;
    bonus_amount?: number;
    project_name?: string;
    note?: string;
  }) => {
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

  // Payment creation awaiting real DB ID to prevent 404 on immediate edit/delete
  const handleAddPayment = async (payload: {
    worker_id: number;
    payment_date: string;
    shamsi_year: number;
    shamsi_month: number;
    amount: number;
    payment_type: 'advance' | 'salary' | 'deduction';
    note: string;
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
    paymentType: 'advance' | 'salary' | 'deduction' = 'salary',
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
    payment_type: 'advance' | 'salary' | 'deduction';
    note: string;
  }) => {
    const w = workers.find((x) => x.id === payload.worker_id);
    const resolvedProjectId =
      w?.project_id || (selectedProjectId === 'all' ? 1 : selectedProjectId);

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
              note: payload.note,
            }
          : p
      )
    );

    try {
      await apiRequest(`/api/payments/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, project_id: resolvedProjectId }),
      });
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
      active: worker.active,
      notes: worker.notes,
    });
  };

  // Toggle Friday holiday mode for all daily-wage workers in the active project (single atomic request)
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-11 h-11 rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthView
        isSetup={isAuthSetup}
        onAuthenticated={async (username) => {
          setCurrentUsername(username);
          setIsAuthSetup(true);
          setIsAuthenticated(true);
          setLoading(true);
          await fetchAllData();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-20 md:pb-12">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 no-print">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 sm:gap-8 px-3 sm:px-6 h-12 md:h-14">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#monthly"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monthly');
            }}
            className="text-base sm:text-lg font-extrabold tracking-tight text-emerald-700 hover:text-emerald-800 transition-colors whitespace-nowrap shrink-0"
          >
            کارکردیار
          </a>

          {/* Zone 2: 4 concise single-line text navigation links (Desktop) */}
          <nav className="hidden md:flex items-center gap-7 h-full text-xs lg:text-[13px] font-medium text-slate-600">
            <a
              href="#monthly"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('monthly');
              }}
              className={`h-full inline-flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'monthly'
                  ? 'border-emerald-700 text-slate-950 font-bold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              ورود و خروج و کارکرد
            </a>
            <a
              href="#daily"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('daily');
              }}
              className={`h-full inline-flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'daily'
                  ? 'border-emerald-700 text-slate-950 font-bold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              حضور روزانه
            </a>
            <a
              href="#payments"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('payments');
              }}
              className={`h-full inline-flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'payments'
                  ? 'border-emerald-700 text-slate-950 font-bold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              مساعده و تسویه
            </a>
            <a
              href="#workers"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('workers');
              }}
              className={`h-full inline-flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'workers'
                  ? 'border-emerald-700 text-slate-950 font-bold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              کارگران و دیتابیس
            </a>
          </nav>

          {/* Zone 3: Single Primary Account & Security Action */}
          <button
            type="button"
            onClick={() => setShowSecurityModal(true)}
            className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="تنظیمات حساب، رمز ورود و پشتیبان‌گیری"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="hidden sm:inline">حساب و امنیت</span>
            <span className="sm:hidden">حساب</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-2.5 sm:pt-5 space-y-3 sm:space-y-4">
        {/* Project Selector & Management Bar */}
        <section className="relative z-20 bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-2.5 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2 min-w-0" ref={projectDropdownRef}>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 shrink-0">
              <FolderKanban className="w-4 h-4 text-slate-400" />
              <span>پروژه فعال:</span>
            </span>

            <div className="relative min-w-0">
              {(() => {
                const isAll = selectedProjectId === 'all';
                const activeIdx = projects.findIndex((p) => p.id === selectedProjectId);
                const activePr = activeIdx >= 0 ? projects[activeIdx] : undefined;
                const activeTheme = getProjectTheme(
                  activePr?.color,
                  Math.max(0, activeIdx)
                );
                const activeCount = isAll
                  ? workers.length
                  : workers.filter((w) => (w.project_id || 1) === selectedProjectId)
                      .length;

                return (
                  <button
                    type="button"
                    onClick={() => setShowProjectDropdown((prev) => !prev)}
                    className={`h-9 sm:min-h-[38px] px-3 sm:px-3.5 rounded-xl text-xs sm:text-[13px] font-bold inline-flex items-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap max-w-full ${
                      isAll
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : activeTheme.activeTabBtn
                    }`}
                  >
                    <span className="truncate max-w-[140px] sm:max-w-[260px]">
                      {activeProjectName}
                    </span>
                    <span className="text-[11px] font-normal font-mono-num text-white/80 shrink-0">
                      · {toPersianDigits(activeCount)}
                      <span className="hidden sm:inline"> نفر</span>
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-white/85 transition-transform duration-200 ${
                        showProjectDropdown ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                );
              })()}

              {/* Dropdown Menu List */}
              {showProjectDropdown && (
                <div className="absolute right-0 top-full mt-2 z-50 w-64 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-lg p-1.5 space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 flex items-center justify-between">
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
                          className={`w-full min-h-[42px] px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
                            isSelected
                              ? `${prTheme.lightBg} ${prTheme.lightText}`
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${prTheme.dotClass}`}
                            />
                            <span className="truncate">{pr.name}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono-num font-medium text-slate-500">
                              {toPersianDigits(prWorkersCount)} نفر
                            </span>
                            {isSelected && <Check className="w-4 h-4 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {projects.length > 1 && (
                    <div className="pt-1.5 mt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId('all');
                          setShowProjectDropdown(false);
                        }}
                        className={`w-full min-h-[42px] px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
                          selectedProjectId === 'all'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>همه پروژه‌ها (مجموع کل)</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] font-mono-num font-medium ${
                              selectedProjectId === 'all' ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {toPersianDigits(workers.length)} نفر
                          </span>
                          {selectedProjectId === 'all' && (
                            <Check className="w-4 h-4 shrink-0" />
                          )}
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingProjectId(null);
              setProjectNameInput('');
              setProjectDescInput('');
              const nextColor =
                PROJECT_COLOR_KEYS[projects.length % PROJECT_COLOR_KEYS.length];
              setProjectColorInput(nextColor);
              setShowProjectsModal(true);
            }}
            className="h-9 sm:min-h-[38px] px-3 sm:px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">تعریف و حساب پروژه‌ها</span>
            <span className="sm:hidden">پروژه‌ها</span>
          </button>
        </section>

        {errorMsg && (
          <div className="p-3 rounded-xl sm:rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => fetchAllData()}
              className="h-8 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold whitespace-nowrap shrink-0 transition-colors"
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {toastMsg && (
          <div className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg whitespace-nowrap">
            {toastMsg}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 sm:space-y-4">
            <div className="h-28 sm:h-32 rounded-2xl bg-slate-200/70 animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <div className="h-40 rounded-2xl bg-slate-200/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-slate-200/60 animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'monthly' && (
              <MonthlySheetView
                activeProjectName={activeProjectName}
                activeProjectColor={activeProjectColor}
                todayIso={todayIso}
                workers={projectWorkers}
                accruedSummaries={accruedSummaries}
                payments={payments}
                viewMode={workerViewMode}
                onChangeViewMode={handleChangeWorkerViewMode}
                onToggleAllDailyFridaysOff={handleToggleAllDailyWorkersFridaysOff}
                onSaveDailyLog={handleSaveDailyLog}
                onSaveWorkerRangeAndDays={handleSaveWorkerRangeAndDays}
                onQuickSettleWorker={handleQuickSettleWorker}
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
                onOpenNewWorker={() => setActiveTab('workers')}
                onOpenAccruedSheet={() => setActiveTab('monthly')}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentsView
                activeProjectName={activeProjectName}
                selectedProjectId={selectedProjectId}
                todayIso={todayIso}
                workers={projectWorkers}
                accruedSummaries={accruedSummaries}
                payments={payments}
                onAddPayment={handleAddPayment}
                onUpdatePayment={handleUpdatePayment}
                onDeletePayment={handleDeletePayment}
              />
            )}

            {activeTab === 'workers' && (
              <WorkersView
                todayIso={todayIso}
                projects={projects}
                selectedProjectId={selectedProjectId}
                workers={projectWorkers}
                dbFileSizeKb={dbFileSizeKb}
                onSaveWorker={handleSaveWorker}
                onDeleteWorker={handleDeleteWorker}
                onRestoreBackup={handleRestoreBackup}
                onOpenSecurityModal={() => setShowSecurityModal(true)}
              />
            )}
          </>
        )}
      </main>

      {/* Projects Management & Isolated Accounts Modal */}
      {showProjectsModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
          onClick={() => setShowProjectsModal(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[92dvh] flex flex-col shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Sheet Handle */}
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
              <span className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  مدیریت پروژه‌ها و حساب‌ها
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  تعریف پروژه جدید و مشاهده تراز مالی هر پروژه
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProjectsModal(false)}
                aria-label="بستن"
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 overflow-y-auto">
              {/* Form to Add / Edit Project */}
              <form
                onSubmit={handleSaveProject}
                className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 space-y-2.5 sm:space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900">
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
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800"
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
                    className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:border-emerald-600"
                    required
                  />
                  <input
                    type="text"
                    value={projectDescInput}
                    onChange={(e) => setProjectDescInput(e.target.value)}
                    placeholder="توضیح یا آدرس (اختیاری)"
                    className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm focus:border-emerald-600"
                  />
                </div>

                {/* Color Picker + Submit */}
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
                          className={`h-8 px-2 sm:px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 border transition-colors ${
                            isPicked
                              ? `${palette.swatchClass} text-white border-transparent`
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
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
                    className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{editingProjectId ? 'ذخیره' : 'ثبت پروژه'}</span>
                  </button>
                </div>
              </form>

              {/* List of Projects — Clean Single-Elevation Rows */}
              <div className="space-y-2.5 font-mono-num">
                {projectStatsList.map((item, idx) => {
                  const isCurrent = selectedProjectId === item.project.id;
                  const prTheme = getProjectTheme(item.project.color, idx);
                  return (
                    <div
                      key={item.project.id}
                      className={`bg-white rounded-2xl p-3.5 sm:p-4 border transition-colors space-y-2.5 ${
                        isCurrent
                          ? `${prTheme.cardBorder} ring-1 ring-inset ring-slate-200`
                          : 'border-slate-200/90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${prTheme.dotClass}`}
                            />
                            <h4 className="text-sm font-extrabold text-slate-900 truncate">
                              {item.project.name}
                            </h4>
                            {isCurrent && (
                              <span className="text-[11px] font-bold text-emerald-700 shrink-0">
                                · فعال
                              </span>
                            )}
                          </div>
                          {item.project.description && (
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
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
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors"
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
                                    className="h-8 px-2 rounded-lg bg-slate-100 text-[11px] text-slate-600 font-semibold"
                                  >
                                    لغو
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteProjectId(item.project.id)}
                                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
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

                      {/* Hairline-divided metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 border-t border-slate-100 text-right">
                        <div>
                          <span className="text-[10px] text-slate-500 block">کارگران</span>
                          <span className="text-xs font-bold text-slate-900">
                            {toPersianDigits(item.workersCount)} نفر
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">مجموع کارکرد</span>
                          <span className="text-xs font-bold text-slate-900">
                            {toPersianDigits(item.totalDays)} روز
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">مساعده</span>
                          <span className="text-xs font-bold text-amber-700">
                            {formatToman(item.totalPaid)} ت
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">مانده حساب</span>
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
          currentUsername={currentUsername}
          onClose={() => setShowSecurityModal(false)}
          onCredentialsChanged={(newUser) => {
            setCurrentUsername(newUser);
            showToast('نام کاربری و رمز عبور بروزرسانی شد');
          }}
          onLogout={handleLogout}
          onDownloadSqliteBackup={async () => {
            const ok = await downloadAuthenticatedFile(
              '/api/backup/sqlite',
              `karkard-backup-${todayIso}.sqlite`
            );
            if (!ok) {
              setErrorMsg('خطا در دانلود فایل پشتیبان SQLite');
            } else {
              showToast('فایل پشتیبان SQLite دانلود شد');
            }
          }}
        />
      )}

      {/* Mobile Fixed Bottom Navigation Bar (Sticky budget < 15% of viewport) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 pb-safe no-print">
        <div className="grid grid-cols-4 items-stretch h-[58px]">
          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'monthly'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {activeTab === 'monthly' && (
              <span className="absolute top-0 inset-x-5 h-0.5 bg-emerald-700 rounded-b-full" />
            )}
            <CalendarRange className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">کارکرد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'daily'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {activeTab === 'daily' && (
              <span className="absolute top-0 inset-x-5 h-0.5 bg-emerald-700 rounded-b-full" />
            )}
            <CalendarCheck className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">حضور</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'payments'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {activeTab === 'payments' && (
              <span className="absolute top-0 inset-x-5 h-0.5 bg-emerald-700 rounded-b-full" />
            )}
            <Wallet className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">مالی</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('workers')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'workers'
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {activeTab === 'workers' && (
              <span className="absolute top-0 inset-x-5 h-0.5 bg-emerald-700 rounded-b-full" />
            )}
            <Users className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">کارگران</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
