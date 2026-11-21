import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { BarChart3, TrendingUp, Users, Wallet, CalendarCheck2 } from 'lucide-react';
import { AccruedToTodaySummary, DailyLog, PaymentRecord, Project, Worker } from '../types';
import { PERSIAN_MONTHS, formatToman, isoToShamsi, toPersianDigits } from '../utils/jalali';
import { getProjectTheme } from '../utils/projectThemes';

interface AnalyticsViewProps {
  todayIso: string;
  projects: Project[];
  workers: Worker[];
  allLogs: DailyLog[];
  allPayments: PaymentRecord[];
  allAccruedSummaries: AccruedToTodaySummary[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  todayIso,
  projects,
  workers,
  allLogs,
  allPayments,
  allAccruedSummaries,
}) => {
  const todayShamsi = isoToShamsi(todayIso);

  const totals = useMemo(() => {
    const gross = allAccruedSummaries.reduce((s, a) => s + a.grossEarnedToToday, 0);
    const paid = allAccruedSummaries.reduce((s, a) => s + a.paidToToday, 0);
    const net = allAccruedSummaries.reduce((s, a) => s + a.netPayableToToday, 0);
    const totalDays = allAccruedSummaries.reduce((s, a) => s + a.effectiveDaysToToday, 0);
    const totalOt = allAccruedSummaries.reduce((s, a) => s + a.effectiveOvertimeHours, 0);
    return { gross, paid, net, totalDays, totalOt };
  }, [allAccruedSummaries]);

  // Project comparison chart data (in Million Toman for readability)
  const projectComparisonData = useMemo(() => {
    return projects.map((pr, idx) => {
      const prWorkerIds = new Set(workers.filter((w) => (w.project_id || 1) === pr.id).map((w) => w.id));
      const prAcc = allAccruedSummaries.filter((a) => prWorkerIds.has(a.workerId));
      const gross = prAcc.reduce((s, a) => s + a.grossEarnedToToday, 0);
      const paid = prAcc.reduce((s, a) => s + a.paidToToday, 0);
      const net = prAcc.reduce((s, a) => s + a.netPayableToToday, 0);
      const days = prAcc.reduce((s, a) => s + a.effectiveDaysToToday, 0);
      return {
        id: pr.id,
        name: pr.name,
        color: getProjectTheme(pr.color, idx).dotClass,
        workersCount: prWorkerIds.size,
        days,
        gross,
        paid,
        net,
        grossM: Math.round((gross / 1_000_000) * 10) / 10,
        paidM: Math.round((paid / 1_000_000) * 10) / 10,
        netM: Math.round((Math.max(0, net) / 1_000_000) * 10) / 10,
      };
    });
  }, [projects, workers, allAccruedSummaries]);

  // Monthly payments trend across current Shamsi year (or months with data)
  const monthlyTrendData = useMemo(() => {
    const map = new Map<string, { jy: number; jm: number; paid: number; allowances: number; deductions: number }>();

    // Ensure last 6 Shamsi months always appear
    let curY = todayShamsi.jy;
    let curM = todayShamsi.jm;
    for (let i = 0; i < 6; i++) {
      const key = `${curY}-${String(curM).padStart(2, '0')}`;
      map.set(key, { jy: curY, jm: curM, paid: 0, allowances: 0, deductions: 0 });
      curM -= 1;
      if (curM < 1) {
        curM = 12;
        curY -= 1;
      }
    }

    for (const p of allPayments) {
      const key = `${p.shamsi_year}-${String(p.shamsi_month).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, { jy: p.shamsi_year, jm: p.shamsi_month, paid: 0, allowances: 0, deductions: 0 });
      }
      const bucket = map.get(key)!;
      if (p.payment_type === 'advance' || p.payment_type === 'salary') {
        bucket.paid += Number(p.amount || 0);
      } else if (p.payment_type === 'allowance') {
        bucket.allowances += Number(p.amount || 0);
      } else if (p.payment_type === 'deduction') {
        bucket.deductions += Number(p.amount || 0);
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([, item]) => ({
        label: `${PERSIAN_MONTHS[item.jm - 1] || item.jm} ${toPersianDigits(String(item.jy).slice(-2))}`,
        paid: item.paid,
        paidM: Math.round((item.paid / 1_000_000) * 100) / 100,
        allowances: item.allowances,
        deductions: item.deductions,
      }));
  }, [allPayments, todayShamsi.jy, todayShamsi.jm]);

  // Top workers by total gross earned
  const topWorkers = useMemo(() => {
    return workers
      .map((w) => {
        const acc = allAccruedSummaries.find((a) => a.workerId === w.id);
        return {
          worker: w,
          gross: acc?.grossEarnedToToday || 0,
          paid: acc?.paidToToday || 0,
          net: acc?.netPayableToToday || 0,
          days: acc?.effectiveDaysToToday || 0,
          ot: acc?.effectiveOvertimeHours || 0,
        };
      })
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 8);
  }, [workers, allAccruedSummaries]);

  // Attendance breakdown across logged days
  const attendanceStats = useMemo(() => {
    let present = 0;
    let half = 0;
    let leave = 0;
    let absent = 0;
    for (const l of allLogs) {
      if (l.status === 'present') present++;
      else if (l.status === 'half') half++;
      else if (l.status === 'paid_leave') leave++;
      else if (l.status === 'absent') absent++;
    }
    const total = present + half + leave + absent;
    return { present, half, leave, absent, total };
  }, [allLogs]);

  return (
    <div className="space-y-4">
      {/* Top KPI Stat Sheet */}
      <section className="bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 bg-zinc-50/70 border-b border-zinc-950/5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 className="text-sm font-extrabold text-zinc-950 tracking-tight">
              خلاصه مالی کل پروژه‌ها
            </h2>
          </div>
          <span className="text-xs text-zinc-500 font-mono-num">
            {toPersianDigits(projects.length)} پروژه · {toPersianDigits(workers.length)} کارگر
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-x-reverse divide-zinc-950/5 font-mono-num">
          <div className="p-4 sm:p-5">
            <span className="text-[11px] font-medium text-zinc-500 block">کل کارکرد ریالی</span>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-950 mt-1">
              {formatToman(totals.gross)}{' '}
              <span className="text-[11px] font-normal text-zinc-400">تومان</span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-[11px] font-medium text-zinc-500 block">جمع پرداخت‌شده</span>
            <div className="text-lg sm:text-xl font-extrabold text-amber-700 mt-1">
              {formatToman(totals.paid)}{' '}
              <span className="text-[11px] font-normal text-zinc-400">تومان</span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-[11px] font-medium text-zinc-500 block">مانده قابل پرداخت</span>
            <div className="text-lg sm:text-xl font-extrabold text-emerald-700 mt-1">
              {formatToman(totals.net)}{' '}
              <span className="text-[11px] font-normal text-zinc-400">تومان</span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-[11px] font-medium text-zinc-500 block">مجموع روز و اضافه‌کار</span>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-950 mt-1">
              {toPersianDigits(totals.totalDays)} روز{' '}
              <span className="text-xs font-bold text-sky-700">
                / {toPersianDigits(totals.totalOt)} س
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Project Cost Comparison */}
        <section className="lg:col-span-7 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-zinc-950 tracking-tight flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span>مقایسه هزینه پروژه‌ها (میلیون تومان)</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                کل کارکرد در برابر پرداختی و مانده هر پروژه
              </p>
            </div>
          </div>

          {projectComparisonData.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-xs text-zinc-400">
              داده‌ای برای نمایش وجود ندارد.
            </div>
          ) : (
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectComparisonData} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: any, name: any) => [`${toPersianDigits(val)} میلیون تومان`, String(name)]}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid rgba(9,9,11,0.1)',
                      fontSize: 12,
                      direction: 'rtl',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="grossM" name="کل کارکرد" fill="#18181b" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="paidM" name="پرداخت‌شده" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="netM" name="مانده" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Monthly Payments Trend */}
        <section className="lg:col-span-5 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="text-sm font-extrabold text-zinc-950 tracking-tight flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>روند پرداختی ماهانه (میلیون تومان)</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              مجموع مساعده و تسویه‌های ثبت‌شده به تفکیک ماه شمسی
            </p>
          </div>

          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrendData} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="paidGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(val: any) => [`${toPersianDigits(val)} میلیون تومان`, 'مجموع پرداختی']}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid rgba(9,9,11,0.1)',
                    fontSize: 12,
                    direction: 'rtl',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="paidM"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fill="url(#paidGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Bottom Row: Top Workers Cost Table + Attendance Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 bg-zinc-50/70 border-b border-zinc-950/5 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-zinc-950 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>کارکرد و پرداختی به تفکیک کارگر</span>
            </h3>
            <span className="text-xs text-zinc-500 font-mono-num">
              {toPersianDigits(topWorkers.length)} نفر برتر
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-zinc-50/50 text-zinc-500 border-b border-zinc-950/5">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">کارگر</th>
                  <th className="py-2.5 px-3 font-semibold">پروژه</th>
                  <th className="py-2.5 px-3 font-semibold">کارکرد</th>
                  <th className="py-2.5 px-3 font-semibold">کل کارکرد</th>
                  <th className="py-2.5 px-3 font-semibold">پرداختی</th>
                  <th className="py-2.5 px-4 font-semibold">مانده</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-950/5 font-mono-num">
                {topWorkers.map((row) => (
                  <tr key={row.worker.id} className="hover:bg-zinc-50/70">
                    <td className="py-3 px-4 font-sans">
                      <div className="font-bold text-zinc-950">{row.worker.name}</div>
                      <div className="text-[11px] text-zinc-500">{row.worker.role}</div>
                    </td>
                    <td className="py-3 px-3 font-sans text-zinc-600">
                      {row.worker.project_name || '—'}
                    </td>
                    <td className="py-3 px-3 text-zinc-900 font-semibold">
                      {toPersianDigits(row.days)} روز
                    </td>
                    <td className="py-3 px-3 text-zinc-900 font-bold">{formatToman(row.gross)} ت</td>
                    <td className="py-3 px-3 text-amber-700 font-semibold">
                      {formatToman(row.paid)} ت
                    </td>
                    <td className="py-3 px-4 text-emerald-700 font-extrabold">
                      {formatToman(row.net)} ت
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Attendance Log Distribution */}
        <section className="lg:col-span-4 bg-white ring-1 ring-zinc-950/10 shadow-2xs rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-extrabold text-zinc-950">آمار ثبت‌های حضور و غیاب</h3>
          </div>

          <div className="space-y-3 font-mono-num">
            {[
              { label: 'حاضر کامل', count: attendanceStats.present, color: 'bg-emerald-600' },
              { label: 'مرخصی باحقوق', count: attendanceStats.leave, color: 'bg-sky-600' },
              { label: 'نیم‌روز', count: attendanceStats.half, color: 'bg-amber-500' },
              { label: 'غایب / تعطیل', count: attendanceStats.absent, color: 'bg-rose-600' },
            ].map((item) => {
              const pct =
                attendanceStats.total > 0
                  ? Math.round((item.count / attendanceStats.total) * 100)
                  : 0;
              return (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-sans font-semibold text-zinc-700">{item.label}</span>
                    <span className="font-bold text-zinc-950">
                      {toPersianDigits(item.count)} ({toPersianDigits(pct)}٪)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.color} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-zinc-950/5 text-xs text-zinc-500 flex items-center justify-between font-mono-num">
            <span className="font-sans">مجموع رکوردهای ثبت‌شده</span>
            <strong className="text-zinc-950">{toPersianDigits(attendanceStats.total)} مورد</strong>
          </div>
        </section>
      </div>
    </div>
  );
};
