export type ProjectColorKey =
  | 'emerald'
  | 'indigo'
  | 'amber'
  | 'violet'
  | 'rose'
  | 'cyan';

export interface ProjectThemePalette {
  key: ProjectColorKey;
  label: string;
  dotClass: string;
  swatchClass: string;
  activeTabBtn: string;
  inactiveTabBtn: string;
  heroBanner: string;
  badgeClass: string;
  cardBorder: string;
  cardSoftBg: string;
  accentText: string;
  lightBg: string;
  lightText: string;
  lightBorder: string;
}

export const PROJECT_THEMES: Record<ProjectColorKey, ProjectThemePalette> = {
  emerald: {
    key: 'emerald',
    label: 'سبز زمردی',
    dotClass: 'bg-emerald-600',
    swatchClass: 'bg-emerald-700',
    activeTabBtn: 'bg-emerald-700 text-white hover:bg-emerald-800',
    inactiveTabBtn: 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/60',
    heroBanner: 'bg-gradient-to-l from-emerald-900 via-emerald-800 to-teal-900',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    cardBorder: 'border-emerald-200/80',
    cardSoftBg: 'bg-emerald-50/40',
    accentText: 'text-emerald-700',
    lightBg: 'bg-emerald-50',
    lightText: 'text-emerald-800',
    lightBorder: 'border-emerald-200',
  },
  indigo: {
    key: 'indigo',
    label: 'آبی لاجوردی',
    dotClass: 'bg-indigo-600',
    swatchClass: 'bg-indigo-700',
    activeTabBtn: 'bg-indigo-700 text-white hover:bg-indigo-800',
    inactiveTabBtn: 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50/60',
    heroBanner: 'bg-gradient-to-l from-slate-900 via-indigo-950 to-indigo-900',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
    cardBorder: 'border-indigo-200/80',
    cardSoftBg: 'bg-indigo-50/40',
    accentText: 'text-indigo-700',
    lightBg: 'bg-indigo-50',
    lightText: 'text-indigo-800',
    lightBorder: 'border-indigo-200',
  },
  amber: {
    key: 'amber',
    label: 'کهربایی گرم',
    dotClass: 'bg-amber-600',
    swatchClass: 'bg-amber-700',
    activeTabBtn: 'bg-amber-700 text-white hover:bg-amber-800',
    inactiveTabBtn: 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50/60',
    heroBanner: 'bg-gradient-to-l from-stone-900 via-amber-950 to-amber-900',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
    cardBorder: 'border-amber-200/80',
    cardSoftBg: 'bg-amber-50/40',
    accentText: 'text-amber-700',
    lightBg: 'bg-amber-50',
    lightText: 'text-amber-800',
    lightBorder: 'border-amber-200',
  },
  violet: {
    key: 'violet',
    label: 'بنفش ارغوانی',
    dotClass: 'bg-violet-600',
    swatchClass: 'bg-violet-700',
    activeTabBtn: 'bg-violet-700 text-white hover:bg-violet-800',
    inactiveTabBtn: 'bg-white text-slate-700 border-slate-200 hover:bg-violet-50/60',
    heroBanner: 'bg-gradient-to-l from-slate-900 via-violet-950 to-purple-900',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200/80',
    cardBorder: 'border-violet-200/80',
    cardSoftBg: 'bg-violet-50/40',
    accentText: 'text-violet-700',
    lightBg: 'bg-violet-50',
    lightText: 'text-violet-800',
    lightBorder: 'border-violet-200',
  },
  rose: {
    key: 'rose',
    label: 'زرشکی',
    dotClass: 'bg-rose-600',
    swatchClass: 'bg-rose-700',
    activeTabBtn: 'bg-rose-700 text-white hover:bg-rose-800',
    inactiveTabBtn: 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50/60',
    heroBanner: 'bg-gradient-to-l from-slate-900 via-rose-950 to-rose-900',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80',
    cardBorder: 'border-rose-200/80',
    cardSoftBg: 'bg-rose-50/40',
    accentText: 'text-rose-700',
    lightBg: 'bg-rose-50',
    lightText: 'text-rose-800',
    lightBorder: 'border-rose-200',
  },
  cyan: {
    key: 'cyan',
    label: 'فیروزه‌ای تیره',
    dotClass: 'bg-cyan-600',
    swatchClass: 'bg-cyan-700',
    activeTabBtn: 'bg-cyan-700 text-white hover:bg-cyan-800',
    inactiveTabBtn: 'bg-white text-slate-700 border-slate-200 hover:bg-cyan-50/60',
    heroBanner: 'bg-gradient-to-l from-slate-900 via-cyan-950 to-teal-900',
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200/80',
    cardBorder: 'border-cyan-200/80',
    cardSoftBg: 'bg-cyan-50/40',
    accentText: 'text-cyan-700',
    lightBg: 'bg-cyan-50',
    lightText: 'text-cyan-800',
    lightBorder: 'border-cyan-200',
  },
};

export const PROJECT_COLOR_KEYS: ProjectColorKey[] = [
  'emerald',
  'indigo',
  'amber',
  'violet',
  'rose',
  'cyan',
];

export function getProjectTheme(color?: string | null, fallbackIndex = 0): ProjectThemePalette {
  if (color && color in PROJECT_THEMES) {
    return PROJECT_THEMES[color as ProjectColorKey];
  }
  const key = PROJECT_COLOR_KEYS[fallbackIndex % PROJECT_COLOR_KEYS.length];
  return PROJECT_THEMES[key];
}
