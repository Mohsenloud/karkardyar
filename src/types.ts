export type WageType = 'daily' | 'monthly';

export type AttendanceStatus = 'present' | 'half' | 'absent' | 'paid_leave';

export type CalcMode = 'to_today' | 'full_range' | 'manual';

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
  project_id: number;                 // شناسه پروژه مربوطه
  project_name?: string;              // نام پروژه
  project_color?: string;             // رنگ پروژه
  name: string;
  role: string;
  phone: string;
  wage_type: WageType;
  base_wage: number;
  overtime_rate: number;
  start_date: string;                 // ISO date - تاریخ ورود (مثلاً ۵ مهر)
  end_date: string | null;            // ISO date - تاریخ خروج (مثلاً ۲۳ آبان)
  calc_mode: CalcMode;                // 'to_today' | 'full_range' | 'manual'
  manual_worked_days: number | null;  // عدد دستی روزهای کارکرد (در صورت ویرایش مستقیم)
  manual_absent_days: number;         // تعداد روز غیبت/کسری دستی
  manual_overtime_hours: number | null; // ساعت اضافه‌کاری دستی
  auto_count_days: number;
  fridays_off?: number;               // ۱ = تعطیلی خودکار جمعه‌ها (ویژه روزمزد)، ۰ = عادی
  active: number;
  notes: string;
  created_at?: string;
}

export interface AccruedToTodaySummary {
  workerId: number;
  startDate: string;
  endDate: string | null;
  todayIso: string;
  calcMode: CalcMode;
  notStartedYet: boolean;
  isPeriodFinished: boolean;
  calendarDaysElapsedToToday: number; // روزهای تقویمی از ورود تا امروز
  remainingDaysToWork: number | null; // روزهای مانده از فردا تا تاریخ خروج
  totalPeriodDays: number | null;     // کل روزهای بین تاریخ ورود تا تاریخ خروج
  calendarAbsentDays: number;         // غیبت‌های ثبت‌شده در تقویم
  manualAbsentDays: number;           // غیبت‌های کسرشده دستی
  totalAbsentDays: number;            // مجموع غیبت‌ها
  fridaysOffCount?: number;           // تعداد جمعه‌های تعطیل کسرشده
  halfDaysCount: number;
  rawCalculatedDays: number;          // روز کارکرد طبق تقویم (قبل از عدد دستی)
  effectiveDaysToToday: number;       // روز کارکرد نهایی (محاسبه‌شده یا ویرایش‌شده توسط کاربر)
  isDaysManuallyEdited: boolean;
  loggedOvertimeHours: number;
  effectiveOvertimeHours: number;
  baseEarnedToToday: number;
  overtimeEarnedToToday: number;
  bonusToToday: number;
  deductionsToToday: number;
  grossEarnedToToday: number;
  paidToToday: number;
  netPayableToToday: number;
  projectedRemainingWage: number | null;
  periodLogs: DailyLog[];             // کلیه رکوردهای روزانه در بازه ورود تا خروج
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
  payment_type: 'advance' | 'salary' | 'deduction';
  note: string;
  created_at?: string;
}

export interface BootstrapResponse {
  todayIso: string;
  projects: Project[];
  workers: Worker[];
  dailyLogs: DailyLog[];
  allLogs: DailyLog[];
  monthLogs: DailyLog[];
  summaries: WorkerMonthlySummary[];
  accruedSummaries: AccruedToTodaySummary[];
  payments: PaymentRecord[];
  allPayments: PaymentRecord[];
  dbFileSizeKb: number;
}
