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
  headerTintBg: string;
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
    dotClass: 'bg-emerald-500',
    swatchClass: 'bg-emerald-600',
    activeTabBtn:
      'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs inset-ring inset-ring-white/15',
    inactiveTabBtn:
      'bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50',
    heroBanner: 'bg-linear-to-l from-emerald-950 via-emerald-900 to-teal-950',
    headerTintBg: 'bg-linear-to-l from-emerald-100/80 via-emerald-50/85 to-teal-50/50 border-emerald-200/80',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20',
    cardBorder: 'ring-emerald-500/30',
    cardSoftBg: 'bg-emerald-50/50',
    accentText: 'text-emerald-700',
    lightBg: 'bg-emerald-500/10',
    lightText: 'text-emerald-800',
    lightBorder: 'border-emerald-500/20',
  },
  indigo: {
    key: 'indigo',
    label: 'آبی لاجوردی',
    dotClass: 'bg-indigo-500',
    swatchClass: 'bg-indigo-600',
    activeTabBtn:
      'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs inset-ring inset-ring-white/15',
    inactiveTabBtn:
      'bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50',
    heroBanner: 'bg-linear-to-l from-zinc-950 via-indigo-950 to-indigo-900',
    headerTintBg: 'bg-linear-to-l from-indigo-100/80 via-indigo-50/85 to-blue-50/50 border-indigo-200/80',
    badgeClass: 'bg-indigo-500/10 text-indigo-700 ring-1 ring-inset ring-indigo-500/20',
    cardBorder: 'ring-indigo-500/30',
    cardSoftBg: 'bg-indigo-50/50',
    accentText: 'text-indigo-700',
    lightBg: 'bg-indigo-500/10',
    lightText: 'text-indigo-800',
    lightBorder: 'border-indigo-500/20',
  },
  amber: {
    key: 'amber',
    label: 'کهربایی گرم',
    dotClass: 'bg-amber-500',
    swatchClass: 'bg-amber-600',
    activeTabBtn:
      'bg-amber-600 text-white hover:bg-amber-700 shadow-xs inset-ring inset-ring-white/15',
    inactiveTabBtn:
      'bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50',
    heroBanner: 'bg-linear-to-l from-zinc-950 via-amber-950 to-amber-900',
    headerTintBg: 'bg-linear-to-l from-amber-100/80 via-amber-50/85 to-orange-50/50 border-amber-200/80',
    badgeClass: 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20',
    cardBorder: 'ring-amber-500/30',
    cardSoftBg: 'bg-amber-50/50',
    accentText: 'text-amber-700',
    lightBg: 'bg-amber-500/10',
    lightText: 'text-amber-800',
    lightBorder: 'border-amber-500/20',
  },
  violet: {
    key: 'violet',
    label: 'بنفش ارغوانی',
    dotClass: 'bg-violet-500',
    swatchClass: 'bg-violet-600',
    activeTabBtn:
      'bg-violet-600 text-white hover:bg-violet-700 shadow-xs inset-ring inset-ring-white/15',
    inactiveTabBtn:
      'bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50',
    heroBanner: 'bg-linear-to-l from-zinc-950 via-violet-950 to-purple-900',
    headerTintBg: 'bg-linear-to-l from-violet-100/80 via-violet-50/85 to-purple-50/50 border-violet-200/80',
    badgeClass: 'bg-violet-500/10 text-violet-700 ring-1 ring-inset ring-violet-500/20',
    cardBorder: 'ring-violet-500/30',
    cardSoftBg: 'bg-violet-50/50',
    accentText: 'text-violet-700',
    lightBg: 'bg-violet-500/10',
    lightText: 'text-violet-800',
    lightBorder: 'border-violet-500/20',
  },
  rose: {
    key: 'rose',
    label: 'زرشکی',
    dotClass: 'bg-rose-500',
    swatchClass: 'bg-rose-600',
    activeTabBtn:
      'bg-rose-600 text-white hover:bg-rose-700 shadow-xs inset-ring inset-ring-white/15',
    inactiveTabBtn:
      'bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50',
    heroBanner: 'bg-linear-to-l from-zinc-950 via-rose-950 to-rose-900',
    headerTintBg: 'bg-linear-to-l from-rose-100/80 via-rose-50/85 to-pink-50/50 border-rose-200/80',
    badgeClass: 'bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/20',
    cardBorder: 'ring-rose-500/30',
    cardSoftBg: 'bg-rose-50/50',
    accentText: 'text-rose-700',
    lightBg: 'bg-rose-500/10',
    lightText: 'text-rose-800',
    lightBorder: 'border-rose-500/20',
  },
  cyan: {
    key: 'cyan',
    label: 'فیروزه‌ای تیره',
    dotClass: 'bg-cyan-500',
    swatchClass: 'bg-cyan-600',
    activeTabBtn:
      'bg-cyan-600 text-white hover:bg-cyan-700 shadow-xs inset-ring inset-ring-white/15',
    inactiveTabBtn:
      'bg-white text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50',
    heroBanner: 'bg-linear-to-l from-zinc-950 via-cyan-950 to-teal-900',
    headerTintBg: 'bg-linear-to-l from-cyan-100/80 via-cyan-50/85 to-sky-50/50 border-cyan-200/80',
    badgeClass: 'bg-cyan-500/10 text-cyan-700 ring-1 ring-inset ring-cyan-500/20',
    cardBorder: 'ring-cyan-500/30',
    cardSoftBg: 'bg-cyan-50/50',
    accentText: 'text-cyan-700',
    lightBg: 'bg-cyan-500/10',
    lightText: 'text-cyan-800',
    lightBorder: 'border-cyan-500/20',
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
