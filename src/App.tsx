import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarRange,
  Wallet,
  Users,
  Download,
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
  computeWorkerMonthlySummary,
} from './utils/calculations';
import { DailyAttendanceView } from './components/DailyAttendanceView';
import { MonthlySheetView } from './components/MonthlySheetView';
import { PaymentsView } from './components/PaymentsView';
import { WorkersView } from './components/WorkersView';
import {
  AuthView,
  SecurityModal,
  getAuthHeaders,
  setStoredAuthToken,
  withAuthQuery,
} from './components/AuthView';
import {
  PROJECT_COLOR_KEYS,
  PROJECT_THEMES,
  ProjectColorKey,
  getProjectTheme,
} from './utils/projectThemes';

type ActiveTab = 'monthly' | 'daily' | 'payments' | 'workers';

export default function App() {
  const todayIso = getTodayIso();
  const initialShamsi = isoToShamsi(todayIso);

  const [activeTab, setActiveTab] = useState<ActiveTab>('monthly');
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [shamsiYear, setShamsiYear] = useState<number>(initialShamsi.jy);
  const [shamsiMonth, setShamsiMonth] = useState<number>(initialShamsi.jm);

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

  const fetchAllData = useCallback(
    async (dateIso = selectedDate, jy = shamsiYear, jm = shamsiMonth) => {
      try {
        setErrorMsg(null);
        const params = new URLSearchParams({
          workDate: dateIso,
          shamsiYear: String(jy),
          shamsiMonth: String(jm),
        });
        const res = await fetch(`/api/bootstrap?${params.toString()}`, {
          headers: getAuthHeaders(),
        });
        if (res.status === 401) {
          const errBody = await res.json().catch(() => ({}));
          if (errBody.requireSetup) {
            setIsAuthSetup(false);
          }
          setIsAuthenticated(false);
          return;
        }
        if (!res.ok) {
          throw new Error('خطا در ارتباط با سرور SQLite');
        }
        const data: BootstrapResponse = await res.json();
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
    },
    [selectedDate, shamsiYear, shamsiMonth]
  );

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        const res = await fetch('/api/auth/status', {
          headers: getAuthHeaders(),
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
            await fetchAllData(selectedDate, shamsiYear, shamsiMonth);
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

  const monthLogs = useMemo(
    () =>
      allLogs.filter(
        (l) =>
          l.shamsi_year === shamsiYear &&
          l.shamsi_month === shamsiMonth &&
          projectWorkerIds.has(l.worker_id)
      ),
    [allLogs, shamsiYear, shamsiMonth, projectWorkerIds]
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

  const summaries = useMemo(
    () =>
      projectWorkers.map((w) =>
        computeWorkerMonthlySummary(
          w,
          allLogs,
          allPayments,
          shamsiYear,
          shamsiMonth,
          todayIso
        )
      ),
    [projectWorkers, allLogs, allPayments, shamsiYear, shamsiMonth, todayIso]
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
    const sh = isoToShamsi(iso);
    if (sh.jy !== shamsiYear || sh.jm !== shamsiMonth) {
      setShamsiYear(sh.jy);
      setShamsiMonth(sh.jm);
    }
  };

  // Project CRUD handlers
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectNameInput.trim()) return;

    if (editingProjectId) {
      const updatedName = projectNameInput.trim();
      const updatedDesc = projectDescInput.trim();
      const updatedColor = projectColorInput;
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingProjectId
            ? { ...p, name: updatedName, description: updatedDesc, color: updatedColor }
            : p
        )
      );
      setEditingProjectId(null);
      setProjectNameInput('');
      setProjectDescInput('');
      showToast('مشخصات و رنگ پروژه ویرایش شد');

      fetch(`/api/projects/${editingProjectId}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: updatedName,
          description: updatedDesc,
          color: updatedColor,
        }),
      }).catch(() => setErrorMsg('خطا در ویرایش پروژه'));
    } else {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: projectNameInput.trim(),
          description: projectDescInput.trim(),
          color: projectColorInput,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        await fetchAllData(selectedDate, shamsiYear, shamsiMonth);
        if (created?.id) {
          setSelectedProjectId(Number(created.id));
        }
        setProjectNameInput('');
        setProjectDescInput('');
        showToast('پروژه جدید ایجاد شد');
      }
    }
  };

  const handleDeleteProject = async (id: number) => {
    if (projects.length <= 1) {
      showToast('حداقل یک پروژه باید باقی بماند');
      return;
    }
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      setConfirmDeleteProjectId(null);
      await fetchAllData(selectedDate, shamsiYear, shamsiMonth);
      showToast('پروژه و حساب‌های آن حذف شد');
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

    fetch('/api/daily-log', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }).catch(() => {
      setErrorMsg('خطا در ذخیره خودکار');
    });
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

    showToast(`حضور کارگران «${activeProjectName}» ثبت شد`);

    fetch('/api/daily-log/bulk', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        work_date: selectedDate,
        status: 'present',
        project_name: projectName || activeProjectName,
        project_id: selectedProjectId === 'all' ? undefined : selectedProjectId,
      }),
    }).catch(() => {
      setErrorMsg('خطا در ثبت گروهی');
    });
  };

  // Optimistic 0ms payment creation
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

    const optimisticPayment: PaymentRecord = {
      id: Date.now(),
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

    setAllPayments((prev) => [optimisticPayment, ...prev]);
    showToast('تراکنش مالی ثبت شد');

    fetch('/api/payments', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...payload, project_id: resolvedProjectId }),
    })
      .then(() => fetchAllData(selectedDate, shamsiYear, shamsiMonth))
      .catch(() => setErrorMsg('خطا در ثبت پرداخت'));
  };

  const handleQuickSettleWorker = (
    worker: Worker,
    amount: number,
    paymentType: 'advance' | 'salary' | 'deduction' = 'salary',
    customNote?: string,
    paymentDateIso?: string
  ) => {
    const chosenDate = paymentDateIso || getTodayIso();
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
    showToast('تراکنش ویرایش شد');

    fetch(`/api/payments/${payload.id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...payload, project_id: resolvedProjectId }),
    })
      .then(() => fetchAllData(selectedDate, shamsiYear, shamsiMonth))
      .catch(() => setErrorMsg('خطا در ویرایش تراکنش'));
  };

  const handleDeletePayment = async (id: number) => {
    setAllPayments((prev) => prev.filter((p) => p.id !== id));
    showToast('تراکنش حذف شد');
    fetch(`/api/payments/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => setErrorMsg('خطا در حذف تراکنش'));
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

      fetch(`/api/workers/${payload.id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      }).catch(() => setErrorMsg('خطا در ذخیره اطلاعات کارگر'));
    } else {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchAllData(selectedDate, shamsiYear, shamsiMonth);
        showToast(`کارگر جدید در «${projName}» ثبت شد`);
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

  // Toggle Friday holiday mode for all daily-wage workers in the active project
  const handleToggleAllDailyWorkersFridaysOff = (enabled: boolean) => {
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

    showToast(
      enabled
        ? 'جمعه‌ها برای کارگران روزمزد تعطیل در نظر گرفته شد'
        : 'جمعه‌ها به حالت کاری عادی برگشت'
    );

    for (const w of dailyInProject) {
      fetch(`/api/workers/${w.id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...w,
          fridays_off: flag,
          manual_worked_days: null,
        }),
      }).catch(() => {});
    }
  };

  const handleDeleteWorker = async (id: number) => {
    setWorkers((prev) => prev.filter((w) => w.id !== id));
    showToast('کارگر حذف شد');
    fetch(`/api/workers/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => setErrorMsg('خطا در حذف کارگر'));
  };

  const handleRestoreBackup = async (backupData: any) => {
    const res = await fetch('/api/restore/json', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(backupData),
    });
    if (!res.ok) throw new Error('خطا در بازیابی فایل پشتیبان');
    await fetchAllData(selectedDate, shamsiYear, shamsiMonth);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 animate-pulse" />
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
          await fetchAllData(selectedDate, shamsiYear, shamsiMonth);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-slate-900 pb-20 md:pb-10">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-emerald-100 shadow-2xs no-print">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-8 px-3.5 sm:px-5 h-13">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#monthly"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monthly');
            }}
            className="text-base sm:text-lg font-extrabold tracking-tight bg-gradient-to-l from-emerald-600 to-teal-700 bg-clip-text text-transparent whitespace-nowrap shrink-0"
          >
            کارکردیار
          </a>

          {/* Zone 2: 4 concise single-line text navigation links (Desktop) */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            <a
              href="#monthly"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('monthly');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'monthly'
                  ? 'text-emerald-700 font-bold underline underline-offset-8 decoration-2 decoration-emerald-500'
                  : 'hover:text-emerald-600'
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
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'daily'
                  ? 'text-emerald-700 font-bold underline underline-offset-8 decoration-2 decoration-emerald-500'
                  : 'hover:text-emerald-600'
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
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'payments'
                  ? 'text-emerald-700 font-bold underline underline-offset-8 decoration-2 decoration-emerald-500'
                  : 'hover:text-emerald-600'
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
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'workers'
                  ? 'text-emerald-700 font-bold underline underline-offset-8 decoration-2 decoration-emerald-500'
                  : 'hover:text-emerald-600'
              }`}
            >
              کارگران و دیتابیس
            </a>
          </nav>

          {/* Zone 3: Security & SQLite Backup Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSecurityModal(true)}
              className="h-8 px-2.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              title="تغییر نام کاربری، رمز عبور و خروج"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>امنیت و رمز</span>
            </button>
            <a
              href={withAuthQuery('/api/backup/sqlite')}
              download
              className="h-8 px-3 text-[11px] font-bold text-white bg-gradient-to-l from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-600 hover:to-teal-700 shadow-2xs transition-all inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Download className="w-3 h-3" />
              <span>پشتیبان SQLite</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-5 pt-3 sm:pt-4 space-y-3.5">
        {/* Project Selector & Management Bar — Compact Dropdown for Mobile & Desktop */}
        <section className="relative z-30 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-2.5 sm:px-3.5 sm:py-2.5 flex items-center justify-between gap-2 shadow-xs no-print">
          <div className="flex items-center gap-2 min-w-0" ref={projectDropdownRef}>
            <span className="hidden xs:inline-flex sm:inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 shrink-0">
              <FolderKanban className="w-3.5 h-3.5 text-slate-600" />
              <span>پروژه:</span>
            </span>

            <div className="relative">
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
                    className={`h-9 px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-2 transition-all whitespace-nowrap shadow-2xs ${
                      isAll
                        ? 'bg-slate-800 text-white hover:bg-slate-700'
                        : activeTheme.activeTabBtn
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        isAll ? 'bg-emerald-400' : 'bg-white ring-2 ring-white/30'
                      }`}
                    />
                    <span className="truncate max-w-[140px] sm:max-w-[220px]">
                      {activeProjectName}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono-num bg-white/20 text-white shrink-0">
                      {toPersianDigits(activeCount)} نفر
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                        showProjectDropdown ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                );
              })()}

              {/* Dropdown Menu List */}
              {showProjectDropdown && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-64 sm:w-72 bg-white border border-slate-200/90 rounded-2xl shadow-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 flex items-center justify-between">
                    <span>انتخاب پروژه فعال</span>
                    <span>تعداد کارگر</span>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
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
                          className={`w-full h-9 px-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                            isSelected
                              ? `${prTheme.lightBg} ${prTheme.lightText} border ${prTheme.lightBorder}`
                              : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${prTheme.dotClass}`}
                            />
                            <span className="truncate font-extrabold">{pr.name}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono-num font-bold">
                              {toPersianDigits(prWorkersCount)} نفر
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {projects.length > 1 && (
                    <div className="pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId('all');
                          setShowProjectDropdown(false);
                        }}
                        className={`w-full h-9 px-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                          selectedProjectId === 'all'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-extrabold">همه پروژه‌ها (مجموع)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-num font-bold ${
                              selectedProjectId === 'all'
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {toPersianDigits(workers.length)} نفر
                          </span>
                          {selectedProjectId === 'all' && (
                            <Check className="w-3.5 h-3.5 shrink-0" />
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
            className="w-fit h-9 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-extrabold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-300" />
            <span>تعریف و حساب پروژه‌ها</span>
          </button>
        </section>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => fetchAllData(selectedDate, shamsiYear, shamsiMonth)}
              className="px-3 py-1 rounded-lg bg-rose-600 text-white font-semibold"
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {toastMsg && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-700 text-white text-xs font-bold shadow-lg shadow-emerald-900/20">
            {toastMsg}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="h-28 rounded-2xl bg-emerald-100/50 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="h-40 rounded-2xl bg-sky-100/50 animate-pulse" />
              <div className="h-40 rounded-2xl bg-amber-100/50 animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'monthly' && (
              <MonthlySheetView
                activeProjectName={activeProjectName}
                activeProjectColor={activeProjectColor}
                shamsiYear={shamsiYear}
                shamsiMonth={shamsiMonth}
                onChangeMonth={(y, m) => {
                  setShamsiYear(y);
                  setShamsiMonth(m);
                }}
                workers={projectWorkers}
                summaries={summaries}
                accruedSummaries={accruedSummaries}
                monthLogs={monthLogs}
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
                savingWorkerId={null}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentsView
                activeProjectName={activeProjectName}
                shamsiYear={shamsiYear}
                shamsiMonth={shamsiMonth}
                workers={projectWorkers}
                summaries={summaries}
                payments={payments}
                onAddPayment={handleAddPayment}
                onUpdatePayment={handleUpdatePayment}
                onDeletePayment={handleDeletePayment}
              />
            )}

            {activeTab === 'workers' && (
              <WorkersView
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

      {/* Separate Modal Window for Defining Projects & Viewing Isolated Project Accounts */}
      {showProjectsModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setShowProjectsModal(false)}
        >
          <div
            className="bg-white border border-emerald-100 rounded-2xl max-w-lg w-full p-4 sm:p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    مدیریت پروژه‌ها و تفکیک حساب‌ها
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تعریف پروژه جدید و مشاهده خلاصه کارکرد و حساب هر پروژه
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProjectsModal(false)}
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form to Add / Edit Project with Color Picker */}
            <form
              onSubmit={handleSaveProject}
              className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-3 shrink-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900">
                  {editingProjectId ? 'ویرایش مشخصات و رنگ پروژه' : 'تعریف پروژه جدید'}
                </span>
                {editingProjectId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProjectId(null);
                      setProjectNameInput('');
                      setProjectDescInput('');
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    انصراف از ویرایش
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  placeholder="نام پروژه (مثلاً: پروژه ج - ساختمان ولنجک)"
                  className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:border-emerald-600"
                  required
                />
                <input
                  type="text"
                  value={projectDescInput}
                  onChange={(e) => setProjectDescInput(e.target.value)}
                  placeholder="توضیح یا آدرس (اختیاری)"
                  className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              {/* Project Color Swatch Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-600 ml-1">
                    رنگ پروژه:
                  </span>
                  {PROJECT_COLOR_KEYS.map((cKey) => {
                    const palette = PROJECT_THEMES[cKey];
                    const isPicked = projectColorInput === cKey;
                    return (
                      <button
                        key={cKey}
                        type="button"
                        onClick={() => setProjectColorInput(cKey)}
                        className={`w-fit h-7 px-2.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 border transition-all ${
                          isPicked
                            ? `${palette.swatchClass} text-white border-transparent shadow-xs scale-105`
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            isPicked ? 'bg-white' : palette.dotClass
                          }`}
                        />
                        <span>{palette.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="submit"
                  className="w-fit h-8 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1 shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{editingProjectId ? 'ذخیره ویرایش' : 'ثبت پروژه جدید'}</span>
                </button>
              </div>
            </form>

            {/* List of Projects with Isolated Worker & Financial Summary */}
            <div className="space-y-2.5 overflow-y-auto pr-0.5 font-mono-num">
              {projectStatsList.map((item, idx) => {
                const isCurrent = selectedProjectId === item.project.id;
                const prTheme = getProjectTheme(item.project.color, idx);
                return (
                  <div
                    key={item.project.id}
                    className={`rounded-2xl p-3 border transition-all space-y-2.5 ${prTheme.cardSoftBg} ${prTheme.cardBorder}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${prTheme.dotClass}`} />
                          <h4 className="text-sm font-extrabold text-slate-900">
                            {item.project.name}
                          </h4>
                          {isCurrent && (
                            <span className="w-fit px-2 py-0.5 rounded-md bg-slate-900 text-white text-[9px] font-bold">
                              پروژه فعال
                            </span>
                          )}
                        </div>
                        {item.project.description && (
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {item.project.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(item.project.id);
                            setShowProjectsModal(false);
                          }}
                          className={`w-fit h-8 px-2.5 rounded-xl text-[11px] font-extrabold transition-all ${prTheme.activeTabBtn}`}
                        >
                          مشاهده پروژه
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingProjectId(item.project.id);
                            setProjectNameInput(item.project.name);
                            setProjectDescInput(item.project.description || '');
                            setProjectColorInput(prTheme.key);
                          }}
                          className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center shadow-2xs"
                          title="ویرایش نام و رنگ پروژه"
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
                                  className="w-fit h-8 px-2 rounded-lg bg-rose-600 text-white text-[10px] font-bold"
                                >
                                  حذف
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteProjectId(null)}
                                  className="w-fit h-8 px-2 rounded-lg bg-white text-[10px] text-slate-600"
                                >
                                  لغو
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteProjectId(item.project.id)}
                                className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-600 flex items-center justify-center shadow-2xs"
                                title="حذف پروژه"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Isolated Project Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center bg-white/95 rounded-xl p-2 border border-white shadow-2xs">
                      <div>
                        <span className="text-[9px] text-slate-500 block">تعداد کارگران</span>
                        <span className="text-xs font-extrabold text-slate-900">
                          {toPersianDigits(item.workersCount)} نفر
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block">مجموع کارکرد</span>
                        <span className={`text-xs font-extrabold ${prTheme.accentText}`}>
                          {toPersianDigits(item.totalDays)} روز
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block">مساعده پرداختی</span>
                        <span className="text-xs font-extrabold text-amber-700">
                          {formatToman(item.totalPaid)} ت
                        </span>
                      </div>
                      <div>
                        <span className={`text-[9px] font-bold block ${prTheme.accentText}`}>
                          مانده حساب پروژه
                        </span>
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
        />
      )}

      {/* Mobile Fixed Bottom Navigation Bar (Natural Thumb Zone) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-emerald-100 shadow-lg no-print">
        <div className="grid grid-cols-4 items-center h-16 px-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'monthly'
                ? 'text-emerald-700 font-bold bg-emerald-50/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarRange className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">ورود/خروج و کارکرد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'daily'
                ? 'text-emerald-700 font-bold bg-emerald-50/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarCheck className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">حضور روزانه</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'payments'
                ? 'text-emerald-700 font-bold bg-emerald-50/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">مساعده و مالی</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('workers')}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center transition-all ${
              activeTab === 'workers'
                ? 'text-emerald-700 font-bold bg-emerald-50/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[11px] mt-1 whitespace-nowrap">کارگران</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
