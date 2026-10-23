import {
  AccruedToTodaySummary,
  DailyLog,
  PaymentRecord,
  Worker,
  WorkerMonthlySummary,
} from '../types';
import { addDaysIso, isoToShamsi, shamsiToIso } from './jalali';

export function diffDaysInclusive(startIso: string, endIso: string): number {
  if (!startIso || !endIso || startIso > endIso) return 0;
  const [y1, m1, d1] = startIso.split('-').map(Number);
  const [y2, m2, d2] = endIso.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24)) + 1;
}

export function computeWorkerAccruedSummary(
  w: Worker,
  allLogs: DailyLog[],
  allPayments: PaymentRecord[],
  todayIso: string
): AccruedToTodaySummary {
  const todayShamsi = isoToShamsi(todayIso);
  const startDate: string = w.start_date || shamsiToIso(todayShamsi.jy, todayShamsi.jm, 1);
  const endDate: string | null = w.end_date || null;
  const calcMode = w.calc_mode || 'to_today';
  const autoCount = w.auto_count_days !== 0;

  const targetEndIso =
    calcMode === 'full_range' && endDate
      ? endDate
      : endDate && endDate < todayIso
      ? endDate
      : todayIso;

  const notStartedYet = startDate > targetEndIso;
  const isPeriodFinished = Boolean(endDate && endDate < todayIso);

  const calendarDaysElapsedToToday =
    startDate > todayIso
      ? 0
      : Math.max(
          0,
          diffDaysInclusive(startDate, endDate && endDate < todayIso ? endDate : todayIso)
        );

  const activeWindowDays = notStartedYet
    ? 0
    : Math.max(0, diffDaysInclusive(startDate, targetEndIso));

  const totalPeriodDays = endDate
    ? Math.max(1, diffDaysInclusive(startDate, endDate))
    : null;

  let remainingDaysToWork: number | null = null;
  if (endDate) {
    if (endDate <= todayIso) {
      remainingDaysToWork = 0;
    } else {
      const firstFutureDay = startDate > todayIso ? startDate : addDaysIso(todayIso, 1);
      remainingDaysToWork = Math.max(0, diffDaysInclusive(firstFutureDay, endDate));
    }
  }

  const periodLogs = allLogs.filter(
    (l) =>
      l.worker_id === w.id &&
      l.work_date >= startDate &&
      (!endDate || l.work_date <= endDate)
  );

  const logsInCalcWindow = periodLogs.filter((l) => l.work_date <= targetEndIso);

  const calendarAbsentDays = logsInCalcWindow.filter((l) => l.status === 'absent').length;
  const halfDaysCount = logsInCalcWindow.filter((l) => l.status === 'half').length;
  const manualAbsentDays = Number(w.manual_absent_days || 0);
  const totalAbsentDays = calendarAbsentDays + manualAbsentDays;

  let rawCalculatedDays = 0;
  if (!notStartedYet) {
    if (autoCount) {
      const loggedDatesCount = logsInCalcWindow.length;
      const loggedDaysSum = logsInCalcWindow.reduce(
        (s, l) => s + Number(l.days_equiv || 0),
        0
      );
      const unloggedDays = Math.max(0, activeWindowDays - loggedDatesCount);
      rawCalculatedDays = Math.max(0, unloggedDays + loggedDaysSum - manualAbsentDays);
    } else {
      rawCalculatedDays = Math.max(
        0,
        logsInCalcWindow.reduce((s, l) => s + Number(l.days_equiv || 0), 0) - manualAbsentDays
      );
    }
  }

  const isDaysManuallyEdited =
    w.manual_worked_days !== null && w.manual_worked_days !== undefined;

  const effectiveDaysToToday = isDaysManuallyEdited
    ? Math.max(0, Number(w.manual_worked_days))
    : rawCalculatedDays;

  const loggedOvertimeHours = logsInCalcWindow.reduce(
    (s, l) => s + Number(l.overtime_hours || 0),
    0
  );
  const effectiveOvertimeHours =
    w.manual_overtime_hours !== null && w.manual_overtime_hours !== undefined
      ? Math.max(0, Number(w.manual_overtime_hours))
      : loggedOvertimeHours;

  const bonusToToday = logsInCalcWindow.reduce(
    (s, l) => s + Number(l.bonus_amount || 0),
    0
  );

  const dailyRate =
    w.wage_type === 'daily'
      ? Number(w.base_wage || 0)
      : Number(w.base_wage || 0) / 30;

  const baseEarnedToToday = Math.round(effectiveDaysToToday * dailyRate);
  const overtimeEarnedToToday = Math.round(
    effectiveOvertimeHours * Number(w.overtime_rate || 0)
  );

  const workerPaymentsToToday = allPayments.filter(
    (p) => p.worker_id === w.id
  );

  const deductionsToToday = workerPaymentsToToday
    .filter((p) => p.payment_type === 'deduction')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const paidToToday = workerPaymentsToToday
    .filter((p) => p.payment_type === 'advance' || p.payment_type === 'salary')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const grossEarnedToToday =
    baseEarnedToToday + overtimeEarnedToToday + bonusToToday - deductionsToToday;
  const netPayableToToday = grossEarnedToToday - paidToToday;

  const projectedRemainingWage =
    remainingDaysToWork !== null ? Math.round(remainingDaysToWork * dailyRate) : null;

  return {
    workerId: w.id,
    startDate,
    endDate,
    todayIso,
    calcMode,
    notStartedYet,
    isPeriodFinished,
    calendarDaysElapsedToToday,
    remainingDaysToWork,
    totalPeriodDays,
    calendarAbsentDays,
    manualAbsentDays,
    totalAbsentDays,
    halfDaysCount,
    rawCalculatedDays,
    effectiveDaysToToday,
    isDaysManuallyEdited,
    loggedOvertimeHours,
    effectiveOvertimeHours,
    baseEarnedToToday,
    overtimeEarnedToToday,
    bonusToToday,
    deductionsToToday,
    grossEarnedToToday,
    paidToToday,
    netPayableToToday,
    projectedRemainingWage,
    periodLogs,
  };
}

export function computeWorkerMonthlySummary(
  w: Worker,
  allLogs: DailyLog[],
  allPayments: PaymentRecord[],
  shamsiYear: number,
  shamsiMonth: number,
  todayIso: string
): WorkerMonthlySummary {
  const monthFirstIso = shamsiToIso(shamsiYear, shamsiMonth, 1);
  const monthLen = shamsiMonth <= 6 ? 31 : shamsiMonth <= 11 ? 30 : 29;
  const monthLastIso = shamsiToIso(shamsiYear, shamsiMonth, monthLen);

  const wLogs = allLogs.filter(
    (l) =>
      l.worker_id === w.id &&
      l.shamsi_year === shamsiYear &&
      l.shamsi_month === shamsiMonth &&
      l.work_date <= todayIso
  );
  const wPayments = allPayments.filter(
    (p) =>
      p.worker_id === w.id &&
      p.shamsi_year === shamsiYear &&
      p.shamsi_month === shamsiMonth
  );

  const startDate = w.start_date || monthFirstIso;
  const endDate = w.end_date || null;

  const activeRangeStart = startDate > monthFirstIso ? startDate : monthFirstIso;
  let activeRangeEnd = todayIso < monthLastIso ? todayIso : monthLastIso;
  if (endDate && endDate < activeRangeEnd) {
    activeRangeEnd = endDate;
  }

  const logsInActiveRange = wLogs.filter(
    (l) => l.work_date >= activeRangeStart && l.work_date <= activeRangeEnd
  );

  let loggedDays = 0;
  if (w.auto_count_days !== 0 && activeRangeStart <= activeRangeEnd) {
    const elapsedInMonth = Math.max(0, diffDaysInclusive(activeRangeStart, activeRangeEnd));
    const sumLogged = logsInActiveRange.reduce((s, l) => s + Number(l.days_equiv || 0), 0);
    const unloggedCount = Math.max(0, elapsedInMonth - logsInActiveRange.length);
    loggedDays = unloggedCount + sumLogged;
  } else {
    loggedDays = wLogs.reduce((sum, l) => sum + Number(l.days_equiv || 0), 0);
  }

  const loggedOvertime = wLogs.reduce((sum, l) => sum + Number(l.overtime_hours || 0), 0);
  const dailyBonuses = wLogs.reduce((sum, l) => sum + Number(l.bonus_amount || 0), 0);

  const presentCount = wLogs.filter((l) => l.status === 'present').length;
  const halfCount = wLogs.filter((l) => l.status === 'half').length;
  const absentCount = wLogs.filter((l) => l.status === 'absent').length;
  const leaveCount = wLogs.filter((l) => l.status === 'paid_leave').length;

  const dailyRate =
    w.wage_type === 'daily'
      ? Number(w.base_wage || 0)
      : Number(w.base_wage || 0) / 30;

  const baseEarned = Math.round(loggedDays * dailyRate);
  const overtimeEarned = Math.round(loggedOvertime * Number(w.overtime_rate || 0));
  const totalBonus = dailyBonuses;
  const totalDeductions = wPayments
    .filter((p) => p.payment_type === 'deduction')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const totalPaid = wPayments
    .filter((p) => p.payment_type === 'advance' || p.payment_type === 'salary')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const grossEarned = baseEarned + overtimeEarned + totalBonus - totalDeductions;
  const remainingBalance = grossEarned - totalPaid;

  return {
    workerId: w.id,
    loggedDays,
    loggedOvertime,
    effectiveDays: loggedDays,
    effectiveOvertime: loggedOvertime,
    isManualOverride: false,
    manualDays: null,
    manualOvertime: null,
    monthlyBonus: 0,
    monthlyNote: '',
    dailyBonuses,
    presentCount,
    halfCount,
    absentCount,
    leaveCount,
    baseEarned,
    overtimeEarned,
    totalBonus,
    totalDeductions,
    grossEarned,
    totalPaid,
    remainingBalance,
  };
}
