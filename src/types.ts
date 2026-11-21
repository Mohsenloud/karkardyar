export type WageType = 'daily' | 'monthly';

export type AttendanceStatus = 'present' | 'half' | 'absent' | 'paid_leave';

export type CalcMode = 'to_today' | 'full_range' | 'manual';

export type UserRole = 'admin' | 'supervisor';

export type PaymentType = 'advance' | 'salary' | 'deduction' | 'allowance';

export interface CurrentUserInfo {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  assignedProjectId: number | null;
}

export interface AppUser {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  assigned_project_id: number | null;
  project_name?: string | null;
  active: number;
  created_at?: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  color?: string;
  active: number;
  created_at?: string;
}

export interface Worker {
  id: number;
  project_id: number;
  project_name?: string;
  project_color?: string;
  name: string;
  role: string;
  phone: string;
  wage_type: WageType;
  base_wage: number;
  overtime_rate: number;
  start_date: string;
  end_date: string | null;
  calc_mode: CalcMode;
  manual_worked_days: number | null;
  manual_absent_days: number;
  manual_overtime_hours: number | null;
  auto_count_days: number;
  fridays_off?: number;
  carry_over_balance?: number;         // مانده انتقالی از دوره/ماه قبل (مثبت: بستانکار، منفی: بدهکار)
  fixed_allowance?: number;            // مزایای ثابت (حق غذا، ایاب‌وذهاب، حق مسئولیت)
  fixed_allowance_label?: string;
  fixed_deduction?: number;            // کسورات ثابت (بیمه، تعهدات)
  fixed_deduction_label?: string;
  active: number;
  notes: string;
  created_at?: string;
}

export interface WageHistoryRecord {
  id: number;
  worker_id: number;
  effective_date: string;
  wage_type: WageType;
  base_wage: number;
  overtime_rate: number;
  note: string;
  created_at?: string;
}

export interface LockedMonthRecord {
  id: number;
  project_id: number;
  shamsi_year: number;
  shamsi_month: number;
  locked_by: string;
  locked_at: string;
  note: string;
}

export interface AccruedToTodaySummary {
  workerId: number;
  startDate: string;
  endDate: string | null;
  todayIso: string;
  calcMode: CalcMode;
  notStartedYet: boolean;
  isPeriodFinished: boolean;
  calendarDaysElapsedToToday: number;
  remainingDaysToWork: number | null;
  totalPeriodDays: number | null;
  calendarAbsentDays: number;
  manualAbsentDays: number;
  totalAbsentDays: number;
  fridaysOffCount?: number;
  halfDaysCount: number;
  rawCalculatedDays: number;
  effectiveDaysToToday: number;
  isDaysManuallyEdited: boolean;
  loggedOvertimeHours: number;
  effectiveOvertimeHours: number;
  baseEarnedToToday: number;
  overtimeEarnedToToday: number;
  bonusToToday: number;
  fixedAllowance: number;
  extraAllowancesToToday: number;
  fixedDeduction: number;
  deductionsToToday: number;
  carryOverBalance: number;
  grossEarnedToToday: number;
  paidToToday: number;
  netPayableToToday: number;
  projectedRemainingWage: number | null;
  usedWageHistory: boolean;
  periodLogs: DailyLog[];
}

export interface DailyLog {
  id: number;
  worker_id: number;
  work_date: string;
  shamsi_year: number;
  shamsi_month: number;
  shamsi_day: number;
  status: AttendanceStatus;
  days_equiv: number;
  overtime_hours: number;
  bonus_amount: number;
  project_name: string;
  note: string;
}

export interface WorkerMonthlySummary {
  workerId: number;
  loggedDays: number;
  loggedOvertime: number;
  effectiveDays: number;
  effectiveOvertime: number;
  isManualOverride: boolean;
  manualDays: number | null;
  manualOvertime: number | null;
  monthlyBonus: number;
  monthlyNote: string;
  dailyBonuses: number;
  presentCount: number;
  halfCount: number;
  absentCount: number;
  leaveCount: number;
  baseEarned: number;
  overtimeEarned: number;
  totalBonus: number;
  totalDeductions: number;
  grossEarned: number;
  totalPaid: number;
  remainingBalance: number;
}

export interface PaymentRecord {
  id: number;
  project_id?: number;
  worker_id: number;
  worker_name?: string;
  worker_role?: string;
  payment_date: string;
  shamsi_year: number;
  shamsi_month: number;
  amount: number;
  payment_type: PaymentType;
  category?: string;
  receipt_path?: string;
  period_archived?: number;
  note: string;
  created_at?: string;
}

export interface AuditLogRecord {
  id: number;
  actor_username: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  project_id: number | null;
  summary: string;
  details_json: string;
  ip_address: string;
  created_at: string;
}

export interface AutoBackupSettings {
  enabled: boolean;
  intervalHours: number;
  keepCount: number;
  telegramEnabled: boolean;
  telegramChatId: string;
  hasTelegramToken: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
}

export interface AutoBackupFile {
  filename: string;
  sizeKb: number;
  createdAt: string;
}

export interface BootstrapResponse {
  todayIso: string;
  currentUser: CurrentUserInfo;
  projects: Project[];
  workers: Worker[];
  dailyLogs?: DailyLog[];
  allLogs: DailyLog[];
  monthLogs?: DailyLog[];
  summaries?: WorkerMonthlySummary[];
  accruedSummaries?: AccruedToTodaySummary[];
  payments?: PaymentRecord[];
  allPayments: PaymentRecord[];
  wageHistory: WageHistoryRecord[];
  lockedMonths: LockedMonthRecord[];
  dbFileSizeKb: number;
}
