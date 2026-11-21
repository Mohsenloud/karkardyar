import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { isoToShamsi, getTodayIso, shamsiToIso, addDaysIso } from './src/utils/jalali.ts';

const PORT = Number(process.env.PORT) || 3000;

const isProduction = process.env.NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.cwd(), process.env.DATA_DIR)
  : isProduction
  ? path.resolve(process.cwd(), 'data')
  : path.join(os.tmpdir(), 'karkardyar-preview-data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const RECEIPTS_DIR = path.join(DATA_DIR, 'receipts');
const AUTO_BACKUPS_DIR = path.join(DATA_DIR, 'auto-backups');
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}
if (!fs.existsSync(AUTO_BACKUPS_DIR)) {
  fs.mkdirSync(AUTO_BACKUPS_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(DATA_DIR, 'karkard.sqlite');

function migrateLegacyDatabaseFileIfNeeded() {
  if (fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 0) {
    return;
  }
  const candidateDirs = [
    process.env.LEGACY_DATA_DIR ? path.resolve(process.cwd(), process.env.LEGACY_DATA_DIR) : null,
    isProduction ? path.resolve(process.cwd(), 'data') : null,
  ].filter(Boolean) as string[];

  for (const legacyDir of candidateDirs) {
    if (path.resolve(legacyDir) === path.resolve(DATA_DIR)) continue;
    const legacyDbFile = path.join(legacyDir, 'karkard.sqlite');
    if (fs.existsSync(legacyDbFile) && fs.statSync(legacyDbFile).size > 0) {
      try {
        fs.copyFileSync(legacyDbFile, DB_PATH);
        for (const suffix of ['-wal', '-shm']) {
          const srcExtra = `${legacyDbFile}${suffix}`;
          const dstExtra = `${DB_PATH}${suffix}`;
          if (fs.existsSync(srcExtra)) {
            fs.copyFileSync(srcExtra, dstExtra);
          }
        }
        console.log(`[SQLite] Migrated existing database from ${legacyDbFile} to ${DB_PATH}`);
        break;
      } catch (err) {
        console.error('[SQLite] Failed to copy legacy database file:', err);
      }
    }
  }
}

migrateLegacyDatabaseFileIfNeeded();

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -16000;
  PRAGMA wal_autocheckpoint = 1000;

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'supervisor' CHECK(role IN ('admin', 'supervisor')),
    assigned_project_id INTEGER DEFAULT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER DEFAULT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    assigned_project_id INTEGER DEFAULT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

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
    wage_type TEXT NOT NULL DEFAULT 'daily',
    base_wage INTEGER NOT NULL DEFAULT 0,
    overtime_rate INTEGER NOT NULL DEFAULT 0,
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT NULL,
    calc_mode TEXT NOT NULL DEFAULT 'to_today',
    manual_worked_days REAL DEFAULT NULL,
    manual_absent_days REAL NOT NULL DEFAULT 0,
    manual_overtime_hours REAL DEFAULT NULL,
    auto_count_days INTEGER NOT NULL DEFAULT 1,
    fridays_off INTEGER NOT NULL DEFAULT 0,
    carry_over_balance INTEGER NOT NULL DEFAULT 0,
    fixed_allowance INTEGER NOT NULL DEFAULT 0,
    fixed_allowance_label TEXT DEFAULT 'حق غذا و ایاب‌وذهاب',
    fixed_deduction INTEGER NOT NULL DEFAULT 0,
    fixed_deduction_label TEXT DEFAULT 'کسورات ثابت',
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL,
    effective_date TEXT NOT NULL,
    wage_type TEXT NOT NULL DEFAULT 'daily',
    base_wage INTEGER NOT NULL DEFAULT 0,
    overtime_rate INTEGER NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS locked_months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    shamsi_year INTEGER NOT NULL,
    shamsi_month INTEGER NOT NULL,
    locked_by TEXT NOT NULL DEFAULT 'admin',
    locked_at TEXT DEFAULT CURRENT_TIMESTAMP,
    note TEXT DEFAULT '',
    UNIQUE(project_id, shamsi_year, shamsi_month)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_username TEXT NOT NULL,
    actor_role TEXT NOT NULL DEFAULT 'admin',
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT DEFAULT '',
    project_id INTEGER DEFAULT NULL,
    summary TEXT NOT NULL,
    details_json TEXT DEFAULT '{}',
    ip_address TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    shamsi_year INTEGER NOT NULL,
    shamsi_month INTEGER NOT NULL,
    shamsi_day INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'present',
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
    category TEXT DEFAULT '',
    receipt_path TEXT DEFAULT '',
    period_archived INTEGER NOT NULL DEFAULT 0,
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
  const mehr5Iso = shamsiToIso(todayShamsi.jy, 7, 5);
  const aban23Iso = shamsiToIso(todayShamsi.jy, 8, 23);

  if (!colNames.has('start_date')) db.exec(`ALTER TABLE workers ADD COLUMN start_date TEXT DEFAULT '${mehr5Iso}';`);
  if (!colNames.has('end_date')) db.exec(`ALTER TABLE workers ADD COLUMN end_date TEXT DEFAULT '${aban23Iso}';`);
  if (!colNames.has('auto_count_days')) db.exec(`ALTER TABLE workers ADD COLUMN auto_count_days INTEGER NOT NULL DEFAULT 1;`);
  if (!colNames.has('calc_mode')) db.exec(`ALTER TABLE workers ADD COLUMN calc_mode TEXT NOT NULL DEFAULT 'to_today';`);
  if (!colNames.has('manual_worked_days')) db.exec(`ALTER TABLE workers ADD COLUMN manual_worked_days REAL DEFAULT NULL;`);
  if (!colNames.has('manual_absent_days')) db.exec(`ALTER TABLE workers ADD COLUMN manual_absent_days REAL NOT NULL DEFAULT 0;`);
  if (!colNames.has('manual_overtime_hours')) db.exec(`ALTER TABLE workers ADD COLUMN manual_overtime_hours REAL DEFAULT NULL;`);
  if (!colNames.has('fridays_off')) db.exec(`ALTER TABLE workers ADD COLUMN fridays_off INTEGER NOT NULL DEFAULT 0;`);
  if (!colNames.has('project_id')) db.exec(`ALTER TABLE workers ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;`);
  if (!colNames.has('carry_over_balance')) db.exec(`ALTER TABLE workers ADD COLUMN carry_over_balance INTEGER NOT NULL DEFAULT 0;`);
  if (!colNames.has('fixed_allowance')) db.exec(`ALTER TABLE workers ADD COLUMN fixed_allowance INTEGER NOT NULL DEFAULT 0;`);
  if (!colNames.has('fixed_allowance_label')) db.exec(`ALTER TABLE workers ADD COLUMN fixed_allowance_label TEXT DEFAULT 'حق غذا و ایاب‌وذهاب';`);
  if (!colNames.has('fixed_deduction')) db.exec(`ALTER TABLE workers ADD COLUMN fixed_deduction INTEGER NOT NULL DEFAULT 0;`);
  if (!colNames.has('fixed_deduction_label')) db.exec(`ALTER TABLE workers ADD COLUMN fixed_deduction_label TEXT DEFAULT 'کسورات ثابت';`);

  const projCols = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>;
  const projColNames = new Set(projCols.map((c) => c.name));
  if (!projColNames.has('color')) {
    db.exec(`ALTER TABLE projects ADD COLUMN color TEXT DEFAULT 'emerald';`);
    db.exec(`UPDATE projects SET color = 'indigo' WHERE id = 2 AND (color IS NULL OR color = 'emerald');`);
    db.exec(`UPDATE projects SET color = 'violet' WHERE id = 3 AND (color IS NULL OR color = 'emerald');`);
    db.exec(`UPDATE projects SET color = 'amber' WHERE id = 4 AND (color IS NULL OR color = 'emerald');`);
  }

  const paymentCols = db.prepare('PRAGMA table_info(payments)').all() as Array<{ name: string }>;
  const paymentColNames = new Set(paymentCols.map((c) => c.name));
  if (!paymentColNames.has('project_id')) {
    db.exec(`
      ALTER TABLE payments ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;
      UPDATE payments SET project_id = COALESCE((SELECT project_id FROM workers WHERE workers.id = payments.worker_id), 1);
    `);
  }
  if (!paymentColNames.has('category')) db.exec(`ALTER TABLE payments ADD COLUMN category TEXT DEFAULT '';`);
  if (!paymentColNames.has('receipt_path')) db.exec(`ALTER TABLE payments ADD COLUMN receipt_path TEXT DEFAULT '';`);
  if (!paymentColNames.has('period_archived')) db.exec(`ALTER TABLE payments ADD COLUMN period_archived INTEGER NOT NULL DEFAULT 0;`);

  const sessionCols = db.prepare('PRAGMA table_info(auth_sessions)').all() as Array<{ name: string }>;
  const sessionColNames = new Set(sessionCols.map((c) => c.name));
  if (!sessionColNames.has('user_id')) db.exec(`ALTER TABLE auth_sessions ADD COLUMN user_id INTEGER DEFAULT NULL;`);
  if (!sessionColNames.has('role')) db.exec(`ALTER TABLE auth_sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';`);
  if (!sessionColNames.has('assigned_project_id')) db.exec(`ALTER TABLE auth_sessions ADD COLUMN assigned_project_id INTEGER DEFAULT NULL;`);
}

migrateColumns();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_workers_project ON workers(project_id, active);
  CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(work_date);
  CREATE INDEX IF NOT EXISTS idx_daily_logs_worker_ym ON daily_logs(worker_id, shamsi_year, shamsi_month);
  CREATE INDEX IF NOT EXISTS idx_payments_project_date ON payments(project_id, payment_date);
  CREATE INDEX IF NOT EXISTS idx_payments_worker ON payments(worker_id, period_archived);
  CREATE INDEX IF NOT EXISTS idx_wage_history_worker ON wage_history(worker_id, effective_date);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
`);

function seedIfEmpty() {
  const metaRow = db
    .prepare("SELECT value FROM app_meta WHERE key = 'initial_seed_done'")
    .get() as { value: string } | undefined;

  if (metaRow?.value === '1') {
    const projCount = (db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number }).cnt;
    if (projCount === 0) {
      db.prepare('INSERT INTO projects (name, description, color, active) VALUES (?, ?, ?, 1)').run(
        'پروژه الف',
        'پروژه اصلی',
        'emerald'
      );
    }
    return;
  }

  const workerCount = (db.prepare('SELECT COUNT(*) as cnt FROM workers').get() as { cnt: number }).cnt;
  const logCount = (db.prepare('SELECT COUNT(*) as cnt FROM daily_logs').get() as { cnt: number }).cnt;
  const paymentCount = (db.prepare('SELECT COUNT(*) as cnt FROM payments').get() as { cnt: number }).cnt;
  const projCount = (db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number }).cnt;

  if (workerCount > 0 || logCount > 0 || paymentCount > 0) {
    if (projCount === 0) {
      db.prepare('INSERT INTO projects (name, description, color, active) VALUES (?, ?, ?, 1)').run(
        'پروژه الف',
        'پروژه اصلی',
        'emerald'
      );
    }
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('initial_seed_done', '1')").run();
    return;
  }

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

  if (process.env.SEED_SAMPLE_DATA === 'false') {
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('initial_seed_done', '1')").run();
    return;
  }

  const todayIso = getTodayIso();
  const todayShamsi = isoToShamsi(todayIso);
  const mehr5Iso = shamsiToIso(todayShamsi.jy, 7, 5);
  const aban23Iso = shamsiToIso(todayShamsi.jy, 8, 23);
  const mehr4Iso = shamsiToIso(todayShamsi.jy, 7, 4);

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

  insertWorker.run(
    1,
    'مهدی کریمی',
    'جوشکار و آهنگر',
    '09128765432',
    'daily',
    1250000,
    160000,
    mehr4Iso,
    addDaysIso(todayIso, 8),
    'جوشکاری سازه و نبشی‌کشی'
  );

  insertWorker.run(
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
  );

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

  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('initial_seed_done', '1')").run();
}

seedIfEmpty();

// ============================================================================
// High-Security Multi-User RBAC Auth (scrypt + SHA-256 Sessions + Rate Limiter)
// ============================================================================
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEYLEN = 64;
const SESSION_COOKIE_NAME = 'karkard_session';

interface AuthContext {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'supervisor';
  assignedProjectId: number | null;
  tokenHash: string | null;
  viaCookie: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthContext;
    }
  }
}

function hashPassword(password: string, saltHex?: string): { hashHex: string; saltHex: string } {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return {
    hashHex: derived.toString('hex'),
    saltHex: salt.toString('hex'),
  };
}

function verifyPassword(password: string, storedHashHex: string, storedSaltHex: string): boolean {
  try {
    const { hashHex } = hashPassword(password, storedSaltHex);
    const bufA = Buffer.from(hashHex, 'hex');
    const bufB = Buffer.from(storedHashHex, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function timingSafeStringMatch(input: string, expected: string): boolean {
  const hashA = crypto.createHash('sha256').update(String(input)).digest();
  const hashB = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(hashA, hashB) && input.length === expected.length;
}

function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function getMetaValue(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

function setMetaValue(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value);
}

function migrateLegacyAdminToUsersTable() {
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (userCount > 0) return;

  const legacyUsername = getMetaValue('admin_username');
  const legacyHash = getMetaValue('admin_password_hash');
  const legacySalt = getMetaValue('admin_password_salt');

  if (legacyUsername && legacyHash && legacySalt) {
    db.prepare(
      `INSERT OR IGNORE INTO users (username, display_name, password_hash, password_salt, role, assigned_project_id, active)
       VALUES (?, ?, ?, ?, 'admin', NULL, 1)`
    ).run(legacyUsername, 'مدیر کل', legacyHash, legacySalt);
  }
}

migrateLegacyAdminToUsersTable();

function hasAnyAdminUser(): boolean {
  const envUser = process.env.ADMIN_USERNAME?.trim();
  const envPass = process.env.ADMIN_PASSWORD;
  if (envUser && envPass && envPass.length >= 6) return true;
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND active = 1")
    .get() as { cnt: number };
  return row.cnt > 0;
}

function createInitialAdmin(username: string, plainPassword: string): { id: number; username: string } {
  const { hashHex, saltHex } = hashPassword(plainPassword);
  const cleanUser = username.trim();
  const info = db
    .prepare(
      `INSERT INTO users (username, display_name, password_hash, password_salt, role, assigned_project_id, active)
       VALUES (?, 'مدیر کل', ?, ?, 'admin', NULL, 1)`
    )
    .run(cleanUser, hashHex, saltHex);
  setMetaValue('admin_username', cleanUser);
  setMetaValue('admin_password_hash', hashHex);
  setMetaValue('admin_password_salt', saltHex);
  setMetaValue('auth_updated_at', new Date().toISOString());
  return { id: Number(info.lastInsertRowid), username: cleanUser };
}

function initAdminFromEnvIfProvided() {
  const envUser = process.env.ADMIN_USERNAME?.trim();
  const envPass = process.env.ADMIN_PASSWORD;
  if (!envUser || !envPass || envPass.length < 6) return;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(envUser) as { id: number } | undefined;
  const { hashHex, saltHex } = hashPassword(envPass);
  if (existing) {
    db.prepare(
      "UPDATE users SET password_hash = ?, password_salt = ?, role = 'admin', active = 1 WHERE id = ?"
    ).run(hashHex, saltHex, existing.id);
  } else {
    db.prepare(
      `INSERT INTO users (username, display_name, password_hash, password_salt, role, assigned_project_id, active)
       VALUES (?, 'مدیر کل', ?, ?, 'admin', NULL, 1)`
    ).run(envUser, hashHex, saltHex);
  }
}

initAdminFromEnvIfProvided();

function createAuthSession(
  user: { id: number; username: string; role: 'admin' | 'supervisor'; assigned_project_id: number | null },
  rememberMe = true
): { rawToken: string; maxAgeSec: number } {
  const now = Date.now();
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const maxAgeSec = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
  const expiresAt = now + maxAgeSec * 1000;

  db.prepare(
    'INSERT INTO auth_sessions (token_hash, user_id, username, role, assigned_project_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(tokenHash, user.id, user.username, user.role, user.assigned_project_id, now, expiresAt);

  return { rawToken, maxAgeSec };
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

function extractTokenFromReq(req: express.Request): { token: string | null; viaCookie: boolean } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, viaCookie: false };
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return { token: cookies[SESSION_COOKIE_NAME], viaCookie: true };
  }
  return { token: null, viaCookie: false };
}

function validateSessionFromReq(req: express.Request): AuthContext | null {
  const { token: rawToken, viaCookie } = extractTokenFromReq(req);
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT s.user_id, s.username, s.role, s.assigned_project_id, s.expires_at,
              u.id as u_id, u.display_name, u.role as u_role, u.assigned_project_id as u_proj, u.active as u_active
       FROM auth_sessions s
       LEFT JOIN users u ON u.id = s.user_id OR (s.user_id IS NULL AND u.username = s.username)
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as any;

  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  if (row.u_id && row.u_active === 0) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    id: Number(row.u_id || row.user_id || 1),
    username: String(row.username),
    displayName: String(row.display_name || row.username),
    role: (row.u_role || row.role) === 'supervisor' ? 'supervisor' : 'admin',
    assignedProjectId:
      row.u_proj !== undefined && row.u_proj !== null
        ? Number(row.u_proj)
        : row.assigned_project_id !== null && row.assigned_project_id !== undefined
        ? Number(row.assigned_project_id)
        : null,
    tokenHash,
    viaCookie,
  };
}

function isSecureRequest(req: express.Request): boolean {
  if (req.secure) return true;
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

function setSessionCookie(req: express.Request, res: express.Response, rawToken: string, maxAgeSec: number) {
  if (isSecureRequest(req)) {
    const sameSiteAttrs = isProduction
      ? 'SameSite=Lax; Secure'
      : 'SameSite=None; Secure; Partitioned';
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; ${sameSiteAttrs}`
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`
    );
  }
}

function clearSessionCookie(req: express.Request, res: express.Response) {
  if (isSecureRequest(req)) {
    const sameSiteAttrs = isProduction
      ? 'SameSite=Lax; Secure'
      : 'SameSite=None; Secure; Partitioned';
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; ${sameSiteAttrs}`
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    );
  }
}

function isSameOriginOrCustomHeader(req: express.Request): boolean {
  if (req.headers['x-requested-with']) return true;
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser or same-origin non-CORS
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    return Boolean(expectedHost && originHost === expectedHost);
  } catch {
    return false;
  }
}

// Brute-force / Rate-limit tracker per IP
interface RateLimitRecord {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}
const loginRateLimits = new Map<string, RateLimitRecord>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

function sweepExpiredRateLimits(now: number) {
  if (loginRateLimits.size < 100) return;
  for (const [key, rec] of loginRateLimits.entries()) {
    const expiredLock = rec.lockedUntil > 0 && rec.lockedUntil <= now;
    const expiredWindow = rec.lockedUntil === 0 && now - rec.firstFailureAt > LOCKOUT_WINDOW_MS;
    if (expiredLock || expiredWindow) {
      loginRateLimits.delete(key);
    }
  }
}

function getClientIp(req: express.Request): string {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress || req.ip || 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; remainingSeconds: number } {
  const now = Date.now();
  sweepExpiredRateLimits(now);
  const rec = loginRateLimits.get(ip);
  if (!rec) return { allowed: true, remainingSeconds: 0 };
  if (rec.lockedUntil > now) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil((rec.lockedUntil - now) / 1000),
    };
  }
  if (now - rec.firstFailureAt > LOCKOUT_WINDOW_MS || (rec.lockedUntil > 0 && rec.lockedUntil <= now)) {
    loginRateLimits.delete(ip);
  }
  return { allowed: true, remainingSeconds: 0 };
}

function recordFailedAttempt(ip: string): { locked: boolean; attemptsLeft: number; remainingSeconds: number } {
  const now = Date.now();
  sweepExpiredRateLimits(now);
  const existing = loginRateLimits.get(ip);
  if (!existing || now - existing.firstFailureAt > LOCKOUT_WINDOW_MS) {
    loginRateLimits.set(ip, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
    return { locked: false, attemptsLeft: MAX_LOGIN_ATTEMPTS - 1, remainingSeconds: 0 };
  }
  existing.failures += 1;
  if (existing.failures >= MAX_LOGIN_ATTEMPTS) {
    existing.lockedUntil = now + LOCKOUT_WINDOW_MS;
    return { locked: true, attemptsLeft: 0, remainingSeconds: Math.ceil(LOCKOUT_WINDOW_MS / 1000) };
  }
  return {
    locked: false,
    attemptsLeft: Math.max(0, MAX_LOGIN_ATTEMPTS - existing.failures),
    remainingSeconds: 0,
  };
}

function clearRateLimit(ip: string) {
  loginRateLimits.delete(ip);
}

// ============================================================================
// Audit Logger, Month Lock Guard, Receipt File Helpers & Auto-Backup Scheduler
// ============================================================================
function logAudit(
  req: express.Request | null,
  action: string,
  entityType: string,
  entityId: string | number | null,
  projectId: number | null,
  summary: string,
  details?: Record<string, unknown>
) {
  try {
    const actor = req?.authUser?.username || 'system';
    const role = req?.authUser?.role || 'system';
    const ip = req ? getClientIp(req) : 'internal';
    db.prepare(
      `INSERT INTO audit_logs (actor_username, actor_role, action, entity_type, entity_id, project_id, summary, details_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      actor,
      role,
      action,
      entityType,
      entityId !== null && entityId !== undefined ? String(entityId) : '',
      projectId,
      summary,
      JSON.stringify(details || {}),
      ip
    );
  } catch (err) {
    console.error('[Audit] Failed to record audit log:', err);
  }
}

function isMonthLocked(projectId: number, shamsiYear: number, shamsiMonth: number): boolean {
  const row = db
    .prepare('SELECT id FROM locked_months WHERE project_id = ? AND shamsi_year = ? AND shamsi_month = ?')
    .get(projectId, shamsiYear, shamsiMonth) as { id: number } | undefined;
  return Boolean(row);
}

const MAX_RECEIPT_BYTES = 3 * 1024 * 1024; // 3MB
const ALLOWED_IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function saveReceiptBase64(dataUrl: string): string {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error('فرمت تصویر رسید معتبر نیست (فقط JPG، PNG یا WebP مجاز است).');
  }
  const mime = match[1].toLowerCase();
  const ext = ALLOWED_IMAGE_MIMES[mime];
  if (!ext) {
    throw new Error('فرمت تصویر مجاز نیست.');
  }
  const buf = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buf.length === 0 || buf.length > MAX_RECEIPT_BYTES) {
    throw new Error('حجم تصویر رسید باید کمتر از ۳ مگابایت باشد.');
  }
  const filename = `${crypto.randomUUID()}${ext}`;
  const targetPath = path.resolve(RECEIPTS_DIR, filename);
  if (!targetPath.startsWith(RECEIPTS_DIR + path.sep)) {
    throw new Error('مسیر ذخیره‌سازی نامعتبر است.');
  }
  fs.writeFileSync(targetPath, buf);
  return filename;
}

function removeReceiptFileSafe(filename?: string | null) {
  if (!filename) return;
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(filename)) return;
  const resolved = path.resolve(RECEIPTS_DIR, filename);
  if (!resolved.startsWith(RECEIPTS_DIR + path.sep)) return;
  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  } catch {
    // ignore
  }
}

function getAutoBackupConfig() {
  const enabled = getMetaValue('auto_backup_enabled') === '1';
  const intervalHours = Math.max(1, Math.min(168, Number(getMetaValue('auto_backup_interval_hours')) || 24));
  const keepCount = Math.max(3, Math.min(60, Number(getMetaValue('auto_backup_keep_count')) || 14));
  const telegramEnabled = getMetaValue('telegram_enabled') === '1';
  const telegramChatId = getMetaValue('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID || '';
  const storedToken = getMetaValue('telegram_bot_token') || process.env.TELEGRAM_BOT_TOKEN || '';
  const lastRunAt = getMetaValue('auto_backup_last_run_at');
  const lastStatus = getMetaValue('auto_backup_last_status');

  return {
    enabled,
    intervalHours,
    keepCount,
    telegramEnabled,
    telegramChatId,
    botToken: storedToken,
    hasTelegramToken: Boolean(storedToken),
    lastRunAt,
    lastStatus,
  };
}

function listAutoBackupFiles(): Array<{ filename: string; sizeKb: number; createdAt: string }> {
  if (!fs.existsSync(AUTO_BACKUPS_DIR)) return [];
  const entries = fs
    .readdirSync(AUTO_BACKUPS_DIR)
    .filter((f) => /^karkard-auto-[0-9_-]+\.sqlite$/.test(f));

  return entries
    .map((filename) => {
      const full = path.resolve(AUTO_BACKUPS_DIR, filename);
      const stat = fs.statSync(full);
      return {
        filename,
        sizeKb: Math.round((stat.size / 1024) * 10) / 10,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function runAutoBackup(trigger: 'scheduled' | 'manual', req: express.Request | null = null) {
  const cfg = getAutoBackupConfig();
  db.exec('PRAGMA wal_checkpoint(FULL);');

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(
    now.getMinutes()
  ).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
  const filename = `karkard-auto-${stamp}.sqlite`;
  const targetPath = path.resolve(AUTO_BACKUPS_DIR, filename);
  if (!targetPath.startsWith(AUTO_BACKUPS_DIR + path.sep)) {
    throw new Error('مسیر بکاپ نامعتبر است');
  }

  fs.copyFileSync(DB_PATH, targetPath);

  // Enforce retention count
  const existingFiles = listAutoBackupFiles();
  if (existingFiles.length > cfg.keepCount) {
    const toRemove = existingFiles.slice(cfg.keepCount);
    for (const old of toRemove) {
      const oldPath = path.resolve(AUTO_BACKUPS_DIR, old.filename);
      if (oldPath.startsWith(AUTO_BACKUPS_DIR + path.sep) && fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          // ignore
        }
      }
    }
  }

  let statusText = 'ذخیره محلی با موفقیت انجام شد';

  if (cfg.telegramEnabled && cfg.botToken && cfg.telegramChatId) {
    try {
      const fileBuffer = fs.readFileSync(targetPath);
      const form = new FormData();
      form.append('chat_id', cfg.telegramChatId.trim());
      form.append(
        'caption',
        `نسخه پشتیبان ${trigger === 'manual' ? 'دستی' : 'خودکار'} کارکردیار (${getTodayIso()})`
      );
      form.append(
        'document',
        new Blob([fileBuffer], { type: 'application/x-sqlite3' }),
        filename
      );

      // Host strictly pinned to api.telegram.org to eliminate SSRF risk
      const tgUrl = `https://api.telegram.org/bot${encodeURIComponent(cfg.botToken.trim())}/sendDocument`;
      const tgRes = await fetch(tgUrl, { method: 'POST', body: form });
      if (tgRes.ok) {
        statusText = 'ذخیره محلی و ارسال به تلگرام با موفقیت انجام شد';
      } else {
        statusText = `ذخیره محلی انجام شد، اما ارسال تلگرام خطا داد (کد ${tgRes.status})`;
      }
    } catch {
      statusText = 'ذخیره محلی انجام شد، اما اتصال به تلگرام برقرار نشد';
    }
  }

  setMetaValue('auto_backup_last_run_at', now.toISOString());
  setMetaValue('auto_backup_last_status', statusText);
  logAudit(req, 'backup', 'system', filename, null, `پشتیبان‌گیری ${trigger === 'manual' ? 'دستی' : 'خودکار'}: ${statusText}`);
  return { filename, statusText, runAt: now.toISOString() };
}

// Background scheduler checks every 15 minutes
const autoBackupInterval = setInterval(() => {
  try {
    const cfg = getAutoBackupConfig();
    if (!cfg.enabled) return;
    const lastMs = cfg.lastRunAt ? Date.parse(cfg.lastRunAt) : 0;
    const dueMs = cfg.intervalHours * 60 * 60 * 1000;
    if (!lastMs || Date.now() - lastMs >= dueMs) {
      runAutoBackup('scheduled', null).catch((err) => {
        console.error('[AutoBackup] Scheduled run failed:', err);
      });
    }
  } catch {
    // ignore scheduler errors
  }
}, 15 * 60 * 1000);
autoBackupInterval.unref();

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.authUser || req.authUser.role !== 'admin') {
    return res.status(403).json({
      error: 'دسترسی محدود است. این عملیات فقط برای مدیر کل مجاز می‌باشد.',
    });
  }
  next();
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  if (TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  // Gzip compression for API JSON & static assets (huge bandwidth savings on mobile/VPS)
  app.use(compression({ threshold: 1024 }));

  // Production security headers & API no-store cache protection
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProduction) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      if (isSecureRequest(req)) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1 AS ok').get();
      res.json({ ok: true, db: 'ok', uptimeSec: Math.floor(process.uptime()) });
    } catch {
      res.status(503).json({ ok: false, db: 'error' });
    }
  });

  // 1. Auth Status
  app.get('/api/auth/status', (req, res) => {
    if (!hasAnyAdminUser()) {
      return res.json({
        isSetup: false,
        authenticated: false,
        username: null,
        user: null,
      });
    }
    const session = validateSessionFromReq(req);
    return res.json({
      isSetup: true,
      authenticated: Boolean(session),
      username: session ? session.username : null,
      user: session
        ? {
            id: session.id,
            username: session.username,
            displayName: session.displayName,
            role: session.role,
            assignedProjectId: session.assignedProjectId,
          }
        : null,
    });
  });

  // 2. First-Time Admin Setup
  app.post('/api/auth/setup', (req, res) => {
    try {
      if (hasAnyAdminUser()) {
        return res.status(403).json({
          error: 'حساب مدیر قبلاً تعریف شده است. لطفاً وارد شوید.',
        });
      }
      const { username, password, rememberMe = true } = req.body;
      const cleanUser = String(username || '').trim();
      const rawPass = String(password || '');

      if (cleanUser.length < 3) {
        return res.status(400).json({ error: 'نام کاربری باید حداقل ۳ کاراکتر باشد.' });
      }
      if (rawPass.length < 6) {
        return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد تا امنیت کافی داشته باشد.' });
      }

      const created = createInitialAdmin(cleanUser, rawPass);
      const { rawToken, maxAgeSec } = createAuthSession(
        { id: created.id, username: created.username, role: 'admin', assigned_project_id: null },
        Boolean(rememberMe)
      );
      setSessionCookie(req, res, rawToken, maxAgeSec);
      logAudit(null, 'setup', 'auth', created.id, null, `راه‌اندازی حساب مدیر کل (${cleanUser})`);

      res.json({
        ok: true,
        token: rawToken,
        username: cleanUser,
        user: {
          id: created.id,
          username: cleanUser,
          displayName: 'مدیر کل',
          role: 'admin',
          assignedProjectId: null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'خطا در ثبت اطلاعات امنیتی' });
    }
  });

  // 3. Login (Supports Multi-User Admin & Supervisor)
  app.post('/api/auth/login', (req, res) => {
    try {
      const ip = getClientIp(req);
      const rateCheck = checkRateLimit(ip);
      if (!rateCheck.allowed) {
        const mins = Math.ceil(rateCheck.remainingSeconds / 60);
        return res.status(429).json({
          error: `به دلیل تلاش‌های ناموفق متوالی، ورود به مدت ${mins} دقیقه مسدود شده است.`,
          lockedSeconds: rateCheck.remainingSeconds,
        });
      }

      if (!hasAnyAdminUser()) {
        return res.status(400).json({ error: 'هنوز نام کاربری و رمز عبور اولیه تعریف نشده است.' });
      }

      const { username, password, rememberMe = true } = req.body;
      const inputUser = String(username || '').trim();
      const inputPass = String(password || '');

      const allUsers = db.prepare('SELECT * FROM users WHERE active = 1').all() as Array<any>;
      let matchedUser: any = null;
      for (const u of allUsers) {
        if (timingSafeStringMatch(inputUser, u.username)) {
          matchedUser = u;
          break;
        }
      }

      const passMatch = matchedUser
        ? verifyPassword(inputPass, matchedUser.password_hash, matchedUser.password_salt)
        : false;

      if (!matchedUser || !passMatch) {
        const failInfo = recordFailedAttempt(ip);
        if (failInfo.locked) {
          return res.status(429).json({
            error: '۵ بار تلاش ناموفق ثبت شد. ورود شما به مدت ۱۵ دقیقه قفل شد.',
            lockedSeconds: failInfo.remainingSeconds,
          });
        }
        return res.status(401).json({
          error: `نام کاربری یا رمز عبور اشتباه است. (${failInfo.attemptsLeft} تلاش دیگر باقی مانده)`,
        });
      }

      clearRateLimit(ip);
      const role: 'admin' | 'supervisor' = matchedUser.role === 'supervisor' ? 'supervisor' : 'admin';
      const assignedProjectId =
        matchedUser.assigned_project_id !== null && matchedUser.assigned_project_id !== undefined
          ? Number(matchedUser.assigned_project_id)
          : null;

      const { rawToken, maxAgeSec } = createAuthSession(
        { id: matchedUser.id, username: matchedUser.username, role, assigned_project_id: assignedProjectId },
        Boolean(rememberMe)
      );
      setSessionCookie(req, res, rawToken, maxAgeSec);

      req.authUser = {
        id: matchedUser.id,
        username: matchedUser.username,
        displayName: matchedUser.display_name || matchedUser.username,
        role,
        assignedProjectId,
        tokenHash: null,
        viaCookie: false,
      };
      logAudit(req, 'login', 'auth', matchedUser.id, assignedProjectId, `ورود به سامانه (${role === 'admin' ? 'مدیر کل' : 'سرپرست'})`);

      res.json({
        ok: true,
        token: rawToken,
        username: matchedUser.username,
        user: {
          id: matchedUser.id,
          username: matchedUser.username,
          displayName: matchedUser.display_name || matchedUser.username,
          role,
          assignedProjectId,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'خطا در ورود به سیستم' });
    }
  });

  // 4. Logout
  app.post('/api/auth/logout', (req, res) => {
    try {
      const session = validateSessionFromReq(req);
      if (session?.tokenHash) {
        req.authUser = session;
        logAudit(req, 'logout', 'auth', session.id, session.assignedProjectId, 'خروج از سامانه');
        db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(session.tokenHash);
      }
      clearSessionCookie(req, res);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Authentication & CSRF Guard for all remaining /api/* routes
  app.use('/api', (req, res, next) => {
    if (!hasAnyAdminUser()) {
      return res.status(401).json({
        error: 'لطفاً ابتدا نام کاربری و رمز عبور اولیه برنامه را تعریف کنید.',
        requireSetup: true,
      });
    }
    const session = validateSessionFromReq(req);
    if (!session) {
      return res.status(401).json({
        error: 'نشست امنیتی شما منقضی شده یا وارد نشده‌اید. لطفاً مجدداً وارد شوید.',
        requireLogin: true,
      });
    }
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
    if (session.viaCookie && isMutating && !isSameOriginOrCustomHeader(req)) {
      return res.status(403).json({ error: 'درخواست نامعتبر از مبدا خارجی مسدود شد.' });
    }
    req.authUser = session;
    next();
  });

  // 6. Change Own Credentials
  app.post('/api/auth/change-credentials', (req, res) => {
    try {
      const ip = getClientIp(req);
      const rateCheck = checkRateLimit(ip);
      if (!rateCheck.allowed) {
        return res.status(429).json({ error: 'تعداد تلاش‌های اشتباه بیش از حد مجاز است.' });
      }

      const authUser = req.authUser!;
      const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(authUser.id) as any;
      if (!userRow) return res.status(404).json({ error: 'حساب کاربری یافت نشد.' });

      const { currentPassword, newUsername, newPassword } = req.body;
      const cleanNewUser = String(newUsername || '').trim();
      const rawNewPass = String(newPassword || '');

      if (!verifyPassword(String(currentPassword || ''), userRow.password_hash, userRow.password_salt)) {
        const failInfo = recordFailedAttempt(ip);
        return res.status(401).json({
          error: `رمز عبور فعلی اشتباه است. (${failInfo.attemptsLeft} تلاش باقی مانده)`,
        });
      }

      if (cleanNewUser.length < 3) {
        return res.status(400).json({ error: 'نام کاربری جدید باید حداقل ۳ کاراکتر باشد.' });
      }
      if (rawNewPass.length < 6) {
        return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
      }

      const duplicate = db
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .get(cleanNewUser, userRow.id) as { id: number } | undefined;
      if (duplicate) {
        return res.status(409).json({ error: 'این نام کاربری قبلاً ثبت شده است.' });
      }

      clearRateLimit(ip);
      const { hashHex, saltHex } = hashPassword(rawNewPass);
      db.prepare('UPDATE users SET username = ?, password_hash = ?, password_salt = ? WHERE id = ?').run(
        cleanNewUser,
        hashHex,
        saltHex,
        userRow.id
      );

      db.prepare('DELETE FROM auth_sessions WHERE user_id = ? OR username = ?').run(userRow.id, userRow.username);
      const { rawToken, maxAgeSec } = createAuthSession(
        {
          id: userRow.id,
          username: cleanNewUser,
          role: userRow.role === 'supervisor' ? 'supervisor' : 'admin',
          assigned_project_id: userRow.assigned_project_id ?? null,
        },
        true
      );
      setSessionCookie(req, res, rawToken, maxAgeSec);
      logAudit(req, 'update', 'auth', userRow.id, null, `تغییر رمز عبور و نام کاربری (${cleanNewUser})`);

      res.json({ ok: true, token: rawToken, username: cleanNewUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'خطا در تغییر اطلاعات امنیتی' });
    }
  });

  // ==========================================================================
  // Bootstrap (Role-Filtered: Supervisor sees only their assigned project & no wages/payments)
  // ==========================================================================
  app.get('/api/bootstrap', (req, res) => {
    try {
      const authUser = req.authUser!;
      const todayIso = getTodayIso();
      const isSup = authUser.role === 'supervisor';

      let projects = db.prepare('SELECT * FROM projects ORDER BY active DESC, id ASC').all() as Array<any>;
      if (isSup && authUser.assignedProjectId) {
        projects = projects.filter((p) => Number(p.id) === Number(authUser.assignedProjectId));
      }

      let workers = db
        .prepare(
          `SELECT w.*, COALESCE(pr.name, 'پروژه الف') as project_name, COALESCE(pr.color, 'emerald') as project_color
           FROM workers w
           LEFT JOIN projects pr ON pr.id = w.project_id
           ORDER BY w.active DESC, w.id ASC`
        )
        .all() as Array<any>;

      if (isSup) {
        if (authUser.assignedProjectId) {
          workers = workers.filter((w) => Number(w.project_id) === Number(authUser.assignedProjectId));
        }
        // Strip sensitive financial fields for supervisor role
        workers = workers.map((w) => ({
          ...w,
          base_wage: 0,
          overtime_rate: 0,
          carry_over_balance: 0,
          fixed_allowance: 0,
          fixed_deduction: 0,
        }));
      }

      const allowedWorkerIds = new Set(workers.map((w) => Number(w.id)));

      let allLogs = db.prepare('SELECT * FROM daily_logs ORDER BY work_date ASC').all() as Array<any>;
      if (isSup) {
        allLogs = allLogs
          .filter((l) => allowedWorkerIds.has(Number(l.worker_id)))
          .map((l) => ({ ...l, bonus_amount: 0 }));
      }

      const allPayments = isSup
        ? []
        : (db
            .prepare(
              `SELECT p.*, w.name as worker_name, w.role as worker_role
               FROM payments p
               JOIN workers w ON w.id = p.worker_id
               ORDER BY p.payment_date DESC, p.id DESC`
            )
            .all() as Array<any>);

      const wageHistory = isSup
        ? []
        : (db.prepare('SELECT * FROM wage_history ORDER BY effective_date ASC, id ASC').all() as Array<any>);

      const lockedMonths = db
        .prepare('SELECT * FROM locked_months ORDER BY shamsi_year DESC, shamsi_month DESC')
        .all() as Array<any>;

      res.json({
        todayIso,
        currentUser: {
          id: authUser.id,
          username: authUser.username,
          displayName: authUser.displayName,
          role: authUser.role,
          assignedProjectId: authUser.assignedProjectId,
        },
        projects,
        workers,
        allLogs,
        allPayments,
        wageHistory,
        lockedMonths,
        dbFileSizeKb: isSup ? 0 : Math.round((fs.statSync(DB_PATH).size / 1024) * 10) / 10,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'خطا در خواندن اطلاعات از دیتابیس SQLite' });
    }
  });

  // ==========================================================================
  // Multi-User Management (Admin Only)
  // ==========================================================================
  app.get('/api/users', requireAdmin, (_req, res) => {
    try {
      const users = db
        .prepare(
          `SELECT u.id, u.username, u.display_name, u.role, u.assigned_project_id, u.active, u.created_at,
                  pr.name as project_name
           FROM users u
           LEFT JOIN projects pr ON pr.id = u.assigned_project_id
           ORDER BY u.role ASC, u.id ASC`
        )
        .all();
      res.json({ users });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/users', requireAdmin, (req, res) => {
    try {
      const { username, display_name, password, role = 'supervisor', assigned_project_id } = req.body;
      const cleanUser = String(username || '').trim();
      const rawPass = String(password || '');
      if (cleanUser.length < 3) {
        return res.status(400).json({ error: 'نام کاربری باید حداقل ۳ کاراکتر باشد.' });
      }
      if (rawPass.length < 6) {
        return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      }
      const resolvedRole = role === 'admin' ? 'admin' : 'supervisor';
      const resolvedProjId =
        resolvedRole === 'supervisor' && assigned_project_id ? Number(assigned_project_id) : null;

      if (resolvedRole === 'supervisor' && !resolvedProjId) {
        return res.status(400).json({ error: 'برای سرپرست کارگاه باید پروژه مجاز انتخاب شود.' });
      }

      const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
      if (exists) {
        return res.status(409).json({ error: 'این نام کاربری قبلاً استفاده شده است.' });
      }

      const { hashHex, saltHex } = hashPassword(rawPass);
      const info = db
        .prepare(
          `INSERT INTO users (username, display_name, password_hash, password_salt, role, assigned_project_id, active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        )
        .run(
          cleanUser,
          String(display_name || cleanUser).trim(),
          hashHex,
          saltHex,
          resolvedRole,
          resolvedProjId
        );

      logAudit(
        req,
        'create',
        'user',
        Number(info.lastInsertRowid),
        resolvedProjId,
        `ایجاد کاربر جدید «${cleanUser}» با نقش ${resolvedRole === 'admin' ? 'مدیر کل' : 'سرپرست کارگاه'}`
      );
      res.json({ ok: true, id: Number(info.lastInsertRowid) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/users/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
      if (!existing) return res.status(404).json({ error: 'کاربر یافت نشد.' });

      const { display_name, role, assigned_project_id, active, new_password } = req.body;
      const nextRole = role === 'admin' ? 'admin' : role === 'supervisor' ? 'supervisor' : existing.role;
      const nextActive = active === undefined ? existing.active : Number(Boolean(active));
      const nextProjId =
        nextRole === 'admin'
          ? null
          : assigned_project_id !== undefined
          ? Number(assigned_project_id) || null
          : existing.assigned_project_id;

      // Prevent disabling or demoting the last active admin
      if (existing.role === 'admin' && (nextRole !== 'admin' || nextActive === 0)) {
        const activeAdmins = (
          db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(id) as {
            cnt: number;
          }
        ).cnt;
        if (activeAdmins === 0) {
          return res.status(400).json({ error: 'حداقل یک مدیر کل فعال باید در سیستم باقی بماند.' });
        }
      }

      let hashHex = existing.password_hash;
      let saltHex = existing.password_salt;
      if (new_password && String(new_password).length > 0) {
        if (String(new_password).length < 6) {
          return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
        }
        const hashed = hashPassword(String(new_password));
        hashHex = hashed.hashHex;
        saltHex = hashed.saltHex;
        db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
      }

      db.prepare(
        `UPDATE users SET display_name = ?, role = ?, assigned_project_id = ?, active = ?, password_hash = ?, password_salt = ?
         WHERE id = ?`
      ).run(
        String(display_name ?? existing.display_name).trim(),
        nextRole,
        nextProjId,
        nextActive,
        hashHex,
        saltHex,
        id
      );

      if (nextActive === 0) {
        db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
      }

      logAudit(req, 'update', 'user', id, nextProjId, `بروزرسانی دسترسی کاربر «${existing.username}»`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/users/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (id === req.authUser!.id) {
        return res.status(400).json({ error: 'نمی‌توانید حساب فعال خود را حذف کنید.' });
      }
      const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
      if (!existing) return res.status(404).json({ error: 'کاربر یافت نشد.' });

      if (existing.role === 'admin') {
        const otherAdmins = (
          db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(id) as {
            cnt: number;
          }
        ).cnt;
        if (otherAdmins === 0) {
          return res.status(400).json({ error: 'حداقل یک مدیر کل باید در سیستم باقی بماند.' });
        }
      }

      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      logAudit(req, 'delete', 'user', id, null, `حذف کاربر «${existing.username}»`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // Projects CRUD (Admin Only)
  // ==========================================================================
  app.post('/api/projects', requireAdmin, (req, res) => {
    try {
      const { name, description, color } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'نام پروژه الزامی است' });
      }
      const info = db
        .prepare('INSERT INTO projects (name, description, color, active) VALUES (?, ?, ?, 1)')
        .run(String(name).trim(), String(description || '').trim(), String(color || 'emerald').trim());
      const newId = Number(info.lastInsertRowid);
      logAudit(req, 'create', 'project', newId, newId, `ایجاد پروژه «${String(name).trim()}»`);
      res.json({ id: newId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/projects/:id', requireAdmin, (req, res) => {
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
      logAudit(req, 'update', 'project', id, id, `ویرایش پروژه «${String(name).trim()}»`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/projects/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT name FROM projects WHERE id = ?').get(id) as any;
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number };
      if (countRow.cnt <= 1) {
        return res.status(400).json({ error: 'حداقل یک پروژه باید در برنامه باقی بماند' });
      }
      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare('DELETE FROM locked_months WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM payments WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM workers WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        db.exec('COMMIT;');
      } catch (inner) {
        db.exec('ROLLBACK;');
        throw inner;
      }
      logAudit(req, 'delete', 'project', id, id, `حذف پروژه «${existing?.name || id}»`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // Workers CRUD & Wage History (Admin Only)
  // ==========================================================================
  app.post('/api/workers', requireAdmin, (req, res) => {
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
        fridays_off,
        carry_over_balance,
        fixed_allowance,
        fixed_allowance_label,
        fixed_deduction,
        fixed_deduction_label,
        notes,
      } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'نام کارگر الزامی است' });
      }
      const projId = Number(project_id) || 1;
      const stmt = db.prepare(`
        INSERT INTO workers (
          project_id, name, role, phone, wage_type, base_wage, overtime_rate,
          start_date, end_date, calc_mode, manual_worked_days, manual_absent_days, manual_overtime_hours,
          auto_count_days, fridays_off, carry_over_balance, fixed_allowance, fixed_allowance_label,
          fixed_deduction, fixed_deduction_label, active, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      const info = stmt.run(
        projId,
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
        fridays_off === undefined ? 0 : Number(Boolean(fridays_off)),
        Number(carry_over_balance) || 0,
        Number(fixed_allowance) || 0,
        String(fixed_allowance_label || 'حق غذا و ایاب‌وذهاب').trim(),
        Number(fixed_deduction) || 0,
        String(fixed_deduction_label || 'کسورات ثابت').trim(),
        String(notes || '').trim()
      );
      logAudit(req, 'create', 'worker', Number(info.lastInsertRowid), projId, `ثبت کارگر جدید «${String(name).trim()}»`);
      res.json({ id: Number(info.lastInsertRowid) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/workers/:id', requireAdmin, (req, res) => {
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
        fridays_off = existing.fridays_off,
        carry_over_balance = existing.carry_over_balance ?? 0,
        fixed_allowance = existing.fixed_allowance ?? 0,
        fixed_allowance_label = existing.fixed_allowance_label ?? 'حق غذا و ایاب‌وذهاب',
        fixed_deduction = existing.fixed_deduction ?? 0,
        fixed_deduction_label = existing.fixed_deduction_label ?? 'کسورات ثابت',
        active = existing.active,
        notes = existing.notes,
      } = req.body;

      const resolvedProjectId = Number(project_id) || existing.project_id || 1;

      db.prepare(`
        UPDATE workers
        SET project_id = ?, name = ?, role = ?, phone = ?, wage_type = ?, base_wage = ?, overtime_rate = ?,
            start_date = ?, end_date = ?, calc_mode = ?,
            manual_worked_days = ?, manual_absent_days = ?, manual_overtime_hours = ?,
            auto_count_days = ?, fridays_off = ?, carry_over_balance = ?,
            fixed_allowance = ?, fixed_allowance_label = ?, fixed_deduction = ?, fixed_deduction_label = ?,
            active = ?, notes = ?
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
        fridays_off === undefined ? Number(Boolean(existing.fridays_off)) : Number(Boolean(fridays_off)),
        Number(carry_over_balance) || 0,
        Number(fixed_allowance) || 0,
        String(fixed_allowance_label || 'حق غذا و ایاب‌وذهاب').trim(),
        Number(fixed_deduction) || 0,
        String(fixed_deduction_label || 'کسورات ثابت').trim(),
        active === undefined ? 1 : Number(Boolean(active)),
        String(notes || '').trim(),
        id
      );

      db.prepare('UPDATE payments SET project_id = ? WHERE worker_id = ?').run(resolvedProjectId, id);
      logAudit(req, 'update', 'worker', id, resolvedProjectId, `ویرایش پرونده کارگر «${String(name).trim()}»`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/workers/bulk-fridays-off', requireAdmin, (req, res) => {
    try {
      const { project_id, enabled } = req.body;
      const flag = enabled ? 1 : 0;
      db.exec('BEGIN TRANSACTION;');
      try {
        if (project_id !== undefined && project_id !== null && project_id !== 'all') {
          db.prepare(
            "UPDATE workers SET fridays_off = ?, manual_worked_days = NULL WHERE wage_type = 'daily' AND project_id = ?"
          ).run(flag, Number(project_id));
        } else {
          db.prepare(
            "UPDATE workers SET fridays_off = ?, manual_worked_days = NULL WHERE wage_type = 'daily'"
          ).run(flag);
        }
        db.exec('COMMIT;');
      } catch (inner) {
        db.exec('ROLLBACK;');
        throw inner;
      }
      logAudit(
        req,
        'bulk_update',
        'worker',
        null,
        project_id && project_id !== 'all' ? Number(project_id) : null,
        `تغییر وضعیت تعطیلی جمعه‌ها (${enabled ? 'فعال' : 'غیرفعال'})`
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/workers/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT name, project_id FROM workers WHERE id = ?').get(id) as any;
      db.prepare('DELETE FROM workers WHERE id = ?').run(id);
      logAudit(req, 'delete', 'worker', id, existing?.project_id || null, `حذف کارگر «${existing?.name || id}»`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Wage History
  app.post('/api/workers/:id/wage-history', requireAdmin, (req, res) => {
    try {
      const workerId = Number(req.params.id);
      const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(workerId) as any;
      if (!worker) return res.status(404).json({ error: 'کارگر یافت نشد' });

      const { effective_date, wage_type, base_wage, overtime_rate, note = '' } = req.body;
      if (!effective_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(effective_date))) {
        return res.status(400).json({ error: 'تاریخ شروع نرخ جدید معتبر نیست' });
      }
      const nextWageType = wage_type === 'monthly' ? 'monthly' : 'daily';
      const nextBaseWage = Number(base_wage) || 0;
      const nextOvertime = Number(overtime_rate) || 0;

      db.exec('BEGIN TRANSACTION;');
      try {
        // Seed initial baseline rate on start_date if this is the first history entry
        const existingHistCount = (
          db.prepare('SELECT COUNT(*) as cnt FROM wage_history WHERE worker_id = ?').get(workerId) as {
            cnt: number;
          }
        ).cnt;

        if (existingHistCount === 0 && worker.start_date && worker.start_date < String(effective_date)) {
          db.prepare(
            `INSERT INTO wage_history (worker_id, effective_date, wage_type, base_wage, overtime_rate, note)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(
            workerId,
            worker.start_date,
            worker.wage_type || 'daily',
            Number(worker.base_wage) || 0,
            Number(worker.overtime_rate) || 0,
            'نرخ اولیه قرارداد'
          );
        }

        const info = db
          .prepare(
            `INSERT INTO wage_history (worker_id, effective_date, wage_type, base_wage, overtime_rate, note)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(workerId, String(effective_date), nextWageType, nextBaseWage, nextOvertime, String(note || '').trim());

        // Sync latest effective rate <= today to workers table
        const todayIso = getTodayIso();
        const latestActive = db
          .prepare(
            `SELECT * FROM wage_history WHERE worker_id = ? AND effective_date <= ?
             ORDER BY effective_date DESC, id DESC LIMIT 1`
          )
          .get(workerId, todayIso) as any;

        if (latestActive) {
          db.prepare('UPDATE workers SET wage_type = ?, base_wage = ?, overtime_rate = ? WHERE id = ?').run(
            latestActive.wage_type,
            Number(latestActive.base_wage) || 0,
            Number(latestActive.overtime_rate) || 0,
            workerId
          );
        }

        db.exec('COMMIT;');
        logAudit(
          req,
          'create',
          'wage_history',
          Number(info.lastInsertRowid),
          worker.project_id,
          `ثبت تغییر دستمزد «${worker.name}» به ${nextBaseWage.toLocaleString('en-US')} تومان از تاریخ ${effective_date}`
        );
        res.json({ ok: true, id: Number(info.lastInsertRowid) });
      } catch (inner) {
        db.exec('ROLLBACK;');
        throw inner;
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/wage-history/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM wage_history WHERE id = ?').get(id) as any;
      if (!row) return res.status(404).json({ error: 'رکورد تاریخچه یافت نشد' });

      db.prepare('DELETE FROM wage_history WHERE id = ?').run(id);

      // Re-sync worker's current rate if other history remains
      const todayIso = getTodayIso();
      const latestActive = db
        .prepare(
          `SELECT * FROM wage_history WHERE worker_id = ? AND effective_date <= ?
           ORDER BY effective_date DESC, id DESC LIMIT 1`
        )
        .get(row.worker_id, todayIso) as any;

      if (latestActive) {
        db.prepare('UPDATE workers SET wage_type = ?, base_wage = ?, overtime_rate = ? WHERE id = ?').run(
          latestActive.wage_type,
          Number(latestActive.base_wage) || 0,
          Number(latestActive.overtime_rate) || 0,
          row.worker_id
        );
      }

      logAudit(req, 'delete', 'wage_history', id, null, `حذف رکورد تاریخچه دستمزد کارگر #${row.worker_id}`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // Month Lock & Period Carry-Over Close (Admin Only)
  // ==========================================================================
  app.post('/api/locks/toggle', requireAdmin, (req, res) => {
    try {
      const { project_id, shamsi_year, shamsi_month, lock, note = '' } = req.body;
      const projId = Number(project_id);
      const jy = Number(shamsi_year);
      const jm = Number(shamsi_month);
      if (!projId || !jy || jm < 1 || jm > 12) {
        return res.status(400).json({ error: 'اطلاعات پروژه یا ماه شمسی معتبر نیست.' });
      }

      if (lock) {
        db.prepare(
          `INSERT INTO locked_months (project_id, shamsi_year, shamsi_month, locked_by, note)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(project_id, shamsi_year, shamsi_month) DO UPDATE SET
             locked_by = excluded.locked_by,
             locked_at = CURRENT_TIMESTAMP,
             note = excluded.note`
        ).run(projId, jy, jm, req.authUser!.username, String(note || '').trim());
        logAudit(req, 'lock', 'month', `${jy}-${jm}`, projId, `قفل کردن دوره ${jy}/${jm} پروژه #${projId}`);
      } else {
        db.prepare('DELETE FROM locked_months WHERE project_id = ? AND shamsi_year = ? AND shamsi_month = ?').run(
          projId,
          jy,
          jm
        );
        logAudit(req, 'unlock', 'month', `${jy}-${jm}`, projId, `باز کردن قفل دوره ${jy}/${jm} پروژه #${projId}`);
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/periods/close', requireAdmin, (req, res) => {
    try {
      const { project_id, shamsi_year, shamsi_month, next_start_date, worker_carry_overs, lock_month = true } = req.body;
      const projId = Number(project_id);
      if (!projId || !next_start_date || !Array.isArray(worker_carry_overs)) {
        return res.status(400).json({ error: 'اطلاعات بستن دوره ناقص است.' });
      }

      db.exec('BEGIN TRANSACTION;');
      try {
        const updateWorker = db.prepare(`
          UPDATE workers
          SET carry_over_balance = ?,
              start_date = ?,
              end_date = NULL,
              manual_worked_days = NULL,
              manual_absent_days = 0,
              manual_overtime_hours = NULL
          WHERE id = ? AND project_id = ?
        `);
        const archivePayments = db.prepare(
          'UPDATE payments SET period_archived = 1 WHERE worker_id = ? AND payment_date < ?'
        );

        for (const item of worker_carry_overs) {
          const wid = Number(item.worker_id);
          const carry = Math.round(Number(item.carry_over_balance) || 0);
          updateWorker.run(carry, String(next_start_date), wid, projId);
          archivePayments.run(wid, String(next_start_date));
        }

        if (lock_month && shamsi_year && shamsi_month) {
          db.prepare(
            `INSERT INTO locked_months (project_id, shamsi_year, shamsi_month, locked_by, note)
             VALUES (?, ?, ?, ?, 'بستن دوره و انتقال مانده')
             ON CONFLICT(project_id, shamsi_year, shamsi_month) DO UPDATE SET
               locked_by = excluded.locked_by,
               locked_at = CURRENT_TIMESTAMP`
          ).run(projId, Number(shamsi_year), Number(shamsi_month), req.authUser!.username);
        }

        db.exec('COMMIT;');
      } catch (inner) {
        db.exec('ROLLBACK;');
        throw inner;
      }

      logAudit(
        req,
        'close_period',
        'project',
        projId,
        projId,
        `بستن دوره و انتقال مانده حساب ${worker_carry_overs.length} کارگر به تاریخ ${next_start_date}`
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // Daily Logs (Allowed for Admin AND Supervisor for their assigned project)
  // ==========================================================================
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

      const workerRow = db.prepare('SELECT id, name, project_id FROM workers WHERE id = ?').get(Number(worker_id)) as any;
      if (!workerRow) return res.status(404).json({ error: 'کارگر یافت نشد' });

      if (
        req.authUser!.role === 'supervisor' &&
        req.authUser!.assignedProjectId &&
        Number(workerRow.project_id) !== Number(req.authUser!.assignedProjectId)
      ) {
        return res.status(403).json({ error: 'شما فقط مجاز به ثبت حضور در پروژه خود هستید.' });
      }

      const sh = isoToShamsi(String(work_date));
      if (isMonthLocked(Number(workerRow.project_id), sh.jy, sh.jm)) {
        return res.status(423).json({
          error: 'این ماه قفل شده است و امکان تغییر کارکرد آن وجود ندارد. (مدیر می‌تواند قفل ماه را باز کند)',
        });
      }

      if (status === 'clear') {
        db.prepare('DELETE FROM daily_logs WHERE worker_id = ? AND work_date = ?').run(
          Number(worker_id),
          String(work_date)
        );
        logAudit(req, 'delete', 'daily_log', `${worker_id}:${work_date}`, workerRow.project_id, `بازنشانی کارکرد روزانه «${workerRow.name}» (${work_date})`);
        return res.json({ ok: true, cleared: true });
      }

      let computedDays = Number(days_equiv);
      if (isNaN(computedDays)) {
        if (status === 'present' || status === 'paid_leave') computedDays = 1;
        else if (status === 'half') computedDays = 0.5;
        else computedDays = 0;
      }

      const safeBonus = req.authUser!.role === 'supervisor' ? 0 : Number(bonus_amount) || 0;

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
        safeBonus,
        String(project_name || '').trim(),
        String(note || '').trim()
      );

      logAudit(
        req,
        'upsert',
        'daily_log',
        `${worker_id}:${work_date}`,
        workerRow.project_id,
        `ثبت حضور «${workerRow.name}» (${status}${Number(overtime_hours) > 0 ? `، ${overtime_hours}س اضافه‌کار` : ''})`
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/daily-log/bulk', (req, res) => {
    try {
      const { work_date, status = 'present', project_name = '', project_id } = req.body;
      if (!work_date) return res.status(400).json({ error: 'تاریخ الزامی است' });

      const resolvedProjectId =
        req.authUser!.role === 'supervisor'
          ? req.authUser!.assignedProjectId
          : project_id
          ? Number(project_id)
          : null;

      const sh = isoToShamsi(String(work_date));

      const activeWorkers = resolvedProjectId
        ? (db.prepare('SELECT id, project_id FROM workers WHERE active = 1 AND project_id = ?').all(resolvedProjectId) as Array<{
            id: number;
            project_id: number;
          }>)
        : (db.prepare('SELECT id, project_id FROM workers WHERE active = 1').all() as Array<{
            id: number;
            project_id: number;
          }>);

      const distinctProjectIds = Array.from(new Set(activeWorkers.map((w) => Number(w.project_id))));
      for (const pid of distinctProjectIds) {
        if (isMonthLocked(pid, sh.jy, sh.jm)) {
          return res.status(423).json({
            error: 'این ماه برای پروژه انتخاب‌شده قفل است و امکان ثبت گروهی وجود ندارد.',
          });
        }
      }

      const daysEquiv = status === 'present' || status === 'paid_leave' ? 1 : status === 'half' ? 0.5 : 0;

      const upsert = db.prepare(`
        INSERT INTO daily_logs
          (worker_id, work_date, shamsi_year, shamsi_month, shamsi_day, status, days_equiv, overtime_hours, bonus_amount, project_name, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, '')
        ON CONFLICT(worker_id, work_date) DO UPDATE SET
          status = excluded.status,
          days_equiv = excluded.days_equiv,
          project_name = CASE WHEN daily_logs.project_name = '' THEN excluded.project_name ELSE daily_logs.project_name END
      `);

      db.exec('BEGIN TRANSACTION;');
      try {
        for (const w of activeWorkers) {
          upsert.run(w.id, String(work_date), sh.jy, sh.jm, sh.jd, status, daysEquiv, String(project_name).trim());
        }
        db.exec('COMMIT;');
      } catch (inner) {
        db.exec('ROLLBACK;');
        throw inner;
      }

      logAudit(
        req,
        'bulk_upsert',
        'daily_log',
        String(work_date),
        resolvedProjectId,
        `ثبت گروهی حضور (${status}) برای ${activeWorkers.length} نفر در تاریخ ${work_date}`
      );
      res.json({ ok: true, count: activeWorkers.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Copy previous day's attendance statuses & overtime to selected work_date
  app.post('/api/daily-log/copy-previous', (req, res) => {
    try {
      const { work_date, project_id } = req.body;
      if (!work_date) return res.status(400).json({ error: 'تاریخ الزامی است' });

      const resolvedProjectId =
        req.authUser!.role === 'supervisor'
          ? req.authUser!.assignedProjectId
          : project_id && project_id !== 'all'
          ? Number(project_id)
          : null;

      const targetDate = String(work_date);
      const prevDate = addDaysIso(targetDate, -1);
      const sh = isoToShamsi(targetDate);

      const activeWorkers = resolvedProjectId
        ? (db.prepare('SELECT id, project_id FROM workers WHERE active = 1 AND project_id = ?').all(resolvedProjectId) as Array<{
            id: number;
            project_id: number;
          }>)
        : (db.prepare('SELECT id, project_id FROM workers WHERE active = 1').all() as Array<{
            id: number;
            project_id: number;
          }>);

      const distinctProjectIds = Array.from(new Set(activeWorkers.map((w) => Number(w.project_id))));
      for (const pid of distinctProjectIds) {
        if (isMonthLocked(pid, sh.jy, sh.jm)) {
          return res.status(423).json({ error: 'این ماه قفل است و امکان کپی از روز قبل وجود ندارد.' });
        }
      }

      const activeIds = new Set(activeWorkers.map((w) => w.id));
      const prevLogs = (
        db.prepare('SELECT * FROM daily_logs WHERE work_date = ?').all(prevDate) as Array<any>
      ).filter((l) => activeIds.has(Number(l.worker_id)));

      if (prevLogs.length === 0) {
        return res.status(400).json({ error: 'برای روز قبل رکورد ثبت‌شده‌ای وجود ندارد.' });
      }

      const upsert = db.prepare(`
        INSERT INTO daily_logs
          (worker_id, work_date, shamsi_year, shamsi_month, shamsi_day, status, days_equiv, overtime_hours, bonus_amount, project_name, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(worker_id, work_date) DO UPDATE SET
          status = excluded.status,
          days_equiv = excluded.days_equiv,
          overtime_hours = excluded.overtime_hours
      `);

      db.exec('BEGIN TRANSACTION;');
      try {
        for (const l of prevLogs) {
          upsert.run(
            l.worker_id,
            targetDate,
            sh.jy,
            sh.jm,
            sh.jd,
            l.status,
            l.days_equiv,
            l.overtime_hours || 0,
            l.project_name || '',
            l.note || ''
          );
        }
        db.exec('COMMIT;');
      } catch (inner) {
        db.exec('ROLLBACK;');
        throw inner;
      }

      logAudit(
        req,
        'copy_previous',
        'daily_log',
        targetDate,
        resolvedProjectId,
        `کپی وضعیت حضور ${prevLogs.length} نفر از ${prevDate} به ${targetDate}`
      );
      res.json({ ok: true, count: prevLogs.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // Payments & Receipt Photos (Admin Only)
  // ==========================================================================
  app.post('/api/payments', requireAdmin, (req, res) => {
    try {
      const {
        project_id,
        worker_id,
        payment_date,
        shamsi_year,
        shamsi_month,
        amount,
        payment_type,
        category = '',
        receipt_data = '',
        note,
      } = req.body;
      if (!worker_id || !amount || Number(amount) <= 0) {
        return res.status(400).json({ error: 'انتخاب کارگر و مبلغ معتبر الزامی است' });
      }
      const iso = payment_date || getTodayIso();
      const sh = isoToShamsi(iso);
      const jy = Number(shamsi_year) || sh.jy;
      const jm = Number(shamsi_month) || sh.jm;

      const workerRow = db.prepare('SELECT name, project_id FROM workers WHERE id = ?').get(Number(worker_id)) as any;
      const resolvedProjectId = Number(project_id) || workerRow?.project_id || 1;

      if (isMonthLocked(resolvedProjectId, jy, jm)) {
        return res.status(423).json({ error: 'این ماه قفل شده است. برای ثبت تراکنش ابتدا قفل ماه را باز کنید.' });
      }

      const validTypes = new Set(['advance', 'salary', 'deduction', 'allowance']);
      const safeType = validTypes.has(String(payment_type)) ? String(payment_type) : 'advance';

      let receiptFilename = '';
      if (receipt_data && typeof receipt_data === 'string' && receipt_data.startsWith('data:image/')) {
        receiptFilename = saveReceiptBase64(receipt_data);
      }

      const info = db
        .prepare(
          `INSERT INTO payments (project_id, worker_id, payment_date, shamsi_year, shamsi_month, amount, payment_type, category, receipt_path, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          resolvedProjectId,
          Number(worker_id),
          iso,
          jy,
          jm,
          Number(amount) || 0,
          safeType,
          String(category || '').trim(),
          receiptFilename,
          String(note || '').trim()
        );

      logAudit(
        req,
        'create',
        'payment',
        Number(info.lastInsertRowid),
        resolvedProjectId,
        `ثبت ${safeType} برای «${workerRow?.name || worker_id}» به مبلغ ${Number(amount).toLocaleString('en-US')} تومان`
      );
      res.json({ ok: true, id: Number(info.lastInsertRowid), receipt_path: receiptFilename });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/payments/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
      if (!existing) return res.status(404).json({ error: 'تراکنش مورد نظر یافت نشد' });

      if (isMonthLocked(Number(existing.project_id), Number(existing.shamsi_year), Number(existing.shamsi_month))) {
        return res.status(423).json({ error: 'ماه این تراکنش قفل شده است و امکان ویرایش ندارد.' });
      }

      const {
        project_id,
        worker_id = existing.worker_id,
        payment_date = existing.payment_date,
        shamsi_year,
        shamsi_month,
        amount = existing.amount,
        payment_type = existing.payment_type,
        category = existing.category || '',
        receipt_data,
        remove_receipt = false,
        note = existing.note,
      } = req.body;

      if (!worker_id || !amount || Number(amount) <= 0) {
        return res.status(400).json({ error: 'انتخاب کارگر و مبلغ معتبر الزامی است' });
      }

      const iso = String(payment_date || existing.payment_date || getTodayIso());
      const sh = isoToShamsi(iso);
      const jy = Number(shamsi_year) || sh.jy;
      const jm = Number(shamsi_month) || sh.jm;

      const workerRow = db.prepare('SELECT name, project_id FROM workers WHERE id = ?').get(Number(worker_id)) as any;
      const resolvedProjectId = Number(project_id) || workerRow?.project_id || existing.project_id || 1;

      if (isMonthLocked(resolvedProjectId, jy, jm)) {
        return res.status(423).json({ error: 'ماه مقصد قفل شده است.' });
      }

      const validTypes = new Set(['advance', 'salary', 'deduction', 'allowance']);
      const safeType = validTypes.has(String(payment_type)) ? String(payment_type) : 'advance';

      let receiptFilename = existing.receipt_path || '';
      if (remove_receipt && receiptFilename) {
        removeReceiptFileSafe(receiptFilename);
        receiptFilename = '';
      }
      if (receipt_data && typeof receipt_data === 'string' && receipt_data.startsWith('data:image/')) {
        if (receiptFilename) removeReceiptFileSafe(receiptFilename);
        receiptFilename = saveReceiptBase64(receipt_data);
      }

      db.prepare(`
        UPDATE payments
        SET project_id = ?, worker_id = ?, payment_date = ?, shamsi_year = ?, shamsi_month = ?,
            amount = ?, payment_type = ?, category = ?, receipt_path = ?, note = ?
        WHERE id = ?
      `).run(
        resolvedProjectId,
        Number(worker_id),
        iso,
        jy,
        jm,
        Number(amount) || 0,
        safeType,
        String(category || '').trim(),
        receiptFilename,
        String(note || '').trim(),
        id
      );

      logAudit(
        req,
        'update',
        'payment',
        id,
        resolvedProjectId,
        `ویرایش تراکنش «${workerRow?.name || worker_id}» به مبلغ ${Number(amount).toLocaleString('en-US')} تومان`
      );
      res.json({ ok: true, receipt_path: receiptFilename });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/payments/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
      if (!existing) return res.status(404).json({ error: 'تراکنش یافت نشد' });

      if (isMonthLocked(Number(existing.project_id), Number(existing.shamsi_year), Number(existing.shamsi_month))) {
        return res.status(423).json({ error: 'ماه این تراکنش قفل است و امکان حذف ندارد.' });
      }

      if (existing.receipt_path) {
        removeReceiptFileSafe(existing.receipt_path);
      }
      db.prepare('DELETE FROM payments WHERE id = ?').run(id);
      logAudit(req, 'delete', 'payment', id, existing.project_id, `حذف تراکنش مالی #${id} به مبلغ ${Number(existing.amount).toLocaleString('en-US')} تومان`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve Receipt Images securely (Admin Only + strict path confinement)
  app.get('/api/receipts/:filename', requireAdmin, (req, res) => {
    const filename = String(req.params.filename || '');
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(filename)) {
      return res.status(400).json({ error: 'نام فایل نامعتبر است' });
    }
    const resolvedPath = path.resolve(RECEIPTS_DIR, filename);
    if (!resolvedPath.startsWith(RECEIPTS_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'تصویر رسید یافت نشد' });
    }
    res.sendFile(resolvedPath);
  });

  // ==========================================================================
  // Audit Logs (Admin Only)
  // ==========================================================================
  app.get('/api/audit-logs', requireAdmin, (req, res) => {
    try {
      const limit = Math.max(10, Math.min(300, Number(req.query.limit) || 120));
      const entityType = String(req.query.entity_type || '').trim();
      const rows = entityType
        ? db
            .prepare('SELECT * FROM audit_logs WHERE entity_type = ? ORDER BY id DESC LIMIT ?')
            .all(entityType, limit)
        : db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
      res.json({ logs: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // Backup, Restore & Scheduled Auto-Backup / Telegram (Admin Only)
  // ==========================================================================
  app.get('/api/backup/settings', requireAdmin, (_req, res) => {
    const cfg = getAutoBackupConfig();
    res.json({
      settings: {
        enabled: cfg.enabled,
        intervalHours: cfg.intervalHours,
        keepCount: cfg.keepCount,
        telegramEnabled: cfg.telegramEnabled,
        telegramChatId: cfg.telegramChatId,
        hasTelegramToken: cfg.hasTelegramToken,
        lastRunAt: cfg.lastRunAt,
        lastStatus: cfg.lastStatus,
      },
      files: listAutoBackupFiles(),
    });
  });

  app.put('/api/backup/settings', requireAdmin, (req, res) => {
    try {
      const { enabled, intervalHours, keepCount, telegramEnabled, telegramChatId, telegramBotToken } = req.body;
      setMetaValue('auto_backup_enabled', enabled ? '1' : '0');
      setMetaValue('auto_backup_interval_hours', String(Math.max(1, Math.min(168, Number(intervalHours) || 24))));
      setMetaValue('auto_backup_keep_count', String(Math.max(3, Math.min(60, Number(keepCount) || 14))));
      setMetaValue('telegram_enabled', telegramEnabled ? '1' : '0');
      setMetaValue('telegram_chat_id', String(telegramChatId || '').trim());
      if (typeof telegramBotToken === 'string' && telegramBotToken.trim().length > 0) {
        setMetaValue('telegram_bot_token', telegramBotToken.trim());
      }
      logAudit(req, 'update', 'backup_settings', 'config', null, 'بروزرسانی تنظیمات بکاپ خودکار و تلگرام');
      const cfg = getAutoBackupConfig();
      res.json({
        ok: true,
        settings: {
          enabled: cfg.enabled,
          intervalHours: cfg.intervalHours,
          keepCount: cfg.keepCount,
          telegramEnabled: cfg.telegramEnabled,
          telegramChatId: cfg.telegramChatId,
          hasTelegramToken: cfg.hasTelegramToken,
          lastRunAt: cfg.lastRunAt,
          lastStatus: cfg.lastStatus,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/backup/run-now', requireAdmin, async (req, res) => {
    try {
      const result = await runAutoBackup('manual', req);
      res.json({ ok: true, ...result, files: listAutoBackupFiles() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/backup/auto-download/:filename', requireAdmin, (req, res) => {
    const filename = String(req.params.filename || '');
    if (!/^karkard-auto-[0-9_-]+\.sqlite$/.test(filename)) {
      return res.status(400).json({ error: 'نام فایل بکاپ نامعتبر است' });
    }
    const resolvedPath = path.resolve(AUTO_BACKUPS_DIR, filename);
    if (!resolvedPath.startsWith(AUTO_BACKUPS_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'فایل بکاپ یافت نشد' });
    }
    res.download(resolvedPath, filename);
  });

  app.delete('/api/backup/auto-delete/:filename', requireAdmin, (req, res) => {
    const filename = String(req.params.filename || '');
    if (!/^karkard-auto-[0-9_-]+\.sqlite$/.test(filename)) {
      return res.status(400).json({ error: 'نام فایل بکاپ نامعتبر است' });
    }
    const resolvedPath = path.resolve(AUTO_BACKUPS_DIR, filename);
    if (!resolvedPath.startsWith(AUTO_BACKUPS_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'فایل بکاپ یافت نشد' });
    }
    fs.unlinkSync(resolvedPath);
    logAudit(req, 'delete', 'backup', filename, null, `حذف فایل بکاپ خودکار ${filename}`);
    res.json({ ok: true, files: listAutoBackupFiles() });
  });

  app.get('/api/backup/sqlite', requireAdmin, (_req, res) => {
    try {
      db.exec('PRAGMA wal_checkpoint(FULL);');
      res.download(DB_PATH, `karkard-backup-${getTodayIso()}.sqlite`);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/backup/json', requireAdmin, (_req, res) => {
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        projects: db.prepare('SELECT * FROM projects').all(),
        workers: db.prepare('SELECT * FROM workers').all(),
        wage_history: db.prepare('SELECT * FROM wage_history').all(),
        locked_months: db.prepare('SELECT * FROM locked_months').all(),
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

  app.post('/api/restore/json', requireAdmin, (req, res) => {
    try {
      const { projects, workers, wage_history, locked_months, daily_logs, monthly_records, payments } = req.body;
      if (!Array.isArray(workers)) {
        return res.status(400).json({ error: 'فایل پشتیبان معتبر نیست' });
      }
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(
          'DELETE FROM payments; DELETE FROM monthly_records; DELETE FROM daily_logs; DELETE FROM wage_history; DELETE FROM locked_months; DELETE FROM workers;'
        );
        if (Array.isArray(projects) && projects.length > 0) {
          db.exec('DELETE FROM projects;');
          const insPr = db.prepare(
            'INSERT INTO projects (id, name, description, color, active, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          );
          for (const pr of projects) {
            insPr.run(pr.id, pr.name, pr.description ?? '', pr.color ?? 'emerald', pr.active ?? 1, pr.created_at ?? '');
          }
        }
        const existingProjects = db.prepare('SELECT id FROM projects ORDER BY id ASC').all() as Array<{ id: number }>;
        if (existingProjects.length === 0) {
          const info = db
            .prepare('INSERT INTO projects (name, description, color, active) VALUES (?, ?, ?, 1)')
            .run('پروژه الف', 'پروژه اصلی', 'emerald');
          existingProjects.push({ id: Number(info.lastInsertRowid) });
        }
        const validProjectIds = new Set(existingProjects.map((p) => Number(p.id)));
        const fallbackProjectId = Number(existingProjects[0].id);

        const insW = db.prepare(
          `INSERT INTO workers (
            id, project_id, name, role, phone, wage_type, base_wage, overtime_rate,
            start_date, end_date, calc_mode, manual_worked_days, manual_absent_days, manual_overtime_hours,
            auto_count_days, fridays_off, carry_over_balance, fixed_allowance, fixed_allowance_label,
            fixed_deduction, fixed_deduction_label, active, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const w of workers) {
          const resolvedProjId = validProjectIds.has(Number(w.project_id)) ? Number(w.project_id) : fallbackProjectId;
          insW.run(
            w.id,
            resolvedProjId,
            w.name,
            w.role ?? 'کارگر',
            w.phone ?? '',
            w.wage_type === 'monthly' ? 'monthly' : 'daily',
            Number(w.base_wage) || 0,
            Number(w.overtime_rate) || 0,
            w.start_date || getTodayIso(),
            w.end_date || null,
            w.calc_mode || 'to_today',
            w.manual_worked_days ?? null,
            w.manual_absent_days ?? 0,
            w.manual_overtime_hours ?? null,
            w.auto_count_days ?? 1,
            w.fridays_off ?? 0,
            Number(w.carry_over_balance) || 0,
            Number(w.fixed_allowance) || 0,
            w.fixed_allowance_label ?? 'حق غذا و ایاب‌وذهاب',
            Number(w.fixed_deduction) || 0,
            w.fixed_deduction_label ?? 'کسورات ثابت',
            w.active ?? 1,
            w.notes ?? '',
            w.created_at ?? ''
          );
        }
        if (Array.isArray(wage_history)) {
          const insWH = db.prepare(
            'INSERT INTO wage_history (id, worker_id, effective_date, wage_type, base_wage, overtime_rate, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const h of wage_history) {
            insWH.run(
              h.id,
              h.worker_id,
              h.effective_date,
              h.wage_type === 'monthly' ? 'monthly' : 'daily',
              Number(h.base_wage) || 0,
              Number(h.overtime_rate) || 0,
              h.note ?? '',
              h.created_at ?? ''
            );
          }
        }
        if (Array.isArray(locked_months)) {
          const insLM = db.prepare(
            'INSERT OR IGNORE INTO locked_months (project_id, shamsi_year, shamsi_month, locked_by, locked_at, note) VALUES (?, ?, ?, ?, ?, ?)'
          );
          for (const lm of locked_months) {
            insLM.run(
              validProjectIds.has(Number(lm.project_id)) ? Number(lm.project_id) : fallbackProjectId,
              lm.shamsi_year,
              lm.shamsi_month,
              lm.locked_by ?? 'admin',
              lm.locked_at ?? '',
              lm.note ?? ''
            );
          }
        }
        if (Array.isArray(daily_logs)) {
          const insL = db.prepare(
            'INSERT INTO daily_logs (id, worker_id, work_date, shamsi_year, shamsi_month, shamsi_day, status, days_equiv, overtime_hours, bonus_amount, project_name, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const l of daily_logs) {
            insL.run(
              l.id,
              l.worker_id,
              l.work_date,
              l.shamsi_year,
              l.shamsi_month,
              l.shamsi_day,
              l.status,
              l.days_equiv,
              l.overtime_hours,
              l.bonus_amount,
              l.project_name ?? '',
              l.note ?? ''
            );
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
            'INSERT INTO payments (id, project_id, worker_id, payment_date, shamsi_year, shamsi_month, amount, payment_type, category, receipt_path, period_archived, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const p of payments) {
            const resolvedProjId = validProjectIds.has(Number(p.project_id)) ? Number(p.project_id) : fallbackProjectId;
            insP.run(
              p.id,
              resolvedProjId,
              p.worker_id,
              p.payment_date,
              p.shamsi_year,
              p.shamsi_month,
              p.amount,
              p.payment_type,
              p.category ?? '',
              p.receipt_path ?? '',
              p.period_archived ?? 0,
              p.note ?? '',
              p.created_at ?? ''
            );
          }
        }
        db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('initial_seed_done', '1')").run();
        db.exec('COMMIT;');
        logAudit(req, 'restore', 'backup', 'json', null, `بازیابی پشتیبان JSON (${workers.length} کارگر)`);
        res.json({ ok: true });
      } catch (innerErr) {
        db.exec('ROLLBACK;');
        throw innerErr;
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'مسیر API یافت نشد' });
  });

  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Long-lived immutable caching for content-hashed Vite bundles
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    // Serve root files (PWA service worker, manifest, icons) with safe revalidation
    app.use(
      express.static(distPath, {
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.webmanifest' ||
            base.startsWith('workbox-')
          ) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KarkardYar SQLite Server listening on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });

  // Graceful shutdown: flush SQLite WAL & close HTTP server cleanly on SIGTERM/SIGINT
  let shuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] Received ${signal}, shutting down gracefully...`);
    clearInterval(autoBackupInterval);

    const forceTimer = setTimeout(() => {
      console.error('[Server] Forced exit after timeout');
      process.exit(1);
    }, 10000);
    forceTimer.unref();

    httpServer.close(() => {
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        db.close();
        console.log('[SQLite] WAL checkpointed and database closed cleanly.');
      } catch (err) {
        console.error('[SQLite] Error closing database:', err);
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();
