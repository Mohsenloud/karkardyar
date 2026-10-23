import express from 'express';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { createServer as createViteServer } from 'vite';
import { isoToShamsi, getTodayIso, shamsiToIso } from './src/utils/jalali.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, 'karkard.sqlite');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT 'emerald',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'کارگر',
    phone TEXT DEFAULT '',
    wage_type TEXT NOT NULL DEFAULT 'daily', -- 'daily' | 'monthly'
    base_wage INTEGER NOT NULL DEFAULT 0,
    overtime_rate INTEGER NOT NULL DEFAULT 0,
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT NULL,
    calc_mode TEXT NOT NULL DEFAULT 'to_today', -- 'to_today' | 'full_range' | 'manual'
    manual_worked_days REAL DEFAULT NULL,
    manual_absent_days REAL NOT NULL DEFAULT 0,
    manual_overtime_hours REAL DEFAULT NULL,
    auto_count_days INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    shamsi_year INTEGER NOT NULL,
    shamsi_month INTEGER NOT NULL,
    shamsi_day INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'present', -- 'present' | 'half' | 'absent' | 'paid_leave'
    days_equiv REAL NOT NULL DEFAULT 1,
    overtime_hours REAL NOT NULL DEFAULT 0,
    bonus_amount INTEGER NOT NULL DEFAULT 0,
    project_name TEXT DEFAULT '',
    note TEXT DEFAULT '',
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    UNIQUE(worker_id, work_date)
  );

  CREATE TABLE IF NOT EXISTS monthly_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL,
    shamsi_year INTEGER NOT NULL,
    shamsi_month INTEGER NOT NULL,
    manual_days REAL DEFAULT NULL,
    manual_overtime REAL DEFAULT NULL,
    monthly_bonus INTEGER NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    UNIQUE(worker_id, shamsi_year, shamsi_month)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL DEFAULT 1,
    worker_id INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    shamsi_year INTEGER NOT NULL,
    shamsi_month INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    payment_type TEXT NOT NULL DEFAULT 'advance',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
  );
`);

function migrateColumns() {
  const cols = db.prepare('PRAGMA table_info(workers)').all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  const todayIso = getTodayIso();
  const todayShamsi = isoToShamsi(todayIso);
  const mehr5Iso = shamsiToIso(todayShamsi.jy, 7, 5);   // ۵ مهر
  const aban23Iso = shamsiToIso(todayShamsi.jy, 8, 23); // ۲۳ آبان

  if (!colNames.has('start_date')) {
    db.exec(`ALTER TABLE workers ADD COLUMN start_date TEXT DEFAULT '${mehr5Iso}';`);
  }
  if (!colNames.has('end_date')) {
    db.exec(`ALTER TABLE workers ADD COLUMN end_date TEXT DEFAULT '${aban23Iso}';`);
  }
  if (!colNames.has('auto_count_days')) {
    db.exec(`ALTER TABLE workers ADD COLUMN auto_count_days INTEGER NOT NULL DEFAULT 1;`);
  }
  if (!colNames.has('calc_mode')) {
    db.exec(`ALTER TABLE workers ADD COLUMN calc_mode TEXT NOT NULL DEFAULT 'to_today';`);
  }
  if (!colNames.has('manual_worked_days')) {
    db.exec(`ALTER TABLE workers ADD COLUMN manual_worked_days REAL DEFAULT NULL;`);
  }
  if (!colNames.has('manual_absent_days')) {
    db.exec(`ALTER TABLE workers ADD COLUMN manual_absent_days REAL NOT NULL DEFAULT 0;`);
  }
  if (!colNames.has('manual_overtime_hours')) {
    db.exec(`ALTER TABLE workers ADD COLUMN manual_overtime_hours REAL DEFAULT NULL;`);
  }

  // Ensure projects table has color column
  const projCols = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>;
  const projColNames = new Set(projCols.map((c) => c.name));
  if (!projColNames.has('color')) {
    db.exec(`ALTER TABLE projects ADD COLUMN color TEXT DEFAULT 'emerald';`);
    db.exec(`UPDATE projects SET color = 'indigo' WHERE id = 2;`);
    db.exec(`UPDATE projects SET color = 'violet' WHERE id = 3;`);
    db.exec(`UPDATE projects SET color = 'amber' WHERE id = 4;`);
  }

  // Ensure default projects exist
  const projCount = (db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number }).cnt;
  if (projCount === 0) {
    db.prepare('INSERT INTO projects (name, description, color, active) VALUES (?, ?, ?, 1)').run(
      'پروژه الف',
      'پروژه اول (اصلی)',
      'emerald'
    );
    db.prepare('INSERT INTO projects (name, description, color, active) VALUES (?, ?, ?, 1)').run(
      'پروژه ب',
      'پروژه دوم',
      'indigo'
    );
  }

  if (!colNames.has('project_id')) {
    db.exec(`ALTER TABLE workers ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;`);
    // Put the 4th sample worker into Project 2 (پروژه ب) so both projects have sample data
    const allW = db.prepare('SELECT id FROM workers ORDER BY id ASC').all() as Array<{ id: number }>;
    if (allW.length >= 4) {
      db.prepare('UPDATE workers SET project_id = 2 WHERE id = ?').run(allW[3].id);
    }
  }

  const paymentCols = db.prepare('PRAGMA table_info(payments)').all() as Array<{ name: string }>;
  const paymentColNames = new Set(paymentCols.map((c) => c.name));
  if (!paymentColNames.has('project_id')) {
    db.exec(`
      ALTER TABLE payments ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;
      UPDATE payments SET project_id = COALESCE((SELECT project_id FROM workers WHERE workers.id = payments.worker_id), 1);
    `);
  }

  // Update first sample worker to showcase 5 Mehr to 23 Aban if not customized yet
  const firstWorker = db.prepare('SELECT id, start_date FROM workers ORDER BY id ASC LIMIT 1').get() as any;
  if (firstWorker && (!firstWorker.start_date || firstWorker.start_date === shamsiToIso(todayShamsi.jy, 7, 4))) {
    db.prepare('UPDATE workers SET start_date = ?, end_date = ? WHERE id = ?').run(
      mehr5Iso,
      aban23Iso,
      firstWorker.id
    );
  }

  // Normalize any 0.5 half-day logs to 1 full day as requested
  db.exec(`
    UPDATE daily_logs SET status = 'present', days_equiv = 1 WHERE status = 'half' OR days_equiv = 0.5;
    UPDATE workers SET manual_worked_days = ROUND(manual_worked_days) WHERE manual_worked_days IS NOT NULL;
  `);
}

migrateColumns();

function diffDaysInclusive(startIso: string, endIso: string): number {
  if (!startIso || !endIso || startIso > endIso) return 0;
  const [y1, m1, d1] = startIso.split('-').map(Number);
  const [y2, m2, d2] = endIso.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const diff = Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

function addDaysToIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function seedIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM workers').get() as { cnt: number };
  if (countRow.cnt > 0) return;

  const todayIso = getTodayIso();
  const todayShamsi = isoToShamsi(todayIso);
  const mehr5Iso = shamsiToIso(todayShamsi.jy, 7, 5);   // ۵ مهر
  const aban23Iso = shamsiToIso(todayShamsi.jy, 8, 23); // ۲۳ آبان
  const mehr4Iso = shamsiToIso(todayShamsi.jy, 7, 4);   // ۴ مهر

  const insertWorker = db.prepare(`
    INSERT INTO workers (project_id, name, role, phone, wage_type, base_wage, overtime_rate, start_date, end_date, calc_mode, auto_count_days, active, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'to_today', 1, 1, ?)
  `);

  const w1 = insertWorker.run(
    1,
    'حسین رضایی',
    'استادکار بنا',
    '09123456781',
    'daily',
    1400000,
    180000,
    mehr5Iso,
    aban23Iso,
    'ورود ۵ مهر تا ۲۳ آبان'
  ).lastInsertRowid as number;

  const w2 = insertWorker.run(
    1,
    'مهدی کریمی',
    'جوشکار و آهنگر',
    '09128765432',
    'daily',
    1250000,
    160000,
    mehr4Iso,
    addDaysToIso(todayIso, 8),
    'جوشکاری سازه و نبشی‌کشی'
  ).lastInsertRowid as number;

  const w3 = insertWorker.run(
    1,
    'علی محمدی',
    'کارگر ساده',
    '09351122334',
    'daily',
    850000,
    110000,
    mehr5Iso,
    aban23Iso,
    'ملات‌سازی و حمل مصالح'
  ).lastInsertRowid as number;

  const w4 = insertWorker.run(
    2,
    'رضا احمدی',
    'سرپرست کارگاه',
    '09129988776',
    'monthly',
    30000000,
    150000,
    mehr4Iso,
    aban23Iso,
    'حقوق ماهانه - شروع از ۴ مهر'
  ).lastInsertRowid as number;

  const insertPayment = db.prepare(`
    INSERT INTO payments (project_id, worker_id, payment_date, shamsi_year, shamsi_month, amount, payment_type, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPayment.run(1, w1, todayIso, todayShamsi.jy, todayShamsi.jm, 4000000, 'advance', 'مساعده علی‌الحساب');
  insertPayment.run(2, w4, todayIso, todayShamsi.jy, todayShamsi.jm, 5000000, 'advance', 'مساعده سرپرست');
}

seedIfEmpty();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/bootstrap', (req, res) => {
    try {
      const todayIso = getTodayIso();
      const todayShamsi = isoToShamsi(todayIso);

      const workDate = (req.query.workDate as string) || todayIso;
      const shamsiYear = Number(req.query.shamsiYear) || todayShamsi.jy;
      const shamsiMonth = Number(req.query.shamsiMonth) || todayShamsi.jm;

      const projects = db.prepare('SELECT * FROM projects ORDER BY active DESC, id ASC').all() as Array<any>;

      const workers = db.prepare(`
        SELECT w.*, COALESCE(pr.name, 'پروژه الف') as project_name, COALESCE(pr.color, 'emerald') as project_color
        FROM workers w
        LEFT JOIN projects pr ON pr.id = w.project_id
        ORDER BY w.active DESC, w.id ASC
      `).all() as Array<any>;

      const dailyLogs = db
        .prepare('SELECT * FROM daily_logs WHERE work_date = ?')
        .all(workDate) as Array<any>;

      const allLogs = db
        .prepare('SELECT * FROM daily_logs ORDER BY work_date ASC')
        .all() as Array<any>;

      const monthLogs = db
        .prepare('SELECT * FROM daily_logs WHERE shamsi_year = ? AND shamsi_month = ? ORDER BY work_date DESC')
        .all(shamsiYear, shamsiMonth) as Array<any>;

      const monthlyRecords = db
        .prepare('SELECT * FROM monthly_records WHERE shamsi_year = ? AND shamsi_month = ?')
        .all(shamsiYear, shamsiMonth) as Array<any>;

      const allPayments = db
        .prepare(`
          SELECT p.*, w.name as worker_name, w.role as worker_role
          FROM payments p
          JOIN workers w ON w.id = p.worker_id
          ORDER BY p.payment_date DESC, p.id DESC
        `)
        .all() as Array<any>;

      const payments = allPayments.filter(
        (p) => p.shamsi_year === shamsiYear && p.shamsi_month === shamsiMonth
      );

      // 1. Calculate Period / Accrued Summary for each worker
      const accruedSummaries = workers.map((w) => {
        const startDate: string = w.start_date || shamsiToIso(todayShamsi.jy, todayShamsi.jm, 1);
        const endDate: string | null = w.end_date || null;
        const calcMode: 'to_today' | 'full_range' | 'manual' = w.calc_mode || 'to_today';
        const autoCount = w.auto_count_days !== 0;

        // If calc_mode === 'full_range' and endDate is set, calculate up to endDate; otherwise calculate up to min(todayIso, endDate)
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
            const firstFutureDay = startDate > todayIso ? startDate : addDaysToIso(todayIso, 1);
            remainingDaysToWork = Math.max(0, diffDaysInclusive(firstFutureDay, endDate));
          }
        }

        // All logs in the worker's overall [startDate, endDate || todayIso]
        const periodLogs = allLogs.filter(
          (l) =>
            l.worker_id === w.id &&
            l.work_date >= startDate &&
            (!endDate || l.work_date <= endDate)
        );

        // Logs inside the active calculation window [startDate, targetEndIso]
        const logsInCalcWindow = allLogs.filter(
          (l) =>
            l.worker_id === w.id &&
            l.work_date >= startDate &&
            l.work_date <= targetEndIso
        );

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
          (p) => p.worker_id === w.id && p.payment_date >= startDate
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
      });

      // 2. Calculate monthly summary for selected Shamsi month
      const monthFirstIso = shamsiToIso(shamsiYear, shamsiMonth, 1);
      const summaries = workers.map((w) => {
        const wLogs = monthLogs.filter((l) => l.worker_id === w.id && l.work_date <= todayIso);
        const mRec = monthlyRecords.find((r) => r.worker_id === w.id);
        const wPayments = payments.filter((p) => p.worker_id === w.id);

        const startDate = w.start_date || monthFirstIso;
        const endDate = w.end_date || null;

        const monthLen = shamsiMonth <= 6 ? 31 : shamsiMonth <= 11 ? 30 : 29;
        const monthLastIso = shamsiToIso(shamsiYear, shamsiMonth, monthLen);

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

        const effectiveDays =
          mRec && mRec.manual_days !== null && mRec.manual_days !== undefined
            ? Number(mRec.manual_days)
            : loggedDays;

        const effectiveOvertime =
          mRec && mRec.manual_overtime !== null && mRec.manual_overtime !== undefined
            ? Number(mRec.manual_overtime)
            : loggedOvertime;

        const monthlyBonus = mRec ? Number(mRec.monthly_bonus || 0) : 0;

        const dailyRate =
          w.wage_type === 'daily'
            ? Number(w.base_wage || 0)
            : Number(w.base_wage || 0) / 30;

        const baseEarned = Math.round(effectiveDays * dailyRate);
        const overtimeEarned = Math.round(effectiveOvertime * Number(w.overtime_rate || 0));
        const totalBonus = dailyBonuses + monthlyBonus;
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
          effectiveDays,
          effectiveOvertime,
          isManualOverride: Boolean(
            mRec &&
              ((mRec.manual_days !== null && mRec.manual_days !== undefined) ||
                (mRec.manual_overtime !== null && mRec.manual_overtime !== undefined) ||
                Number(mRec.monthly_bonus || 0) !== 0)
          ),
          manualDays: mRec ? mRec.manual_days : null,
          manualOvertime: mRec ? mRec.manual_overtime : null,
          monthlyBonus,
          monthlyNote: mRec ? mRec.note : '',
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
      });

      res.json({
        todayIso,
        projects,
        workers,
        dailyLogs,
        allLogs,
        monthLogs,
        summaries,
        accruedSummaries,
        payments,
        allPayments,
        dbFileSizeKb: Math.round((fs.statSync(DB_PATH).size / 1024) * 10) / 10,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'خطا در خواندن اطلاعات از دیتابیس SQLite' });
    }
  });

  // Create project
  app.post('/api/projects', (req, res) => {
    try {
      const { name, description, color } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'نام پروژه الزامی است' });
      }
      const info = db
        .prepare('INSERT INTO projects (name, description, color, active) VALUES (?, ?, ?, 1)')
        .run(
          String(name).trim(),
          String(description || '').trim(),
          String(color || 'emerald').trim()
        );
      res.json({ id: Number(info.lastInsertRowid) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update project
  app.put('/api/projects/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
      if (!existing) return res.status(404).json({ error: 'پروژه یافت نشد' });
      const {
        name = existing.name,
        description = existing.description,
        color = existing.color || 'emerald',
        active = existing.active,
      } = req.body;
      db.prepare('UPDATE projects SET name = ?, description = ?, color = ?, active = ? WHERE id = ?').run(
        String(name).trim(),
        String(description || '').trim(),
        String(color || 'emerald').trim(),
        active === undefined ? 1 : Number(Boolean(active)),
        id
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete project
  app.delete('/api/projects/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number };
      if (countRow.cnt <= 1) {
        return res.status(400).json({ error: 'حداقل یک پروژه باید در برنامه باقی بماند' });
      }
      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare('DELETE FROM payments WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM workers WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        db.exec('COMMIT;');
      } catch (inner) {
        db.exec('ROLLBACK;');
        throw inner;
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create worker
  app.post('/api/workers', (req, res) => {
    try {
      const {
        project_id,
        name,
        role,
        phone,
        wage_type,
        base_wage,
        overtime_rate,
        start_date,
        end_date,
        calc_mode,
        manual_worked_days,
        manual_absent_days,
        manual_overtime_hours,
        auto_count_days,
        notes,
      } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'نام کارگر الزامی است' });
      }
      const stmt = db.prepare(`
        INSERT INTO workers (
          project_id, name, role, phone, wage_type, base_wage, overtime_rate,
          start_date, end_date, calc_mode, manual_worked_days, manual_absent_days, manual_overtime_hours,
          auto_count_days, active, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      const info = stmt.run(
        Number(project_id) || 1,
        String(name).trim(),
        String(role || 'کارگر').trim(),
        String(phone || '').trim(),
        wage_type === 'monthly' ? 'monthly' : 'daily',
        Number(base_wage) || 0,
        Number(overtime_rate) || 0,
        start_date || getTodayIso(),
        end_date ? String(end_date) : null,
        calc_mode || 'to_today',
        manual_worked_days === null || manual_worked_days === undefined || manual_worked_days === ''
          ? null
          : Number(manual_worked_days),
        Number(manual_absent_days) || 0,
        manual_overtime_hours === null || manual_overtime_hours === undefined || manual_overtime_hours === ''
          ? null
          : Number(manual_overtime_hours),
        auto_count_days === undefined ? 1 : Number(Boolean(auto_count_days)),
        String(notes || '').trim()
      );
      res.json({ id: info.lastInsertRowid });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update worker (including entry/exit dates & manual worked days)
  app.put('/api/workers/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as any;
      if (!existing) return res.status(404).json({ error: 'کارگر یافت نشد' });

      const {
        project_id = existing.project_id,
        name = existing.name,
        role = existing.role,
        phone = existing.phone,
        wage_type = existing.wage_type,
        base_wage = existing.base_wage,
        overtime_rate = existing.overtime_rate,
        start_date = existing.start_date,
        end_date = existing.end_date,
        calc_mode = existing.calc_mode,
        manual_worked_days = existing.manual_worked_days,
        manual_absent_days = existing.manual_absent_days,
        manual_overtime_hours = existing.manual_overtime_hours,
        auto_count_days = existing.auto_count_days,
        active = existing.active,
        notes = existing.notes,
      } = req.body;

      const resolvedProjectId = Number(project_id) || existing.project_id || 1;

      db.prepare(`
        UPDATE workers
        SET project_id = ?, name = ?, role = ?, phone = ?, wage_type = ?, base_wage = ?, overtime_rate = ?,
            start_date = ?, end_date = ?, calc_mode = ?,
            manual_worked_days = ?, manual_absent_days = ?, manual_overtime_hours = ?,
            auto_count_days = ?, active = ?, notes = ?
        WHERE id = ?
      `).run(
        resolvedProjectId,
        String(name).trim(),
        String(role || 'کارگر').trim(),
        String(phone || '').trim(),
        wage_type === 'monthly' ? 'monthly' : 'daily',
        Number(base_wage) || 0,
        Number(overtime_rate) || 0,
        start_date || getTodayIso(),
        end_date ? String(end_date) : null,
        calc_mode || 'to_today',
        manual_worked_days === null || manual_worked_days === undefined || manual_worked_days === ''
          ? null
          : Number(manual_worked_days),
        Number(manual_absent_days) || 0,
        manual_overtime_hours === null || manual_overtime_hours === undefined || manual_overtime_hours === ''
          ? null
          : Number(manual_overtime_hours),
        auto_count_days === undefined ? 1 : Number(Boolean(auto_count_days)),
        active === undefined ? 1 : Number(Boolean(active)),
        String(notes || '').trim(),
        id
      );

      db.prepare('UPDATE payments SET project_id = ? WHERE worker_id = ?').run(resolvedProjectId, id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete worker
  app.delete('/api/workers/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      db.prepare('DELETE FROM workers WHERE id = ?').run(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upsert daily log
  app.post('/api/daily-log', (req, res) => {
    try {
      const {
        worker_id,
        work_date,
        status,
        days_equiv,
        overtime_hours,
        bonus_amount,
        project_name,
        note,
      } = req.body;

      if (!worker_id || !work_date) {
        return res.status(400).json({ error: 'کارگر و تاریخ مشخص نشده است' });
      }

      if (status === 'clear') {
        db.prepare('DELETE FROM daily_logs WHERE worker_id = ? AND work_date = ?').run(
          Number(worker_id),
          String(work_date)
        );
        return res.json({ ok: true, cleared: true });
      }

      const sh = isoToShamsi(String(work_date));
      let computedDays = Number(days_equiv);
      if (isNaN(computedDays)) {
        if (status === 'present' || status === 'paid_leave') computedDays = 1;
        else if (status === 'half') computedDays = 0.5;
        else computedDays = 0;
      }

      db.prepare(`
        INSERT INTO daily_logs
          (worker_id, work_date, shamsi_year, shamsi_month, shamsi_day, status, days_equiv, overtime_hours, bonus_amount, project_name, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(worker_id, work_date) DO UPDATE SET
          status = excluded.status,
          days_equiv = excluded.days_equiv,
          overtime_hours = excluded.overtime_hours,
          bonus_amount = excluded.bonus_amount,
          project_name = excluded.project_name,
          note = excluded.note
      `).run(
        Number(worker_id),
        String(work_date),
        sh.jy,
        sh.jm,
        sh.jd,
        String(status || 'present'),
        computedDays,
        Number(overtime_hours) || 0,
        Number(bonus_amount) || 0,
        String(project_name || '').trim(),
        String(note || '').trim()
      );

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk daily log
  app.post('/api/daily-log/bulk', (req, res) => {
    try {
      const { work_date, status = 'present', project_name = '', project_id } = req.body;
      if (!work_date) return res.status(400).json({ error: 'تاریخ الزامی است' });

      const sh = isoToShamsi(String(work_date));
      const activeWorkers = project_id
        ? (db.prepare('SELECT id FROM workers WHERE active = 1 AND project_id = ?').all(Number(project_id)) as Array<{ id: number }>)
        : (db.prepare('SELECT id FROM workers WHERE active = 1').all() as Array<{ id: number }>);
      const daysEquiv = status === 'present' ? 1 : status === 'half' ? 0.5 : 0;

      const upsert = db.prepare(`
        INSERT INTO daily_logs
          (worker_id, work_date, shamsi_year, shamsi_month, shamsi_day, status, days_equiv, overtime_hours, bonus_amount, project_name, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, '')
        ON CONFLICT(worker_id, work_date) DO UPDATE SET
          status = excluded.status,
          days_equiv = excluded.days_equiv,
          project_name = CASE WHEN daily_logs.project_name = '' THEN excluded.project_name ELSE daily_logs.project_name END
      `);

      for (const w of activeWorkers) {
        upsert.run(w.id, String(work_date), sh.jy, sh.jm, sh.jd, status, daysEquiv, String(project_name).trim());
      }

      res.json({ ok: true, count: activeWorkers.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upsert monthly batch record
  app.post('/api/monthly-records', (req, res) => {
    try {
      const { worker_id, shamsi_year, shamsi_month, manual_days, manual_overtime, monthly_bonus, note } = req.body;
      if (!worker_id || !shamsi_year || !shamsi_month) {
        return res.status(400).json({ error: 'اطلاعات کارگر و ماه الزامی است' });
      }

      const parsedDays =
        manual_days === '' || manual_days === null || manual_days === undefined
          ? null
          : Number(manual_days);
      const parsedOvertime =
        manual_overtime === '' || manual_overtime === null || manual_overtime === undefined
          ? null
          : Number(manual_overtime);

      db.prepare(`
        INSERT INTO monthly_records
          (worker_id, shamsi_year, shamsi_month, manual_days, manual_overtime, monthly_bonus, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(worker_id, shamsi_year, shamsi_month) DO UPDATE SET
          manual_days = excluded.manual_days,
          manual_overtime = excluded.manual_overtime,
          monthly_bonus = excluded.monthly_bonus,
          note = excluded.note
      `).run(
        Number(worker_id),
        Number(shamsi_year),
        Number(shamsi_month),
        parsedDays,
        parsedOvertime,
        Number(monthly_bonus) || 0,
        String(note || '').trim()
      );

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add payment
  app.post('/api/payments', (req, res) => {
    try {
      const { project_id, worker_id, payment_date, shamsi_year, shamsi_month, amount, payment_type, note } = req.body;
      if (!worker_id || !amount) {
        return res.status(400).json({ error: 'انتخاب کارگر و مبلغ الزامی است' });
      }
      const iso = payment_date || getTodayIso();
      const sh = isoToShamsi(iso);
      const jy = Number(shamsi_year) || sh.jy;
      const jm = Number(shamsi_month) || sh.jm;

      const workerRow = db.prepare('SELECT project_id FROM workers WHERE id = ?').get(Number(worker_id)) as any;
      const resolvedProjectId = Number(project_id) || workerRow?.project_id || 1;

      db.prepare(`
        INSERT INTO payments (project_id, worker_id, payment_date, shamsi_year, shamsi_month, amount, payment_type, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resolvedProjectId,
        Number(worker_id),
        iso,
        jy,
        jm,
        Number(amount) || 0,
        payment_type || 'advance',
        String(note || '').trim()
      );

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete payment
  app.delete('/api/payments/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM payments WHERE id = ?').run(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download raw SQLite file backup
  app.get('/api/backup/sqlite', (_req, res) => {
    try {
      db.exec('PRAGMA wal_checkpoint(FULL);');
      res.download(DB_PATH, `karkard-backup-${getTodayIso()}.sqlite`);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export JSON backup
  app.get('/api/backup/json', (_req, res) => {
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        projects: db.prepare('SELECT * FROM projects').all(),
        workers: db.prepare('SELECT * FROM workers').all(),
        daily_logs: db.prepare('SELECT * FROM daily_logs').all(),
        monthly_records: db.prepare('SELECT * FROM monthly_records').all(),
        payments: db.prepare('SELECT * FROM payments').all(),
      };
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="karkard-backup-${getTodayIso()}.json"`);
      res.send(JSON.stringify(data, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restore JSON backup
  app.post('/api/restore/json', (req, res) => {
    try {
      const { projects, workers, daily_logs, monthly_records, payments } = req.body;
      if (!Array.isArray(workers)) {
        return res.status(400).json({ error: 'فایل پشتیبان معتبر نیست' });
      }
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec('DELETE FROM payments; DELETE FROM monthly_records; DELETE FROM daily_logs; DELETE FROM workers;');
        if (Array.isArray(projects) && projects.length > 0) {
          db.exec('DELETE FROM projects;');
          const insPr = db.prepare(
            'INSERT INTO projects (id, name, description, active, created_at) VALUES (?, ?, ?, ?, ?)'
          );
          for (const pr of projects) {
            insPr.run(pr.id, pr.name, pr.description ?? '', pr.active ?? 1, pr.created_at ?? '');
          }
        }
        const insW = db.prepare(
          `INSERT INTO workers (
            id, project_id, name, role, phone, wage_type, base_wage, overtime_rate,
            start_date, end_date, calc_mode, manual_worked_days, manual_absent_days, manual_overtime_hours,
            auto_count_days, active, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const w of workers) {
          insW.run(
            w.id,
            w.project_id ?? 1,
            w.name,
            w.role,
            w.phone,
            w.wage_type,
            w.base_wage,
            w.overtime_rate,
            w.start_date || getTodayIso(),
            w.end_date || null,
            w.calc_mode || 'to_today',
            w.manual_worked_days ?? null,
            w.manual_absent_days ?? 0,
            w.manual_overtime_hours ?? null,
            w.auto_count_days ?? 1,
            w.active ?? 1,
            w.notes ?? '',
            w.created_at ?? ''
          );
        }
        if (Array.isArray(daily_logs)) {
          const insL = db.prepare(
            'INSERT INTO daily_logs (id, worker_id, work_date, shamsi_year, shamsi_month, shamsi_day, status, days_equiv, overtime_hours, bonus_amount, project_name, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const l of daily_logs) {
            insL.run(l.id, l.worker_id, l.work_date, l.shamsi_year, l.shamsi_month, l.shamsi_day, l.status, l.days_equiv, l.overtime_hours, l.bonus_amount, l.project_name ?? '', l.note ?? '');
          }
        }
        if (Array.isArray(monthly_records)) {
          const insM = db.prepare(
            'INSERT INTO monthly_records (id, worker_id, shamsi_year, shamsi_month, manual_days, manual_overtime, monthly_bonus, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const m of monthly_records) {
            insM.run(m.id, m.worker_id, m.shamsi_year, m.shamsi_month, m.manual_days, m.manual_overtime, m.monthly_bonus ?? 0, m.note ?? '');
          }
        }
        if (Array.isArray(payments)) {
          const insP = db.prepare(
            'INSERT INTO payments (id, project_id, worker_id, payment_date, shamsi_year, shamsi_month, amount, payment_type, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const p of payments) {
            insP.run(p.id, p.project_id ?? 1, p.worker_id, p.payment_date, p.shamsi_year, p.shamsi_month, p.amount, p.payment_type, p.note ?? '', p.created_at ?? '');
          }
        }
        db.exec('COMMIT;');
        res.json({ ok: true });
      } catch (innerErr) {
        db.exec('ROLLBACK;');
        throw innerErr;
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KarkardYar SQLite Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
