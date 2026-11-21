import {
  AccruedToTodaySummary,
  DailyLog,
  PaymentRecord,
  WageHistoryRecord,
  Worker,
  WorkerMonthlySummary,
} from '../types';
import { addDaysIso, getShamsiMonthLength, isFridayIso, isoToShamsi, shamsiToIso } from './jalali';

export function diffDaysInclusive(startIso: string, endIso: string): number {
  if (!startIso || !endIso || startIso > endIso) return 0;
  const [y1, m1, d1] = startIso.split('-').map(Number);
  const [y2, m2, d2] = endIso.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24)) + 1;
}

export function countUnloggedFridaysBetween(
  startIso: string,
  endIso: string,
  loggedDatesSet: Set<string>
): number {
  if (!startIso || !endIso || startIso > endIso) return 0;
  const [y1, m1, d1] = startIso.split('-').map(Number);
  const [y2, m2, d2] = endIso.split('-').map(Number);
  const cur = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  let fridays = 0;
  let guard = 0;
  while (cur <= end && guard < 1500) {
    if (cur.getDay() === 5) {
      const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(
        cur.getDate()
      ).padStart(2, '0')}`;
      if (!loggedDatesSet.has(iso)) {
        fridays++;
      }
    }
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return fridays;
}

function getEffectiveRateForDate(
  iso: string,
  worker: Worker,
  sortedHistory: WageHistoryRecord[]
): { dailyRate: number; overtimeRate: number } {
  if (sortedHistory.length > 0) {
    let matched: WageHistoryRecord | null = null;
    for (let i = 0; i < sortedHistory.length; i++) {
      if (sortedHistory[i].effective_date <= iso) {
        matched = sortedHistory[i];
      } else {
        break;
      }
    }
    if (matched) {
      const dailyRate =
        matched.wage_type === 'daily'
          ? Number(matched.base_wage || 0)
          : Number(matched.base_wage || 0) / 30;
      return {
        dailyRate,
        overtimeRate: Number(matched.overtime_rate || 0),
      };
    }
  }

  const dailyRate =
    worker.wage_type === 'daily'
      ? Number(worker.base_wage || 0)
      : Number(worker.base_wage || 0) / 30;
  return {
    dailyRate,
    overtimeRate: Number(worker.overtime_rate || 0),
  };
}

export function computeWorkerAccruedSummary(
  w: Worker,
  allLogs: DailyLog[],
  allPayments: PaymentRecord[],
  todayIso: string,
  allWageHistory: WageHistoryRecord[] = []
): AccruedToTodaySummary {
  const todayShamsi = isoToShamsi(todayIso);
  const startDate: string = w.start_date || shamsiToIso(todayShamsi.jy, todayShamsi.jm, 1);
  const endDate: string | null = w.end_date || null;
  const calcMode = w.calc_mode || 'to_today';
  const autoCount = w.auto_count_days !== 0;
  const isFridaysOffEnabled = w.wage_type === 'daily' && Boolean(w.fridays_off);

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
  const logByDate = new Map<string, DailyLog>();
  for (const l of logsInCalcWindow) {
    logByDate.set(l.work_date, l);
  }
  const loggedDatesSet = new Set(logByDate.keys());

  const unloggedFridays =
    !notStartedYet && isFridaysOffEnabled
      ? countUnloggedFridaysBetween(startDate, targetEndIso, loggedDatesSet)
      : 0;
  const explicitAbsentFridays =
    !notStartedYet && isFridaysOffEnabled
      ? logsInCalcWindow.filter((l) => isFridayIso(l.work_date) && l.status === 'absent').length
      : 0;
  const fridaysOffCount = unloggedFridays + explicitAbsentFridays;

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
      const unloggedDays = Math.max(0, activeWindowDays - loggedDatesCount - unloggedFridays);
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
  const isOvertimeManuallyEdited =
    w.manual_overtime_hours !== null && w.manual_overtime_hours !== undefined;
  const effectiveOvertimeHours = isOvertimeManuallyEdited
    ? Math.max(0, Number(w.manual_overtime_hours))
    : loggedOvertimeHours;

  const bonusToToday = logsInCalcWindow.reduce(
    (s, l) => s + Number(l.bonus_amount || 0),
    0
  );

  const workerHistory = allWageHistory
    .filter((h) => h.worker_id === w.id)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));

  const currentDailyRate =
    w.wage_type === 'daily'
      ? Number(w.base_wage || 0)
      : Number(w.base_wage || 0) / 30;

  let baseEarnedToToday = 0;
  let overtimeEarnedToToday = 0;
  let usedWageHistory = false;

  if (workerHistory.length > 0 && !notStartedYet && !isDaysManuallyEdited) {
    usedWageHistory = true;
    const [y1, m1, d1] = startDate.split('-').map(Number);
    const [y2, m2, d2] = targetEndIso.split('-').map(Number);
    const cur = new Date(y1, m1 - 1, d1);
    const end = new Date(y2, m2 - 1, d2);
    let guard = 0;
    let baseSum = 0;
    let otSum = 0;

    while (cur <= end && guard < 1500) {
      const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(
        cur.getDate()
      ).padStart(2, '0')}`;
      const log = logByDate.get(iso);
      const { dailyRate, overtimeRate } = getEffectiveRateForDate(iso, w, workerHistory);

      let dayEquiv = 0;
      if (log) {
        dayEquiv = Number(log.days_equiv || 0);
        if (!isOvertimeManuallyEdited) {
          otSum += Number(log.overtime_hours || 0) * overtimeRate;
        }
      } else if (autoCount) {
        const skipFriday = isFridaysOffEnabled && cur.getDay() === 5;
        if (!skipFriday) {
          dayEquiv = 1;
        }
      }

      baseSum += dayEquiv * dailyRate;
      cur.setDate(cur.getDate() + 1);
      guard++;
    }

    if (manualAbsentDays > 0) {
      baseSum = Math.max(0, baseSum - manualAbsentDays * currentDailyRate);
    }

    baseEarnedToToday = Math.round(baseSum);
    overtimeEarnedToToday = isOvertimeManuallyEdited
      ? Math.round(effectiveOvertimeHours * Number(w.overtime_rate || 0))
      : Math.round(otSum);
  } else {
    baseEarnedToToday = Math.round(effectiveDaysToToday * currentDailyRate);
    overtimeEarnedToToday = Math.round(
      effectiveOvertimeHours * Number(w.overtime_rate || 0)
    );
  }

  const workerPaymentsToToday = allPayments.filter(
    (p) => p.worker_id === w.id && !p.period_archived
  );

  const deductionsToToday = workerPaymentsToToday
    .filter((p) => p.payment_type === 'deduction')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const extraAllowancesToToday = workerPaymentsToToday
    .filter((p) => p.payment_type === 'allowance')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const paidToToday = workerPaymentsToToday
    .filter((p) => p.payment_type === 'advance' || p.payment_type === 'salary')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const fixedAllowance = Number(w.fixed_allowance || 0);
  const fixedDeduction = Number(w.fixed_deduction || 0);
  const carryOverBalance = Number(w.carry_over_balance || 0);

  const grossEarnedToToday =
    baseEarnedToToday +
    overtimeEarnedToToday +
    bonusToToday +
    fixedAllowance +
    extraAllowancesToToday -
    deductionsToToday -
    fixedDeduction;

  const netPayableToToday = grossEarnedToToday + carryOverBalance - paidToToday;

  const projectedRemainingWage =
    remainingDaysToWork !== null ? Math.round(remainingDaysToWork * currentDailyRate) : null;

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
    fridaysOffCount,
    halfDaysCount,
    rawCalculatedDays,
    effectiveDaysToToday,
    isDaysManuallyEdited,
    loggedOvertimeHours,
    effectiveOvertimeHours,
    baseEarnedToToday,
    overtimeEarnedToToday,
    bonusToToday,
    fixedAllowance,
    extraAllowancesToToday,
    fixedDeduction,
    deductionsToToday,
    carryOverBalance,
    grossEarnedToToday,
    paidToToday,
    netPayableToToday,
    projectedRemainingWage,
    usedWageHistory,
    periodLogs,
  };
}

export function computeWorkerMonthlySummary(
  w: Worker,
  allLogs: DailyLog[],
  allPayments: PaymentRecord[],
  shamsiYear: number,
  shamsiMonth: number,
  todayIso: string,
  allWageHistory: WageHistoryRecord[] = []
): WorkerMonthlySummary {
  const monthFirstIso = shamsiToIso(shamsiYear, shamsiMonth, 1);
  const monthLen = getShamsiMonthLength(shamsiYear, shamsiMonth);
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
  const isFridaysOffEnabled = w.wage_type === 'daily' && Boolean(w.fridays_off);

  let loggedDays = 0;
  if (w.auto_count_days !== 0 && activeRangeStart <= activeRangeEnd) {
    const elapsedInMonth = Math.max(0, diffDaysInclusive(activeRangeStart, activeRangeEnd));
    const loggedDatesSet = new Set(logsInActiveRange.map((l) => l.work_date));
    const unloggedFridays = isFridaysOffEnabled
      ? countUnloggedFridaysBetween(activeRangeStart, activeRangeEnd, loggedDatesSet)
      : 0;
    const sumLogged = logsInActiveRange.reduce((s, l) => s + Number(l.days_equiv || 0), 0);
    const unloggedCount = Math.max(0, elapsedInMonth - logsInActiveRange.length - unloggedFridays);
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

  const workerHistory = allWageHistory
    .filter((h) => h.worker_id === w.id)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  const refRate = getEffectiveRateForDate(activeRangeEnd || monthLastIso, w, workerHistory);

  const baseEarned = Math.round(loggedDays * refRate.dailyRate);
  const overtimeEarned = Math.round(loggedOvertime * refRate.overtimeRate);
  const allowances = wPayments
    .filter((p) => p.payment_type === 'allowance')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalBonus = dailyBonuses + allowances;
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
